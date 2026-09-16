/* A chart-specific purchase entry. Viewing this dialog never uploads a chart or creates an order. */
(function (root) {
  'use strict';
  const REPORT_ID = /^[a-f0-9]{48}$/;
  const ACCOUNT_ID = /^[a-f0-9]{64}$/;
  const attempts = new Map();
  let active = null, sequence = 0;
  const sdk = () => root.zxMember;
  const state = () => sdk() && typeof sdk().snapshot === 'function' ? sdk().snapshot() : {};
  function owner() {
    const value = state();
    return value.authenticated === true && value.identityKind === 'wechat' && ACCOUNT_ID.test(value.accountRef || '') ? value.accountRef : '';
  }
  const consent = () => !!(root.ZxPrivacyConsent && root.ZxPrivacyConsent.has('device_account'));
  const available = () => !!(sdk() && sdk().paidReportServiceAvailable && sdk().paidReportServiceAvailable());
  const purchasable = () => !!(available() && sdk().paidReportPurchaseReady && sdk().paidReportPurchaseReady());
  function fail(code) { const error = new Error(code); error.code = code; return error; }
  function checkedEntry(value) {
    const input = value && value.input;
    if (!value || typeof value.id !== 'string' || !value.id || value.id.length > 128 || !input ||
        typeof input.d !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(input.d) ||
        typeof input.t !== 'string' || (input.t && !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(input.t)) ||
        typeof input.c !== 'string' || !input.c.trim() || input.c.length > 60 ||
        !['', '男', '女', '其他'].includes(input.g)) return null;
    // An invalid attached report is an error, never a reason to silently prepare another.
    if (value.reportId != null && value.reportId !== '' && !REPORT_ID.test(value.reportId)) return null;
    return { id: value.id, name: typeof value.name === 'string' ? value.name.slice(0, 80) : '',
      reportId: value.reportId || '', input: { d: input.d, t: input.t, c: input.c.trim(), g: input.g } };
  }
  function route(page, id, hash) {
    if(page==='account')page='profile';
    const source = /\/(web|v1)\/[^/]*$/.test(location.pathname);
    const filename = page === 'home' ? (source ? 'index' : 'app') : page;
    const url = new URL(source ? '../web/' + filename + '.html' : './' + filename + '.html', location.href);
    if (id && REPORT_ID.test(id)) url.searchParams.set('report', id);
    const local = location.protocol === 'file:' || /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
    if (local) {
      url.searchParams.set('private-report', '1');
      const params = new URLSearchParams(location.search);
      ['api', 'deep'].forEach(key => {
        try {
          const endpoint = new URL(params.get(key));
          if (/^https?:$/.test(endpoint.protocol) && /^(localhost|127\.0\.0\.1|\[::1\])$/.test(endpoint.hostname) &&
              !endpoint.username && !endpoint.password && !endpoint.search && !endpoint.hash) url.searchParams.set(key, endpoint.href.replace(/\/$/, ''));
        } catch (_) {}
      });
    }
    if (hash) url.hash = hash;
    return url.href;
  }
  function node(tag, value, cls) {
    const item = document.createElement(tag);
    if (value != null) item.textContent = String(value);
    if (cls) item.className = 'profile-purchase-' + cls;
    return item;
  }
  function button(label, action, cls) {
    const item = node('button', label, cls || 'button'); item.type = 'button';
    item.addEventListener('click', action); return item;
  }
  function link(label, href) {
    const item = node('a', label, 'link'); item.href = href; return item;
  }
  function style() {
    if (document.getElementById('profile-purchase-style')) return;
    const sheet = node('style'); sheet.id = 'profile-purchase-style';
    sheet.textContent = '.profile-purchase-dialog{position:fixed;inset:0;margin:auto;box-sizing:border-box;width:min(460px,calc(100vw - 28px));max-height:calc(100dvh - 36px);padding:24px;border:1px solid #c9a85c55;border-radius:18px;background:#131b2b;color:#e8e4d8;overflow:auto;font:14px/1.7 system-ui,-apple-system,sans-serif}.profile-purchase-dialog::backdrop{background:#050916b8;backdrop-filter:blur(5px)}.profile-purchase-top{display:flex;align-items:center;justify-content:space-between;gap:14px}.profile-purchase-title{margin:0;font-size:23px;font-family:Songti SC,STSong,serif;color:#e4cf97}.profile-purchase-close{border:0;padding:8px;min-width:44px;min-height:44px;background:none;color:#b9c2d2;font:inherit;cursor:pointer}.profile-purchase-price{margin:18px 0 8px;color:#e4cf97;font-size:30px}.profile-purchase-note,.profile-purchase-status{color:#b4bfd0;font-size:13px}.profile-purchase-chart{margin:18px 0;padding:13px 15px;border-radius:10px;background:#0c1321;border:1px solid #c9a85c28;overflow-wrap:anywhere}.profile-purchase-chart strong,.profile-purchase-chart span{display:block}.profile-purchase-chart span{margin-top:5px;color:#b4bfd0;font-size:13px}.profile-purchase-benefits{margin:12px 0;padding-left:19px;color:#d1d8e4;font-size:13px}.profile-purchase-field{display:block;margin:16px 0 12px}.profile-purchase-select{display:block;box-sizing:border-box;width:100%;height:44px;margin-top:6px;padding:8px;border:1px solid #677184;border-radius:8px;background:#0c1321;color:#e8e4d8;font:inherit}.profile-purchase-check{display:flex;align-items:flex-start;gap:9px;margin:12px 0;color:#c4cedd;font-size:12px}.profile-purchase-check input{flex:none;width:18px;height:18px;min-height:18px;padding:0;margin:3px 0 0;accent-color:#c9a85c}.profile-purchase-button{display:block;width:100%;min-height:46px;margin-top:16px;padding:10px 12px;border:1px solid #c9a85c88;border-radius:10px;background:#c9a85c16;color:#e4cf97;font:inherit;cursor:pointer}.profile-purchase-button:disabled{opacity:.5;cursor:default}.profile-purchase-link{display:inline-block;margin:8px 14px 0 0;color:#d6c391;text-underline-offset:4px}.profile-purchase-dialog :focus-visible{outline:2px solid #f1d38a;outline-offset:3px}.profile-purchase-status{overflow-wrap:anywhere}.profile-purchase-dialog [hidden]{display:none!important}@media(max-width:380px){.profile-purchase-dialog{padding:18px}.profile-purchase-title{font-size:21px}}';
    document.head.append(sheet);
  }
  function current(view) { return active === view && view.dialog.open && view.epoch === sequence; }
  function clearPrivate(view, message) {
    if (!current(view)) return;
    view.invalidated = true;
    view.body.replaceChildren(node('p', message, 'status'), link('账号登录与已购恢复', route('account', '', 'account-status')));
  }
  function same(view) {
    if (!current(view) || view.invalidated) return false;
    if (owner() === view.owner && (!view.owner || consent())) return true;
    clearPrivate(view, '账号或账号使用同意已变化，请关闭后重新选择这张盘。'); return false;
  }
  function close(restore = true) {
    const view = active;
    if (!view) return;
    active = null; ++sequence;
    if (view.dialog.open) view.dialog.close();
    view.dialog.remove();
    if (restore !== false) {
      view.returnFocus?.focus?.();
      if (!view.invalidated && typeof view.options.onReturn === 'function') view.options.onReturn();
    }
  }
  function checkout(view, id) {
    if (!same(view) || !view.owner) return;
    const api = root.ZxPaidReports;
    if (api && typeof api.checkoutReport === 'function' && typeof api.isPrivate === 'function' && api.isPrivate()) api.checkoutReport(id);
    else root.location.assign(route('account', id, 'report-purchase'));
  }
  function statusMessage(error) {
    if(error?.code==='SIM_INPUT_NOT_SUPPORTED')return '静态演示只支持预置资料。自填资料请使用本地报告测试服务，不会套用其他盘面。';
    const code = String(error && error.code || '');
    if (/AUTH|SESSION|TOKEN|ACCOUNT_CHANGED|PRIVACY_CONSENT/.test(code)) return '登录状态已变化，请关闭后登录原微信账号再继续。';
    if (/EXPIRED|CONTENT_DELETED/.test(code)) return '这份报告已到期或内容已删除，请先到报告与订单中确认状态。';
    if (/NOT_FOUND|NOT_OWNED/.test(code)) return '当前账号无法确认这份报告，请登录原微信账号后查看。';
    if (/BIRTH|CITY|MINIMUM_AGE|REPORT_INPUT_|REPORT_TIME_REQUIRED|REPORT_GENDER_REQUIRED|REQUEST_INVALID/.test(code)) return '这张盘的出生资料还需核对，请补全准确的日期、时间、地点和排盘性别后继续。';
    if (/SERVICE_UNAVAILABLE|SALES_NOT_APPROVED/.test(code)) return '购买服务暂未开放，可以先保留本机图谱。';
    return '';
  }
  async function readBound(view, id) {
    const live = node('p', '正在核对这份报告的归属与状态…', 'status'); live.setAttribute('role', 'status');
    view.body.append(live);
    try {
      await sdk().freshAccessToken();
      if (!same(view)) return;
      const result = await sdk().paidReportRead(id, 'status');
      if (!same(view)) return;
      if (!result || result.report_id !== id || !['active', 'unpaid', 'revoked'].includes(result.entitlement_status)) throw fail('REPORT_RESPONSE_INVALID');
      live.textContent = result.entitlement_status === 'active' ? '这张盘已有已购报告，可继续查看交付与阅读状态。' :
        result.entitlement_status === 'unpaid' ? '已找到这张盘的待购买报告，继续核对购买条款即可。' : '这份报告的权益已撤销，可到报告与订单查看处理状态。';
      const action = button(result.entitlement_status === 'unpaid' ? '继续购买这份报告' : '查看已有报告', () => checkout(view, id));
      if (result.entitlement_status === 'unpaid' && !purchasable()) { action.disabled = true; action.textContent = '购买暂未开放'; }
      view.body.append(action);
    } catch (error) {
      if (!same(view)) return;
      live.textContent = statusMessage(error) || '暂时无法确认这份报告。请先查看已有报告与订单，确认后再继续。';
      view.body.append(link('查看报告与订单', route('account', id, 'report-purchase')));
    }
  }
  function check(view, label) {
    const wrap = node('label', null, 'check'), input = node('input'); input.type = 'checkbox';
    wrap.append(input, node('span', label)); view.body.append(wrap); return { wrap, input };
  }
  async function bindPrepared(view, record) {
    if (!same(view) || !record.reportId) return false;
    try {
      if (typeof view.options.onPrepared === 'function') await view.options.onPrepared(record.reportId);
    } catch (_) {
      if (!same(view)) return false;
      if (!view.bindingError) {
        view.bindingError = node('p', '这张盘已在账号中准备，但本机图谱关联尚未保存。请检查浏览器存储后重试，也可从报告与订单中恢复这份报告。', 'status');
        view.bindingError.setAttribute('role', 'alert');
        view.body.append(view.bindingError, link('查看已有报告与订单', route('account', record.reportId, 'report-purchase')));
      }
      return false;
    }
    return same(view);
  }
  async function purchaseForm(view) {
    const entry = view.entry;
    const key = view.owner + ':' + JSON.stringify([entry.id, entry.input]);
    let record = attempts.get(key);
    if (!record) { record = { phase: 'idle', reportId: '', promise: null }; attempts.set(key, record); }
    if (record.reportId) {
      if (!await bindPrepared(view, record)) return;
      return readBound(view, record.reportId);
    }
    const field = node('label', '这张盘的资料属于', 'field'), subject = node('select', null, 'select');
    [['', '请选择资料归属'], ['self', '本人'], ['other', '亲友（已获得本人授权）']].forEach(([value, label]) => {
      const option = node('option', label); option.value = value; subject.append(option);
    });
    subject.setAttribute('aria-label', '这张盘的资料属于'); field.append(subject); view.body.append(field);
    const permission = check(view, '我已获得资料主体授权，可为其上传、保存出生资料并购买本报告。'); permission.wrap.hidden = true;
    const transfer = check(view, '我同意将上方出生日期、时间、地点及排盘性别传至独立测试服务，用于生成本次报告；资料处理后不在服务端保存。');
    const storage = check(view, '我同意在当前浏览器保存测试出生资料、报告草稿与模拟订单。清除浏览器数据或重置测试后会丢失，不能跨设备恢复。');
    view.body.append(node('p', '下一步将核对正式条款与购买人年满18周岁的确认，再进入支付。首次使用 AI 问星另行确认。', 'note'));
    const live = node('p', record.phase === 'unknown' ? '上次准备结果尚未确认。继续核对会恢复同一盘面，请勿换一张盘重复操作。' : '', 'status');
    live.setAttribute('role', 'status'); view.body.append(live);
    const submit = button('核对并继续购买', async () => {
      if (!same(view) || !valid() || !purchasable() || record.phase === 'pending') return;
      if (record.reportId) { if (await bindPrepared(view, record)) checkout(view, record.reportId); return; }
      const account = view.owner;
      record.phase = 'pending'; update(); live.textContent = '正在为当前账号核对这张盘…';
      // Preserve this attempt across closing/reopening the dialog. The server
      // deduplicates prepare by account + chart identity + report edition.
      record.promise = (async () => {
        await sdk().freshAccessToken();
        if (owner() !== account || !consent()) throw fail('REPORT_ACCOUNT_CHANGED');
        // Consent belongs to this still-open confirmation, not to a later view.
        if (!same(view)) throw fail('REPORT_CONFIRMATION_CANCELLED');
        const result = await sdk().paidReportPrepare(entry.input, { transferConfirmed: true, storageConfirmed: true,
          subjectIsSelf: subject.value === 'self', permissionConfirmed: permission.input.checked });
        if (owner() !== account || !consent()) throw fail('REPORT_ACCOUNT_CHANGED');
        if (!result || !REPORT_ID.test(result.report_id || '')) throw fail('REPORT_RESPONSE_INVALID');
        record.reportId = result.report_id; record.phase = 'ready';
        return result.report_id;
      })();
      try {
        await record.promise;
        if (!await bindPrepared(view, record)) return;
        if (typeof view.options.onChanged === 'function') view.options.onChanged();
        checkout(view, record.reportId);
      } catch (error) {
        if (!record.reportId) record.phase = 'unknown';
        if (!same(view)) return;
        live.textContent = statusMessage(error) || '准备结果尚未确认。再次核对会恢复同一盘面；也可先查看报告与订单。';
      } finally { if (same(view)) update(); }
    });
    function valid() { return ['self', 'other'].includes(subject.value) && transfer.input.checked && storage.input.checked && (subject.value === 'self' || permission.input.checked); }
    function update() {
      permission.wrap.hidden = subject.value !== 'other';
      submit.disabled = !valid() || record.phase === 'pending' || !purchasable();
      submit.textContent = record.phase === 'pending' ? '正在核对这张盘…' : record.phase === 'unknown' ? '继续核对同一盘面' : '核对并继续购买';
    }
    [subject, permission.input, transfer.input, storage.input].forEach(input => input.addEventListener('change', update));
    view.body.append(submit); update();
    if (record.phase === 'pending' && record.promise) {
      live.textContent = '上次确认仍在处理中，正在等待同一盘面的结果…';
      record.promise.then(async () => {
        if (!await bindPrepared(view, record)) return;
        live.textContent = '这张盘已核对完成，可以继续购买。';
        submit.remove(); view.body.append(button('继续购买这份报告', () => checkout(view, record.reportId)));
      }).catch(error => {
        if (!same(view)) return;
        live.textContent = statusMessage(error) || '准备结果尚未确认，请继续核对同一盘面。'; update();
      });
    }
  }
  async function open(options) {
    close(false); style();
    const dialog = node('dialog', null, 'dialog'), top = node('div', null, 'top'), title = node('h2', '购买深度报告', 'title');
    title.id = 'profile-purchase-title'; dialog.setAttribute('aria-labelledby', title.id);
    top.append(title, button('关闭', close, 'close')); dialog.append(top);
    const returnFocus = document.activeElement;
    const body = node('div'); dialog.append(body, button(options?.returnLabel || '返回我的资料', () => close(), 'button')); document.body.append(dialog); dialog.showModal();
    const view = { options: options || {}, entry: checkedEntry(options && options.entry), owner: owner(), epoch: ++sequence, dialog, body, returnFocus };
    active = view;
    dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
    dialog.addEventListener('close', () => { if (active === view) close(); });
    if (!view.entry) {
      body.append(node('p', '请先选定一张资料完整的图谱，核对准确出生时间、地点和排盘性别后购买。', 'status')); return;
    }
    const entry = view.entry, chart = node('div', null, 'chart');
    chart.append(node('strong', entry.name || '当前选中的图谱'), node('span', entry.input.d + ' · ' + (entry.input.t || '时间待补全') + ' · ' + (entry.input.g || '排盘性别待补全')), node('span', entry.input.c));
    body.append(node('p', '¥19.90 / 盘', 'price'), node('p', '完整五章报告 · 成功交付赠1次本盘问星', 'note'), chart);
    const benefits = node('ul', null, 'benefits');
    ['围绕这张盘展开人格、关系、行动与时间解读。', '一次付费，报告成功交付后可在线阅读6个月，保存期内可下载全文。', '每份已购报告可免费更正一次出生资料，保存期限不重置。'].forEach(text => benefits.append(node('li', text)));
    body.append(benefits, link('购买须知', route('purchase-notice')), link('隐私与保存说明', route('privacy')));
    if (!entry.input.t || !['男', '女'].includes(entry.input.g)) {
      const edit = new URL(route('home')); edit.searchParams.set('edit-chart', entry.id);
      body.append(node('p', '这张本机基础盘还缺少准确出生时间或排盘性别，补充后可继续核对购买信息。修改本机资料不会更改账号内的已购报告。', 'status'),
        link('补充这张图谱的资料', edit.href));
      if (!purchasable()) body.append(node('p', '购买服务当前暂未开放，可以先补全本机资料。', 'status'));
      return;
    }
    if (!available()) {
      const disabled = button('购买暂未开放', () => {}); disabled.disabled = true;
      body.append(node('p', '报告购买服务暂未开放。你可以查看购买明细，当前不会上传出生资料或创建订单。', 'status'), disabled); return;
    }
    if (!view.owner || !consent()) {
      body.append(node('p', '请先使用微信登录并确认账号功能，再为当前选中的图谱购买报告。登录后可从“我的资料”继续选择这张盘。', 'status'),
        link('登录后继续购买', route('account', entry.reportId, 'account-status'))); return;
    }
    if (entry.reportId) return readBound(view, entry.reportId);
    if (!purchasable()) {
      const disabled = button('购买暂未开放', () => {}); disabled.disabled = true;
      body.append(node('p', '当前暂不接受新购买。已有报告仍可从账号中恢复查看。', 'status'), disabled); return;
    }
    return purchaseForm(view);
  }
  root.ZxProfilePurchase = Object.freeze({ open, close });
  root.addEventListener('zx-private-session-cleared', () => { attempts.clear(); if (active) clearPrivate(active, '账号会话已清除，请重新登录后选择图谱。'); });
  root.addEventListener('focus', () => { if (active) same(active); });
  ['zx-birth-local-cleared','zx-local-data-cleared'].forEach(event=>root.addEventListener(event,()=>close(false)));
})(window);
