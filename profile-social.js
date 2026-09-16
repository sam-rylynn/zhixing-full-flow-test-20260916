/* My profile: account-owned synastry records and independent invitations. */
(() => {
  'use strict';
  const ID = /^[a-f0-9]{64}$/;
  const REPORT_ID = /^[a-f0-9]{48}$/;
  const LABELS = Object.freeze({waiting_reports:'等待双方报告与确认',queued:'等待生成',running:'正在生成',ready:'可阅读',failed:'生成待处理',unavailable:'当前不可阅读',removed:'已解除',active:'待回应',accepted:'已接受',revoked:'已撤回',expired:'已过期'});
  const MESSAGES = Object.freeze({
    SYN_DISABLED:'合盘服务暂未开放。你可以先保留自己的资料，开放后再邀请好友。',
    REPORT_SERVICE_UNAVAILABLE:'账号与合盘服务暂未开放，当前无法读取真实合盘记录或生成邀请。',
    PRIVACY_CONSENT_REQUIRED:'请先在“我的资料”阅读并确认账号资料用途，再返回这里。',
    WECHAT_AUTHENTICATION_REQUIRED:'请先在“我的资料”完成微信身份验证，再返回查看自己的合盘与邀请。',
    AUTH_REQUIRED:'账号会话已失效，请到“我的资料”重新登录。',
    REPORT_ACCOUNT_CHANGED:'账号已切换，原账号的合盘信息已清除，请重新打开。',
    SYN_UNAVAILABLE:'暂时无法连接合盘服务，请稍后刷新。',
    RATE_LIMITED:'操作较频繁，请稍后再试。',
    CURSOR_INVALID:'记录分页已失效，请刷新记录后继续查看。',
    PAIR_RECONFIRM_REQUIRED:'报告资料已变化，请双方重新确认并建立合盘。',
    REPORT_UNAVAILABLE:'所选报告当前不可用于合盘，请核对报告是否已交付并仍然有效。',
    REPORT_REQUIRED:'请先选择自己已交付且有效的报告。',
    PARTICIPANT_INELIGIBLE:'合盘当前仅向已满 18 周岁的本人开放。',
    CONSENT_REQUIRED:'请单独勾选本次合盘同意后再继续。',
    AI_CONSENT_REQUIRED:'AI 建议的同意版本已更新，请重新打开并阅读。',
    ACCOUNT_UNAVAILABLE:'未找到可邀请的知星号，请核对后再试。',
    INVITE_UNAVAILABLE:'这份邀请当前不可接受，可能已撤回、过期或已由其他人接受。',
    NOT_FOUND:'未找到当前账号可查看的邀请或合盘。',
    PAIR_UNAVAILABLE:'这份共同解读当前不可阅读。',
    SUPPORT_REQUIRED:'本次生成已多次失败，请联系客服处理。',
    USE_PAIR_UNLINK:'邀请已经接受，请到合盘记录管理共同阅读。',
    IDEMPOTENCY_CONFLICT:'本次邀请的资料已变化，请重新选择报告并确认。',
    DISPLAY_NAME_INVALID:'邀请署名有误，请到我的资料修改昵称。',
    POLICY_UNAVAILABLE:'合盘说明暂未载入，请刷新页面后重试。'
  });
  let active = null;
  let generation = 0;
  const el = (tag, text, className) => {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = String(text ?? '');
    if (className) node.className = className;
    return node;
  };
  const $ = id => document.getElementById(id);
  const snapshot = () => window.zxMember?.snapshot?.() || {};
  const status = value => LABELS[value] || '状态待确认';
  const date = value => Number.isSafeInteger(value) && value > 0
    ? new Date(value).toLocaleDateString('zh-CN',{timeZone:'Asia/Shanghai'}) : '';
  const usableReport = report => report && REPORT_ID.test(report.report_id || '') && report.readable === true &&
    report.entitlement_status === 'active' && report.delivery_status === 'ready' && !report.unavailable_reason && report.refund_status !== 'pending' &&
    Number.isSafeInteger(report.expires_at ?? report.storage_expires_at) && (report.expires_at ?? report.storage_expires_at) > Date.now();
  function button(text, fn, className) {
    const node = el('button',text,className || 'social-button');
    node.type = 'button';
    if (fn) node.addEventListener('click',fn);
    return node;
  }
  function accountLink() {
    const node = el('a','前往我的资料登录 / 恢复','social-account-link');
    const params=new URLSearchParams(location.search),isSynastry=/\/synastry\.html$/.test(location.pathname);
    const reportId=REPORT_ID.test(params.get('report') || '') ? params.get('report') : undefined;
    const chart=/^[a-f0-9]{32}$/.test(params.get('chart') || '')&&!reportId ? params.get('chart') : undefined;
    const page=['home','rank','invite','invite-external','invite-internal','gift','connections'].includes(location.hash.slice(1)) ? location.hash.slice(1) : 'invite';
    const inviteToken=ID.test(active?.incomingToken || '')?active.incomingToken:undefined;
    if(window.ZxPaidReports?.loginUrl)node.href=window.ZxPaidReports.loginUrl(reportId,isSynastry||inviteToken?{returnTo:'synastry',chart,page:isSynastry?page:'invite-external',inviteToken}:undefined);
    else {
      const url=new URL('profile.html',location.href);url.search='';url.searchParams.set('private-report','1');url.hash='account-status';
      if(isSynastry){url.searchParams.set('return','synastry');url.searchParams.set('synastry-page',page);if(chart)url.searchParams.set('chart',chart);else if(reportId)url.searchParams.set('report',reportId);}
      node.href=url.href;
    }
    return node;
  }
  function injectStyle() {
    if ($('zx-social-style')) return;
    const style = el('style');
    style.id = 'zx-social-style';
    style.textContent = '.social-note{color:#aab0bd;font-size:13px;line-height:1.8;white-space:pre-line}.social-notice{line-height:1.8;font-size:14px;overflow-wrap:anywhere}.social-toolbar{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0}.social-button,.social-account-link{display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:9px 14px;border:1px solid #c9a85c66;border-radius:9px;background:#1a2233;color:#e8e4d8;font:inherit;font-size:14px;text-decoration:none;box-sizing:border-box}.social-button{cursor:pointer}.social-button:disabled{opacity:.5;cursor:default}.social-button:focus-visible,.social-account-link:focus-visible{outline:2px solid #f0d695;outline-offset:3px}.social-record{padding:18px 0;border-bottom:1px solid #c9a85c33}.social-record h3,.social-reading h3{font-size:18px;line-height:1.5;color:#d8bf80;margin:0 0 8px}.social-record p,.social-reading p{line-height:1.9;font-size:14px;overflow-wrap:anywhere}.social-form{margin:20px 0}.social-field{display:block;line-height:1.8;margin:14px 0;font-size:14px}.social-field select,.social-field input:not([type=checkbox]),.social-link-output{display:block;box-sizing:border-box;width:100%;min-height:44px;padding:10px;margin-top:7px;border:1px solid #c9a85c66;border-radius:8px;background:#141b2b;color:#e8e4d8;font:inherit}.social-check{display:flex;align-items:flex-start;gap:10px;line-height:1.8;font-size:14px;margin:16px 0}.social-check input{flex:none;width:20px;height:20px;margin:3px 0 0;accent-color:#c9a85c}.social-reading{padding:16px 0}.social-link-output{overflow-wrap:anywhere;word-break:break-all}.social-confirm{padding:14px;border:1px solid #c9a85c66;border-radius:9px;margin:12px 0}.social-tag{font-size:12px;color:#d8bf80}.social-code{overflow-wrap:anywhere}.social-heading{font-size:18px;margin-top:22px;color:#d8bf80}';
    style.textContent += '#social-detail{background-color:#1a2233}.social-reading p{color:#d2d7e0}.social-reading h4{font-size:16px;line-height:1.8;color:#d8bf80;margin:18px 0 8px}.social-reading .social-note{font-size:13px;color:#aab0bd}';
    document.head.append(style);
  }
  function isCurrent(ctx, view) {
    return active === ctx && ctx.generation === generation && ctx.dialog.open && (view === undefined || ctx.view === view);
  }
  function check(ctx, view, requireOwner = true) {
    if (!isCurrent(ctx,view)) throw Object.assign(new Error('cancelled'),{code:'SOCIAL_CANCELLED'});
    const state = snapshot();
    if (requireOwner && (!ctx.owner || !state.authenticated || state.identityKind !== 'wechat' || state.accountRef !== ctx.owner)) {
      throw Object.assign(new Error('account changed'),{code:'REPORT_ACCOUNT_CHANGED'});
    }
  }
  function notice(ctx, message) {
    if (isCurrent(ctx)) ctx.notice.textContent = message;
  }
  function clearSensitive(ctx) {
    ctx.token = '';
    ctx.incomingToken = '';
    ctx.reports = [];
    ctx.requestKey = '';
    ctx.body.replaceChildren();
  }
  function lostSession(message) {
    if (!active) return;
    const ctx = active;
    clearSensitive(ctx);
    active = null;
    generation++;
    if (ctx.dialog.open) ctx.body.append(el('p',message,'social-notice'),accountLink());
  }
  function handleError(ctx, error, view) {
    if (!isCurrent(ctx,view) || error?.code === 'SOCIAL_CANCELLED') return;
    const code = error?.code || error?.error;
    if (['AUTH_REQUIRED','REPORT_ACCOUNT_CHANGED','WECHAT_AUTHENTICATION_REQUIRED'].includes(code)) {
      lostSession(MESSAGES[code]);
      return;
    }
    notice(ctx,MESSAGES[code] || '操作暂未完成，请刷新状态后再试。');
    if (['SYN_DISABLED','REPORT_SERVICE_UNAVAILABLE','PRIVACY_CONSENT_REQUIRED'].includes(code) && !ctx.accountLink?.isConnected) {
      ctx.accountLink=accountLink(); ctx.body.append(ctx.accountLink);
    }
  }
  async function call(ctx, path, body, view = ctx.view) {
    check(ctx,view);
    const result = await window.zxMember.synastryCall(path,body);
    check(ctx,view);
    return result;
  }
  function action(ctx, target, fn) {
    const view = ctx.view;
    target.addEventListener('click',async () => {
      if (target.disabled || !isCurrent(ctx,view)) return;
      target.disabled = true;
      try { check(ctx,view); await fn(view); }
      catch (error) { handleError(ctx,error,view); }
      finally { if (isCurrent(ctx,view) && target.isConnected) target.disabled = false; }
    });
    return target;
  }
  function startView(ctx, title) {
    check(ctx);
    ctx.view++;
    ctx.requestKey = '';
    ctx.token = '';
    ctx.title.textContent = title;
    ctx.body.replaceChildren(); ctx.dialog.scrollTop = 0;
    const identity = el('p',ctx.profile.name + ' · ' + ctx.profile.code,'social-note social-code');
    ctx.notice = el('p','','social-notice');
    ctx.notice.setAttribute('role','status');
    ctx.body.append(identity,ctx.notice);
    return ctx.view;
  }
  async function allReports(ctx, view) {
    const items = [];
    const cursors = new Set();
    let before;
    do {
      check(ctx,view);
      const page = await window.zxMember.paidReportList(before ? {before} : undefined);
      check(ctx,view);
      if (!page || !Array.isArray(page.items)) throw new Error('Invalid report list');
      items.push(...page.items);
      before = page.next_before;
      if (before && (cursors.has(before) || cursors.size >= 200)) throw new Error('Invalid report pagination');
      if (before) cursors.add(before);
    } while (before);
    return items;
  }
  function details(parent, summary, text) {
    const node=el('details',undefined,'social-note');
    node.append(el('summary',summary),el('p',text));parent.append(node);return node;
  }
  function signature(ctx, reportId) {
    try {
      const vault=window.ZxChartVault, selected=vault?.selected?.();
      let name='';
      if (reportId) name=vault?.paidName?.(reportId,ctx.owner)||'';
      else if(ctx.senderName) name=ctx.senderName;
      else if(selected?.kind==='local') name=vault?.get?.(selected.id)?.name||'';
      else if(selected?.kind==='report'&&selected.accountRef===ctx.owner) name=vault?.paidName?.(selected.id,ctx.owner)||'';
      const cleaned=String(name).normalize('NFC').trim();
      if(cleaned&&!/[<>{}\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u.test(cleaned)&&Array.from(cleaned).length<=80)return cleaned;
    }catch(_){}
    return ctx.profile.name;
  }
  function approvalForm(ctx, parent, requireReport = false, withSignature = false) {
    const wrap = el('div',undefined,'social-form');
    const label = el('label','选择自己的报告','social-field');
    const reports = el('select');
    reports.setAttribute('aria-label','用于本次合盘的报告');
    const empty = el('option',requireReport ? '请选择自己的有效报告' : '报告还未备齐，先建立邀请');
    empty.value = '';
    reports.append(empty);
    ctx.reports.filter(usableReport).forEach(report => {
      const option = el('option',String(report.title || '我的深度报告') + ' · ' + date(report.expires_at ?? report.storage_expires_at) + '到期');
      option.value = report.report_id;
      reports.append(option);
    });
    reports.value = ctx.reports.some(report => usableReport(report) && report.report_id === ctx.reportId) ? ctx.reportId : '';
    label.append(reports);
    const consentLabel = el('label',undefined,'social-check');
    const consent = el('input'); consent.type = 'checkbox';
    const consentText = el('span',withSignature?'我同意以此署名发起合盘邀请。':'我同意参与合盘。');
    consentLabel.append(consent,consentText);
    const signatureLine=withSignature?el('p','','social-tag'):null;
    const updateSignature=()=>{if(signatureLine)signatureLine.textContent='邀请署名：'+signature(ctx,reports.value);};
    updateSignature();
    const aiLabel = el('label',undefined,'social-check');
    const ai = el('input'); ai.type = 'checkbox';
    aiLabel.append(ai,el('span','同意 DeepSeek 提供相处建议（选填）'));
    wrap.append(label);if(signatureLine)wrap.append(signatureLine);
    wrap.append(consentLabel,aiLabel);
    details(wrap,'合盘与隐私说明','邀请署名会显示给对方；所选报告仅用于共同解读，不开放各自的出生资料、个人报告和私人问星。报告未备齐可先邀请，补选报告时再次确认。共同阅读截至双方报告较早到期日，任一方解除后停止共同阅读。');
    details(wrap,'AI 建议说明','双方都同意时，仅向 DeepSeek 发送日主、日干、日支组合及可用星盘夹角，不发送姓名、知星号、出生日期、地点或报告全文。不勾选也可阅读基础解读。解除后停止后续生成并删除共同解读。');
    parent.append(wrap);
    const listeners = [];
    const changed = () => { ctx.requestKey = ''; listeners.forEach(fn=>fn()); };
    reports.addEventListener('change',() => { consent.checked=false; ai.checked=false; updateSignature(); changed(); });
    consent.addEventListener('change',changed);
    ai.addEventListener('change',changed);
    return {
      reports,consent,ai,
      change: fn => listeners.push(fn),
      disable: value => { reports.disabled=value; consent.disabled=value; ai.disabled=value; },
      value() {
        if (!window.SynastryPolicy?.VERSION || !window.SynastryPolicy?.AI_CONSENT_VERSION) throw Object.assign(new Error(),{code:'POLICY_UNAVAILABLE'});
        if (!consent.checked) throw Object.assign(new Error(),{code:'CONSENT_REQUIRED'});
        const reportId = reports.value;
        if (requireReport && !reportId) throw Object.assign(new Error(),{code:'REPORT_REQUIRED'});
        if (reportId && !ctx.reports.some(report => usableReport(report) && report.report_id === reportId)) throw Object.assign(new Error(),{code:'REPORT_UNAVAILABLE'});
        return {reportId:reportId || null,...(withSignature?{senderName:signature(ctx,reportId)}:{}),consent:{confirmed:true,version:window.SynastryPolicy.VERSION,aiConfirmed:ai.checked,aiVersion:ai.checked ? window.SynastryPolicy.AI_CONSENT_VERSION : null}};
      }
    };
  }
  function requestKey() {
    if (typeof window.crypto?.randomUUID === 'function') return window.crypto.randomUUID();
    if (typeof window.crypto?.getRandomValues !== 'function') throw new Error('Secure randomness unavailable');
    return Array.from(window.crypto.getRandomValues(new Uint8Array(16)),x=>x.toString(16).padStart(2,'0')).join('');
  }
  function invitationLink(token) {
    if (!ID.test(token || '')) throw new Error('Invalid invitation token');
    const url = new URL('profile.html',location.href);
    url.search = '';
    url.hash = 'invite=' + token;
    return url.href;
  }
  function showLink(ctx, output, token) {
    const link = invitationLink(token);
    output.replaceChildren();
    const input = el('textarea');
    input.className = 'social-link-output'; input.value = link; input.readOnly = true;
    input.setAttribute('aria-label','邀请链接'); input.rows = 3;
    const copy = action(ctx,button('复制邀请链接'),async view => {
      check(ctx,view);
      try { await navigator.clipboard.writeText(link); check(ctx,view); notice(ctx,'邀请链接已复制。'); }
      catch (error) { if (error?.code) throw error; notice(ctx,'暂时无法自动复制，请长按上方链接手动复制。'); }
    });
    output.append(input,el('div',undefined,'social-toolbar'));
    output.lastChild.append(copy);
    output.append(el('p',/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname)
      ? '这是本机预览链接，只能在这台电脑访问。正式地址开放后才能发给外部好友。'
      : '复制后可粘贴给好友。链接通常在 7 天内有效，以邀请显示的到期日为准。','social-note'));
  }
  function createInvitation(ctx) {
    const internal=ctx.channel==='internal',external=ctx.channel==='external';
    startView(ctx,internal?'站内邀请':external?'微信邀请':'发起合盘邀请');
    const form = approvalForm(ctx,ctx.body,false,true);
    const targetLabel = el('label',internal?'对方的知星号':'对方的知星号（选填）','social-field');
    const target = el('input'); target.maxLength=18; target.autocomplete='off'; target.placeholder=internal?'请输入对方的完整知星号':'不填则使用链接邀请';
    targetLabel.append(target);
    const found = el('p','','social-note');
    const output = el('div');
    let lookedUp = '';
    let lookingUp = false;
    const clearDraft = () => { ctx.requestKey=''; lookedUp=''; found.textContent=''; output.replaceChildren(); form.consent.checked=false; form.ai.checked=false; };
    target.addEventListener('input',clearDraft);
    form.change(()=>output.replaceChildren());
    const lookupAccount = async view => {
      const code=target.value.trim().toUpperCase();
      if (!/^ZX[A-F0-9]{16}$/.test(code)) throw Object.assign(new Error(),{code:'ACCOUNT_UNAVAILABLE'});
      lookingUp=true; target.disabled=true;
      try { const result=await call(ctx,'/synastry/lookup',{code},view); lookedUp=code; found.textContent=String(result.name || '知星用户')+' · '+String(result.code || code); }
      finally { if (isCurrent(ctx,view)) { lookingUp=false; target.disabled=false; } }
    };
    const lookup=action(ctx,button('核对知星号'),lookupAccount);
    const create = action(ctx,button(internal?'发送站内邀请':'生成邀请链接'),async view => {
      if (lookingUp || ctx.creating) return;
      const body=form.value();
      const code=target.value.trim().toUpperCase();
      if ((internal&&!code) || (code && (!/^ZX[A-F0-9]{16}$/.test(code) || lookedUp!==code))) { notice(ctx,internal?'请先输入并核对对方的知星号。':'请先核对对方的知星号，或留空使用链接邀请。'); return; }
      ctx.requestKey=ctx.requestKey || requestKey();
      ctx.creating=true; form.disable(true); target.disabled=true; lookup.disabled=true; back.disabled=true;
      try {
        const result=await call(ctx,'/synastry/invitations',{...body,key:ctx.requestKey,...(code ? {targetCode:code} : {})},view);
        if(result?.senderName&&result.senderName!==body.senderName)throw Object.assign(new Error(),{code:'IDEMPOTENCY_CONFLICT'});
        if(typeof ctx.onInvitationCreated==='function'&&result?.status==='active')ctx.onInvitationCreated({senderName:body.senderName,owner:ctx.owner,reportId:body.reportId});
        if (internal) {
          output.replaceChildren();
          notice(ctx,result?.status==='active'&&ID.test(result.id || '')&&ID.test(result.token || '')
            ? '站内邀请已发送，可在邀请记录中查看状态。'
            : '这次邀请已处理，请查看邀请记录确认当前状态。');
          return;
        }
        if (!result.token) { output.replaceChildren(); notice(ctx,'这次邀请已处理，请查看邀请记录。'); return; }
        showLink(ctx,output,result.token);
        notice(ctx,'邀请链接已生成'+(date(result.expiresAt) ? '，有效至 '+date(result.expiresAt) : '')+'。');
      } finally { ctx.creating=false; if (isCurrent(ctx,view)) { form.disable(false); target.disabled=false; lookup.disabled=false; back.disabled=false; } }
    });
    const back=action(ctx,button('查看邀请记录'),()=>showRecords(ctx,'invitations'));
    const toolbar=el('div',undefined,'social-toolbar');
    if(!external)toolbar.append(lookup);
    toolbar.append(create,back);
    if(!external)ctx.body.append(targetLabel,found);
    ctx.body.append(toolbar,output);
    if(internal&&ctx.lookupCode){const view=ctx.view;target.value=ctx.lookupCode;ctx.lookupCode='';lookup.disabled=true;lookupAccount(view).catch(error=>handleError(ctx,error,view)).finally(()=>{if(isCurrent(ctx,view))lookup.disabled=false;});}
  }
  async function incoming(ctx, token) {
    if (!ID.test(token || '')) { notice(ctx,'邀请链接格式不完整，请向邀请人索取完整链接。'); return; }
    const view=startView(ctx,'收到合盘邀请');
    try {
    ctx.token=token;
    notice(ctx,'正在读取这份邀请…');
    const invitation=await call(ctx,'/synastry/invitations/inspect',{token},view);
    const heading=el('h3',String(invitation.senderName || '知星用户')+'邀请你一起了解彼此','social-heading');
    ctx.body.append(heading,el('p',status(invitation.status)+(date(invitation.expiresAt) ? ' · '+date(invitation.expiresAt)+'到期' : ''),'social-tag'));
    notice(ctx,'是否参与由你决定。接受邀请不会开放你的个人报告、出生资料或私人问星。');
    if (invitation.status!=='active') {
      ctx.body.append(action(ctx,button('查看我的邀请'),()=>showRecords(ctx,'invitations')));
      return;
    }
    const form=approvalForm(ctx,ctx.body);
    const accept=action(ctx,button('同意并接受邀请'),async currentView => {
      const body=form.value(); form.disable(true);
      try {
        const result=await call(ctx,'/synastry/invitations/accept',{token,...body},currentView);
        ctx.token='';
        if (new URLSearchParams(location.hash.slice(1)).get('invite')===token) history.replaceState(null,'',location.pathname+location.search);
        if (ID.test(result.pairId || '')) await readPair(ctx,result.pairId);
        else { notice(ctx,'邀请已接受，请刷新合盘记录查看状态。'); accept.disabled=true; }
      } finally { if (isCurrent(ctx,currentView)) form.disable(false); }
    });
    ctx.body.append(accept);
    } catch (error) { handleError(ctx,error,view); }
  }
  async function showRecords(ctx, kind) {
    const view=startView(ctx,kind==='records' ? '合盘记录' : '我的邀请');
    const toolbar=el('div',undefined,'social-toolbar');
    toolbar.append(action(ctx,button('刷新记录'),()=>showRecords(ctx,kind)),action(ctx,button('发起邀请'),()=>createInvitation(ctx)));
    toolbar.append(action(ctx,button(kind==='records' ? '我的邀请' : '合盘记录'),()=>showRecords(ctx,kind==='records' ? 'invitations' : 'records')));
    const listBody=el('div'),pager=el('div',undefined,'social-toolbar');
    ctx.body.append(toolbar,listBody,pager);
    const category=kind==='records' ? 'pairs' : 'invitations';
    let cursor=null,loaded=false;
    const seenItems=new Set(),seenCursors=new Set();
    const more=action(ctx,button('加载更多'),async currentView=>loadPage(currentView));
    async function loadPage(currentView) {
      notice(ctx,'正在读取当前账号的记录…');
      const params=new URLSearchParams({kind:category,limit:'20'});
      if(cursor)params.set('cursor',cursor);
      const rows=await call(ctx,'/synastry/records?'+params.toString(),undefined,currentView);
      if (!rows || !Array.isArray(rows.pairs) || !Array.isArray(rows.invitations)) throw new Error('Invalid record list');
      const next=rows.nextCursor ?? null;
      if(next!==null && (typeof next!=='string' || !/^[A-Za-z0-9_.-]{1,512}$/.test(next) || seenCursors.has(next))) throw new Error('Invalid record cursor');
      if(rows.hasMore!==undefined && rows.hasMore!==Boolean(next)) throw new Error('Invalid record pagination');
      const list=category==='pairs' ? rows.pairs : rows.invitations;
      if(list.length>20)throw new Error('Invalid record page size');
      list.forEach(item => {
        if(!item || typeof item!=='object')throw new Error('Invalid record');
      });
      if(!loaded && !list.length && !next)listBody.append(el('p',kind==='records' ? '还没有合盘记录。可以先发邀请，等双方报告备齐后再共同阅读。' : '还没有发出或收到的邀请。','social-note'));
    list.forEach(item => {
      if(item.id && seenItems.has(item.id))return;
      if(item.id)seenItems.add(item.id);
      const article=el('article',undefined,'social-record');
      article.append(el('h3',kind==='records' ? '共同解读' : (item.direction==='sent' ? '我发出的邀请' : '收到 '+String(item.senderName || '知星用户')+' 的邀请')));
      article.append(el('p',status(item.status)+(date(item.expiresAt) ? ' · '+date(item.expiresAt)+'到期' : ''),'social-tag'));
      if (kind==='invitations' && item.direction==='sent' && item.targetName) article.append(el('p','邀请 '+String(item.targetName),'social-note'));
      const actions=el('div',undefined,'social-toolbar');
      if (kind==='records' && ID.test(item.id || '') && !['removed','unavailable'].includes(item.status)) actions.append(action(ctx,button(item.status==='ready' ? '阅读共同解读' : '查看进度'),()=>readPair(ctx,item.id)));
      if (kind==='invitations' && ID.test(item.pairId || '')) actions.append(action(ctx,button('查看共同解读'),()=>readPair(ctx,item.pairId)));
      if (kind==='invitations' && item.status==='active' && item.direction==='received' && ID.test(item.token || '')) actions.append(action(ctx,button('查看并决定'),()=>incoming(ctx,item.token)));
      if (kind==='invitations' && item.status==='active' && item.direction==='sent' && ID.test(item.id || '')) {
        const revoke=action(ctx,button('撤回邀请'),async currentView => { await call(ctx,'/synastry/invitations/'+item.id+'/revoke',{},currentView); await showRecords(ctx,kind); notice(ctx,'邀请已撤回，原链接不能再接受。'); });
        actions.append(revoke);
      }
      article.append(actions); listBody.append(article);
    });
      loaded=true;cursor=next;
      if(next)seenCursors.add(next);
      pager.replaceChildren();
      if(next)pager.append(more);
      notice(ctx,'共同解读需要双方各自的有效报告与单独同意。');
    }
    try {await loadPage(view);}
    catch (error) {handleError(ctx,error,view);}
  }

  async function offerMissingReport(ctx,id,view){
    const api=window.ZxPaidReports;
    ctx.body.append(el('p','你还需要一份可用于合盘的个人报告。补齐后会回到当前邀请，再由你确认参与。','social-note'));
    for(const report of ctx.reports){
      if(!REPORT_ID.test(report.report_id||''))continue;
      const draft=report.entitlement_status==='unpaid';
      const waiting=report.entitlement_status==='active'&&['queued','running','pending','failed'].includes(report.delivery_status);
      const label=draft?'继续购买已有报告':waiting?'查看报告生成进度':null;
      if(label)ctx.body.append(action(ctx,button(label),()=>{api.rememberPairPurchase(id,report.report_id);if(draft)api.checkoutReport(report.report_id);else location.assign(api.reportUrl(report.report_id));}));
      else ctx.body.append(el('p',(report.title||'已有报告')+'目前不可用于合盘，请核对到期或权益状态。','social-note'));
    }
    const entries=window.ZxChartVault?.list?.()||[];
    if(entries.length){
      const label=el('label','选择要补齐报告的图谱','social-field'),picker=el('select');picker.setAttribute('aria-label','选择要补齐报告的图谱');
      const blank=el('option','请选择图谱');blank.value='';picker.append(blank);
      entries.forEach(entry=>{const option=el('option',entry.name||'未命名图谱');option.value=entry.id;picker.append(option);});label.append(picker);ctx.body.append(label);
      const buy=button('正在读取报告价格');buy.disabled=true;ctx.body.append(buy);
      try{
        const catalog=await window.zxMember.paidReportCatalog();check(ctx,view);
        const product=(catalog.products||[]).find(item=>item.product_code==='deep_report_v1'),price=api.priceLabel(product);
        const allowed=catalog.payment_available===true&&product?.payment_available===true&&window.zxMember.paidReportPurchaseReady?.();
        buy.textContent=allowed&&price?'补齐我的报告 · '+price:'报告购买暂未开放';
        picker.addEventListener('change',()=>{buy.disabled=!allowed||!price||!entries.some(e=>e.id===picker.value);});
        action(ctx,buy,()=>{
          const entry=window.ZxChartVault.get(picker.value);if(!entry)throw Object.assign(new Error(),{code:'REPORT_UNAVAILABLE'});
          const account=ctx.owner;
          const copy={...entry,input:{...entry.input}};if(copy.accountRef!==account){delete copy.reportId;delete copy.accountRef;}
          api.rememberPairPurchase(id,copy.reportId);
          ctx.dialog.close();
          window.ZxProfilePurchase.open({entry:copy,returnLabel:'返回共同解读',onReturn:()=>open({pairId:id}),onPrepared:async reportId=>{
            if(snapshot().accountRef!==account||!snapshot().authenticated)throw Object.assign(new Error(),{code:'REPORT_ACCOUNT_CHANGED'});
            await window.ZxChartVault.bindReport(entry.id,reportId,account,copy.input);api.rememberPairPurchase(id,reportId);
          }});
        });
      }catch(error){handleError(ctx,error,view);buy.textContent='报告价格暂时无法读取';}
    }else{
      ctx.body.append(action(ctx,button('填写我的资料并继续'),()=>{api.rememberPairPurchase(id);const url=new URL(api.homeUrl());url.searchParams.set('new-chart','1');url.hash='formCard';location.assign(url.href);}));
    }
  }
  async function readPair(ctx, id) {
    if (!ID.test(id || '')) throw Object.assign(new Error(),{code:'NOT_FOUND'});
    const view=startView(ctx,'共同解读');
    try {
    notice(ctx,'正在读取共同解读…');
    const result=await call(ctx,'/synastry/pairs/'+id,undefined,view);
    const toolbar=el('div',undefined,'social-toolbar');
    toolbar.append(action(ctx,button('返回合盘记录'),()=>showRecords(ctx,'records')),action(ctx,button('刷新状态'),()=>readPair(ctx,id)));
    ctx.body.append(toolbar);
    notice(ctx,status(result.status)+(date(result.expiresAt) ? ' · '+date(result.expiresAt)+'到期' : ''));
    if(['ready','removed','unavailable'].includes(result.status))window.ZxPaidReports?.clearPairPurchase?.(id);
    if (result.status==='ready' && result.report && Array.isArray(result.report.chapters)) {
      const opening=window.ZxSynastryOpening?.create(result.report.opening);
      if(opening)ctx.body.append(opening);
      if (typeof result.report.precisionNotice==='string' && result.report.precisionNotice.trim()) ctx.body.append(el('p',result.report.precisionNotice,'social-note'));
      result.report.chapters.forEach(chapter=> {
        const section=el('section',undefined,'social-reading');
        section.append(el('h3',chapter.title));
        if (typeof chapter.view?.headline==='string' && chapter.view.headline.trim()) section.append(el('h4',chapter.view.headline,'social-reading-headline'));
        section.append(el('p',chapter.scene),el('p',chapter.shared),el('p',chapter.view?.advice));
        if (chapter.view?.actions && typeof chapter.view.actions==='object') {
          const actions=el('div',undefined,'social-reading-actions');
          [['own','你可以做什么'],['other','对方可以做什么'],['together','一起试一次']].forEach(([key,title])=> {
            const text=chapter.view.actions[key];
            if (typeof text!=='string' || !text.trim()) return;
            const item=el('div',undefined,'social-reading-action');
            item.append(el('h4',title),el('p',text)); actions.append(item);
          });
          section.append(actions);
        }
        if (typeof chapter.view?.reminder==='string' && chapter.view.reminder.trim()) section.append(el('p',chapter.view.reminder,'social-note'));
        const sources={ 'day-stems':'八字 · 日干关系','day-branches':'八字 · 日支关系','day-elements':'八字 · 日主五行','astro-sun':'星盘 · 太阳夹角','astro-moon':'星盘 · 月亮夹角','astro-asc':'星盘 · 上升夹角' };
        const sourceNames=Array.isArray(chapter.sourceIds) ? chapter.sourceIds.map(key=>sources[key]).filter(Boolean) : [];
        if (sourceNames.length) section.append(el('p',sourceNames.join(' · '),'social-note'));
        ctx.body.append(section);
      });
      if (result.report.disclaimer) ctx.body.append(el('p',result.report.disclaimer,'social-note'));
    } else if (result.status==='waiting_reports') {
      ctx.body.append(el('p','双方都选定自己的有效报告并分别确认后，才会生成共同解读。','social-note'));
      ctx.reports=await allReports(ctx,view);
      const hasReport=ctx.reports.some(usableReport);
      if(!hasReport)await offerMissingReport(ctx,id,view);
      const form=approvalForm(ctx,ctx.body,true);
      const select=action(ctx,button('使用所选报告并确认'),async currentView => {
        const body=form.value(); form.disable(true);
        try { await call(ctx,'/synastry/pairs/'+id+'/report',body,currentView); await readPair(ctx,id); }
        finally { if (isCurrent(ctx,currentView)) form.disable(false); }
      });
      select.disabled=!hasReport;ctx.body.append(select);
    } else {
      const states={queued:'共同解读正在等待生成，可稍后刷新。',running:'共同解读正在生成，可稍后刷新。',failed:'本次生成未完成。',unavailable:'报告可能已到期、变更或停止共享。请核对自己的报告状态。',removed:'共同阅读已解除。'};
      ctx.body.append(el('p',states[result.status] || '当前没有可阅读的共同解读。','social-note'));
      if (result.status==='failed') {
        const recovery=el('div',undefined,'social-toolbar');
        if (Number.isSafeInteger(result.attempts) && result.attempts>=3) notice(ctx,MESSAGES.SUPPORT_REQUIRED);
        else {
          const retry=button('重新生成共同解读');
          recovery.append(action(ctx,retry,async currentView=> {
            try { await call(ctx,'/synastry/pairs/'+id+'/retry',{},currentView); }
            catch (error) {
              if ((error?.code || error?.error)==='SUPPORT_REQUIRED' && isCurrent(ctx,currentView)) {
                retry.remove(); notice(ctx,MESSAGES.SUPPORT_REQUIRED); return;
              }
              throw error;
            }
            await readPair(ctx,id);
          }));
        }
        recovery.append(action(ctx,button('提交客服处理'),async currentView=>{
          const ticket=await call(ctx,'/synastry/pairs/'+id+'/support',{},currentView);
          notice(ctx,ticket.status==='resolved'?'客服已处理，请刷新查看。':ticket.status==='in_progress'?'客服处理中。':ticket.notification==='sent'?'已提交客服通知。':ticket.notification==='queued'?'已提交，正在通知客服。':'问题已记录，可通过下方邮箱联系客服。');
        }));
        const contact=el('a','联系客服','social-account-link');
        contact.href='mailto:wyh767745207@qq.com?subject='+encodeURIComponent('知星合盘生成问题');
        recovery.append(contact); ctx.body.append(recovery);
      }
    }
    if (!['removed','unavailable'].includes(result.status)) {
      const unlink=action(ctx,button('解除共同阅读'),()=> {
        const confirm=el('div',undefined,'social-confirm');
        confirm.append(el('p','解除后双方都不能继续阅读此份共同解读，各自仍有效的个人报告会保留。','social-note'));
        confirm.append(action(ctx,button('确认解除'),async currentView=> { await call(ctx,'/synastry/pairs/'+id+'/unlink',{confirmed:true},currentView); await showRecords(ctx,'records'); notice(ctx,'共同阅读已解除。'); }));
        confirm.append(button('保留共同阅读',()=>confirm.remove()));
        unlink.replaceWith(confirm);
      });
      ctx.body.append(el('div',undefined,'social-toolbar')); ctx.body.lastChild.append(unlink);
    }
    } catch (error) { handleError(ctx,error,view); }
  }
  async function open(options = {}) {
    const dialog=$('social-detail'), title=$('social-title'), body=$('social-body');
    if (!dialog || !title || !body) return;
    if (active) clearSensitive(active);
    injectStyle();
    const ctx={dialog,title,body,generation:++generation,view:0,owner:'',profile:{},senderName:typeof options.senderName==='string'?options.senderName:'',senderOwner:options.senderOwner||'',onInvitationCreated:options.onInvitationCreated,reports:[],reportId:REPORT_ID.test(options.reportId || '') ? options.reportId : '',token:'',requestKey:'',incomingToken:ID.test(options.token || '')?options.token:'',creating:false,lookupCode:/^ZX[A-F0-9]{16}$/.test(options.lookupCode || '')?options.lookupCode:'',channel:['internal','external'].includes(options.channel)?options.channel:''};
    active=ctx;
    title.textContent=options.token ? '收到合盘邀请' : options.kind==='records' ? '合盘记录' : '我的邀请';
    body.replaceChildren();
    ctx.notice=el('p','正在读取当前账号…','social-notice'); ctx.notice.setAttribute('role','status'); body.append(ctx.notice);
    if (!dialog.open) dialog.showModal();
    try {
      if (!window.zxMember?.paidReportServiceAvailable?.() || !window.zxMember?.synastryCall) {
        notice(ctx,MESSAGES.REPORT_SERVICE_UNAVAILABLE); body.append(accountLink()); return;
      }
      await window.zxMember.start();
      check(ctx,undefined,false);
      const state=snapshot();
      if (!state.authenticated || state.identityKind!=='wechat' || !state.accountRef) { notice(ctx,MESSAGES.WECHAT_AUTHENTICATION_REQUIRED); body.append(accountLink()); return; }
      ctx.owner=state.accountRef;
      const results=await Promise.all([call(ctx,'/synastry/profile'),allReports(ctx,ctx.view)]);
      check(ctx);
      ctx.profile={name:String(results[0]?.name || '知星用户'),code:String(results[0]?.code || '')}; ctx.reports=results[1];
      if(ctx.senderOwner&&ctx.senderOwner!==ctx.owner)ctx.senderName='';
      if (options.token) await incoming(ctx,options.token);
      else if(ID.test(options.pairId||''))await readPair(ctx,options.pairId);
      else if(options.compose) createInvitation(ctx);
      else await showRecords(ctx,options.kind==='records' ? 'records' : 'invitations');
    } catch(error) { handleError(ctx,error); }
  }
  function close() {
    if (active) clearSensitive(active);
    active=null; generation++;
  }
  function bind() {
    $('social-detail')?.addEventListener('close',close);
    $('social-detail')?.addEventListener('cancel',close);
    window.addEventListener('zx-private-session-cleared',()=>lostSession('账号会话已清除，请重新登录。'));
    window.addEventListener('focus',()=> {
      if (active?.owner && (snapshot().accountRef!==active.owner || !snapshot().authenticated)) lostSession(MESSAGES.REPORT_ACCOUNT_CHANGED);
    });
  }
  if (document.readyState==='loading') document.addEventListener('DOMContentLoaded',bind,{once:true}); else bind();
  window.ZxProfileSocial=Object.freeze({open,showIncoming:token=>open({token}),close});
})();
