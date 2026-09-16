/* TEST ONLY. Same-origin simulated API; no payments, model calls or cloud storage. */
(function (root) {
  'use strict';
  const BUILD_ID = 'zhixing-online-simulation-20260916-v1';
  if (root.ZX_TEST_SIMULATION !== true || root.ZX_TEST_SIMULATION_BUILD_ID !== BUILD_ID) return;
  if (root.ZXTestSim) return;
  const KEY = 'zx_test_simulation_v1';
  // Bootstrap scopes this ordinary app key by role; sessionStorage also scopes it by tab.
  const SESSION_KEY = 'zx_simulation_identity_v1';
  const FALLBACK_ROLE_KEY = 'zx_test_simulation_tab_role';
  const PREFIX = '/__test_api__';
  const DAY = 86400000;
  const ROLES = ['A', 'B'];
  const REF = { A: 'a'.repeat(64), B: 'b'.repeat(64) };
  const CODE = { A: 'ZXAAAAAAAAAAAAAAAA', B: 'ZXBBBBBBBBBBBBBBBB' };
  const listeners = new Set();
  const nativeFetch = root.fetch.bind(root);
  const apiBase = root.ZXTestBootstrap?.apiBase || root.location.origin + PREFIX;
  const clone = value => JSON.parse(JSON.stringify(value));
  const fail = (code, status = 400, message = code) => { throw Object.assign(new Error(message), { code, status }); };
  const hex = length => Array.from(root.crypto.getRandomValues(new Uint8Array(length / 2)), n => n.toString(16).padStart(2, '0')).join('');
  const fresh = () => ({ version: 1, serial: 0,
    users: { A: { name: '测试用户甲', code: CODE.A }, B: { name: '测试用户乙', code: CODE.B } },
    reports: {}, orders: {}, gifts: {}, invitations: {}, pairs: {}, answers: {}, idempotency: {}, events: [] });
  function load() {
    const raw = root.localStorage.getItem(KEY);
    if (!raw) return fresh();
    try {
      const value = JSON.parse(raw);
      if (value.version !== 1 || !value.users || !value.reports || !value.orders || !value.pairs) fail('SIM_STORAGE_INVALID');
      return value;
    } catch (_) { return fail('SIM_STORAGE_INVALID', 500, '模拟数据无法读取，请用测试工具栏重置模拟数据。'); }
  }
  function publish(value, action) {
    delete value.role; // Legacy shared role must never authenticate another tab.
    value.serial++;
    value.events.push({ at: Date.now(), action, role: roleOf(value) });
    value.events = value.events.slice(-80);
    root.localStorage.setItem(KEY, JSON.stringify(value));
    for (const listener of listeners) { try { listener(stateView(value)); } catch (_) {} }
    root.dispatchEvent(new CustomEvent('zx-test-simulation-change', { detail: { action, role: roleOf(value) } }));
  }
  function roleOf() {
    const role = root.ZXTestBootstrap?.role?.() || root.sessionStorage.getItem(FALLBACK_ROLE_KEY);
    return ROLES.includes(role) && root.sessionStorage.getItem(SESSION_KEY) === role ? role : null;
  }
  const stateView = value => ({ ...clone(value), role: roleOf() });
  function requireRole(value, options = {}) {
    const role = roleOf(value);
    if (!role) fail('AUTH_REQUIRED', 401, '请先在模拟工具栏选择测试身份。');
    const auth = new Headers(options.headers || {}).get('authorization');
    const token = options.accessToken || (auth ? auth.replace(/^Bearer\s+/i, '') : '');
    if (token && token !== 'zx_a_simulation_' + role) fail('REPORT_ACCOUNT_CHANGED', 401);
    return role;
  }
  function account(value) {
    const role = roleOf(value);
    return { authenticated: !!role, wechat_authenticated: !!role, identity_kind: role ? 'wechat' : '',
      account_ref: role ? REF[role] : '', profile_name: role ? value.users[role].name : '', payment_available: !!role,
      member_until: null, cloud_sync_enabled: false, simulation: true };
  }
  function tokens(value) {
    const role = requireRole(value);
    return { ...account(value), access_token: 'zx_a_simulation_' + role, access_token_expires_at: Date.now() + DAY };
  }
  function saveSession(role) {
    if (role) {
      root.sessionStorage.setItem('zx_access_token', 'zx_a_simulation_' + role);
      root.sessionStorage.setItem('zx_access_token_expires_at', String(Date.now() + DAY));
    } else {
      root.sessionStorage.removeItem('zx_access_token');
      root.sessionStorage.removeItem('zx_access_token_expires_at');
    }
  }
  async function setRole(role) {
    if (!ROLES.includes(role) && role !== null) fail('SIM_ROLE_INVALID');
    const value = load();
    if (role) {
      root.ZXTestBootstrap?.setRole(role);
      root.sessionStorage.setItem(FALLBACK_ROLE_KEY, role);
      root.sessionStorage.setItem(SESSION_KEY, role);
    } else root.sessionStorage.removeItem(SESSION_KEY);
    saveSession(role);
    root.dispatchEvent(new CustomEvent('zx-private-session-cleared'));
    publish(value, role ? 'login-' + role : 'logout');
    if (root.zxMember?.me) await root.zxMember.me().catch(() => {});
    return account(value);
  }
  function normalizedInput(input, { minimumAge = 18, allowUnspecifiedGender = false } = {}) {
    if (!input || typeof input !== 'object') fail('BIRTH_INPUT_INVALID');
    const clean = { d: String(input.d || ''), t: String(input.t || ''), c: String(input.c || '').trim(), g: String(input.g || '') };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(clean.d) || clean.t && !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(clean.t) || !clean.c || !(allowUnspecifiedGender ? ['', '男', '女', '其他'] : ['男', '女', '其他']).includes(clean.g)) fail('BIRTH_INPUT_INVALID');
    const date = new Date(clean.d + 'T00:00:00Z');
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== clean.d) fail('BIRTH_INPUT_INVALID');
    // Age boundaries use the same Beijing calendar day as the public age gate.
    const today = new Date(Date.now() + 8 * 3600000);
    const age = today.getUTCFullYear() - date.getUTCFullYear() -
      (today.getUTCMonth() < date.getUTCMonth() || today.getUTCMonth() === date.getUTCMonth() && today.getUTCDate() < date.getUTCDate() ? 1 : 0);
    if (age < minimumAge || date.getUTCFullYear() < 1900) fail('PARTICIPANT_INELIGIBLE');
    return clean;
  }
  const fixtures = () => root.ZXTestFixtures || {};
  function fixtureReport(input, role) {
    const source = fixtures().reports;
    const list = Array.isArray(source) ? source : Object.values(source || {});
    return list.find(item => JSON.stringify(item.input) === JSON.stringify(input)) || list[role === 'B' ? 1 : 0] || list[0] || null;
  }
  function publicPreview(input, role) {
    const missingCriticalInput = [!input.t && 'birth_time', !['男', '女'].includes(input.g) && 'gender'].filter(Boolean);
    if (typeof root.BaziEngine?.computeChart === 'function' && typeof root.ZhixingHomeDecadePreview?.buildTeaser === 'function') {
      const [y, m, d] = input.d.split('-').map(Number);
      const [hh, mm] = input.t ? input.t.split(':').map(Number) : [undefined, undefined];
      const chart = root.BaziEngine.computeChart({ y, m, d, hh, mm, city: input.c, gender: input.g });
      const excerpt = root.ZhixingHomeDecadePreview.buildTeaser(chart);
      return { excerpt: excerpt ? clone(excerpt) : null, missingCriticalInput, simulation: true, isPreset: false,
        preview_source: 'public_runtime', simulation_note: '年度节选按当前输入由公开排盘与节选程序生成；完整报告仍为固定示例。' };
    }
    const fixture = fixtureReport(input, role);
    const excerpt = !missingCriticalInput.length && fixture?.snapshot?.preview?.excerpt ? clone(fixture.snapshot.preview.excerpt) : null;
    if (excerpt) {
      excerpt.title = '示例 · ' + excerpt.title;
      excerpt.label = excerpt.stage = '预置示例 · ' + (excerpt.label || excerpt.stage || '年度节选');
      excerpt.body = '【预置示例，未按当前资料生成】' + excerpt.body;
      excerpt.source = '固定虚构资料示例；' + (excerpt.source || '');
    }
    return { excerpt, missingCriticalInput, simulation: true, isPreset: true, preview_source: 'fixture',
      simulation_note: '公开排盘或节选程序尚未加载，当前仅展示固定虚构资料示例，不代表自填资料的年度分析。' };
  }
  function prepare(value, role, body) {
    if (body.transfer_confirmed !== true || body.storage_confirmed !== true) fail('REPORT_STORAGE_CONFIRMATION_REQUIRED');
    if (typeof body.subject_is_self !== 'boolean' || !body.subject_is_self && body.permission_confirmed !== true) fail('REPORT_SUBJECT_PERMISSION_REQUIRED');
    const input = normalizedInput(body.input);
    const old = Object.values(value.reports).find(r => r.owner === role && !r.deleted && JSON.stringify(r.input) === JSON.stringify(input));
    if (old) return old;
    const id = hex(48), fixture = fixtureReport(input, role);
    const report = { id, owner: role, input, fixtureKey: fixture?.key || (role === 'B' ? 'B' : 'A'), title: value.users[role].name + ' · 示例报告',
      createdAt: Date.now() + value.serial, deliveredAt: null, expiresAt: null, entitlement: 'unpaid', delivery: 'pending',
      giftCredits: 0, purchasedCredits: 0, subjectIsSelf: body.subject_is_self, revision: 1 };
    value.reports[id] = report;
    return report;
  }
  function ownedReport(value, role, id, requireReady = false) {
    const report = value.reports[id];
    if (!report || report.owner !== role || report.deleted) fail('REPORT_NOT_FOUND', 404);
    if (requireReady && !(report.entitlement === 'active' && report.delivery === 'ready' && report.expiresAt > Date.now())) fail('REPORT_NOT_OWNED', 403);
    return report;
  }
  function publicReport(report, withSnapshot = false) {
    const readable = report.entitlement === 'active' && report.delivery === 'ready' && report.expiresAt > Date.now() && !report.deleted;
    const result = { report_id: report.id, title: report.title, display_name: report.title, input: clone(report.input),
      entitlement_status: report.entitlement, delivery_status: report.delivery, readable,
      created_at: report.createdAt, delivered_at: report.deliveredAt, expires_at: report.expiresAt, storage_expires_at: report.expiresAt,
      refundable: readable, simulation: true };
    if (withSnapshot && readable) {
      const source = fixtures().reports;
      const list = Array.isArray(source) ? source : Object.values(source || {});
      const fixture = list.find(item => item.key === report.fixtureKey) || fixtureReport(report.input, report.owner);
      if (!fixture?.snapshot) fail('SIM_FIXTURES_NOT_READY', 503, '示例报告素材尚未加载，请刷新模拟页面。');
      result.snapshot = clone(fixture.snapshot);
      result.simulation_note = '固定虚构资料的示例内容，用于测试交付与阅读，不是真实新生成的个人分析。';
    }
    return result;
  }
  function balance(report) {
    const usable = report.entitlement === 'active' && report.delivery === 'ready' && report.expiresAt > Date.now();
    const remaining = report.giftCredits + report.purchasedCredits;
    return { kind: 'paid_ask_credits', owned: true, usable, allowed: usable && remaining > 0,
      remaining, gift_remaining: report.giftCredits, purchased_remaining: report.purchasedCredits,
      reason: usable && !remaining ? 'ASK_CREDIT_EXHAUSTED' : null, simulation: true };
  }
  const PRODUCTS = {
    deep_report_v1: { product_code: 'deep_report_v1', product_kind: 'deep_report', name: '深度报告（模拟）', amount_fen: 1990, question_credits: 1 },
    gift_report_v1: { product_code: 'gift_report_v1', product_kind: 'gift_report', name: '赠送深度报告（模拟）', amount_fen: 1990, question_credits: 1 },
    ask_single_v1: { product_code: 'ask_single_v1', product_kind: 'ask_credits', name: '问星 1 次（模拟）', amount_fen: 290, question_credits: 1 },
    ask_pack_3_v1: { product_code: 'ask_pack_3_v1', product_kind: 'ask_credits', name: '问星 3 次（模拟）', amount_fen: 600, question_credits: 3 }
  };
  const offer = code => ({ ...PRODUCTS[code], currency: 'CNY', unit_amount_fen: code === 'ask_pack_3_v1' ? 200 : PRODUCTS[code].amount_fen,
    payment_available: true, purchase_eligible: true });
  function checkout(order) {
    if (order.status !== 'created') return null;
    return { type: 'wechatpay_jsapi', appId: root.ZX_PUBLIC_CONFIG?.wechatOfficialAccountAppId || 'wx0000000000000000',
      timeStamp: String(Math.floor(Date.now() / 1000)), nonceStr: 'simulation_' + order.order_no,
      package: 'prepay_id=simulation_' + order.order_no, signType: 'RSA', paySign: 'S'.repeat(128), simulation: true };
  }
  const orderResult = order => ({ order: clone(order), checkout: checkout(order), simulation: true });
  function newOrder(value, role, code, reportId, key, body) {
    if (!PRODUCTS[code]) fail('PAYMENT_PRODUCT_INVALID');
    if (!key || typeof key !== 'string' || key.length > 128) fail('PAYMENT_IDEMPOTENCY_KEY_INVALID');
    const ident = role + ':order:' + key;
    const fingerprint = JSON.stringify({ code, reportId: reportId || null, body });
    const prior = value.idempotency[ident];
    if (prior) { if (prior.fingerprint !== fingerprint) fail('IDEMPOTENCY_CONFLICT', 409); return value.orders[prior.id]; }
    if (code !== 'gift_report_v1') ownedReport(value, role, reportId, code !== 'deep_report_v1');
    const id = hex(32), product = PRODUCTS[code];
    const order = { order_no: id, owner: role, product_code: code, product_kind: product.product_kind,
      paid_report_id: reportId || null, amount_fen: product.amount_fen, currency: 'CNY', question_credits: product.question_credits,
      status: 'created', provider_trade_state: 'NOTPAY', paid_at: null, created_at: Date.now(), expires_at: Date.now() + 600000, simulation: true };
    value.orders[id] = order;
    value.idempotency[ident] = { id, fingerprint };
    return order;
  }
  function deliver(report) {
    if (report.entitlement === 'active' && report.delivery === 'ready') return;
    report.entitlement = 'active'; report.delivery = 'ready'; report.deliveredAt = Date.now();
    const expiry = new Date(); expiry.setUTCMonth(expiry.getUTCMonth() + 6); report.expiresAt = expiry.getTime();
    report.giftCredits += 1;
  }
  function pairStatus(value, pair) {
    if (['removed', 'unavailable'].includes(pair.status)) return pair.status;
    const reports = pair.reportIds.map(id => value.reports[id]);
    if (reports.some(report => report && (report.deleted || report.entitlement === 'revoked' || report.revision !== pair.revisions[report.id]))) return pair.status = 'unavailable';
    pair.status = reports.length === 2 && reports.every(report => report && report.entitlement === 'active' && report.expiresAt > Date.now()) ? 'ready' : 'waiting_reports';
    return pair.status;
  }
  function createPair(value, roles, ids, managed = false) {
    const pair = { id: hex(64), roles, reportIds: ids, managed, status: 'waiting_reports', createdAt: Date.now(),
      revisions: Object.fromEntries(ids.filter(Boolean).map(id => [id, value.reports[id].revision])), expiresAt: Date.now() + 180 * DAY };
    value.pairs[pair.id] = pair; pairStatus(value, pair); return pair;
  }
  function pairResult(value, role, pair) {
    if (!pair.roles.includes(role)) fail('NOT_FOUND', 404);
    const result = { id: pair.id, status: pairStatus(value, pair), reportIds: pair.reportIds, expiresAt: pair.expiresAt, attempts: 1, simulation: true };
    if (result.status === 'ready') {
      const pairKeys = pair.reportIds.map(id => value.reports[id]?.fixtureKey);
      const source = fixtures().synastry;
      const list = Array.isArray(source) ? source : source ? [source] : [];
      const fixture = list.find(item => pairKeys.every(key => item.reportKeys?.includes(key))) || list[0];
      const raw = fixture?.report || fixture;
      const view = { headline: '示例：先说清各自的节奏', advice: '以下是虚构样本的互动示例，用于检查阅读功能。', actions: { own: '说出一个具体需要。', other: '确认自己听到的意思。', together: '约定一件小事并回看。' }, reminder: '这是模拟内容。' };
      result.report = raw?.chapters ? clone(raw) : { chapters: ['看见彼此', '互动节奏', '分歧与回应', '一起行动'].map(title => ({ title, scene: '模拟场景', shared: '先核对具体发生了什么。', sourceIds: [], views: { 'person-a': view, 'person-b': view } })), disclaimer: '固定虚构样本，仅用于流程模拟。' };
      if (fixture?.reportKeys?.[0] !== pairKeys[0]) result.report.chapters.forEach(chapter => { if (chapter.views) { const a = chapter.views['person-a']; chapter.views['person-a'] = chapter.views['person-b']; chapter.views['person-b'] = a; } });
      if (!pair.managed) result.report.chapters.forEach(chapter => { chapter.view = chapter.views?.[pair.roles.indexOf(role) === 1 ? 'person-b' : 'person-a'] || chapter.view || view; delete chapter.views; });
    }
    return result;
  }
  function confirmPayment(orderNo, confirmation) {
    if (confirmation?.confirmed !== true) fail('SIM_PAYMENT_CONFIRMATION_REQUIRED');
    const value = load(), role = requireRole(value), order = value.orders[orderNo];
    if (!order || order.owner !== role) fail('ORDER_NOT_FOUND', 404);
    if (order.status === 'completed') return orderResult(order);
    if (order.status !== 'created' || order.expires_at <= Date.now()) fail('ORDER_NOT_PAYABLE', 409);
    if (order.product_code === 'gift_report_v1') {
      const gift = value.gifts[order.giftId];
      if (!gift || gift.status !== 'created') fail('GIFT_NOT_AVAILABLE', 409);
      gift.status = 'funded'; gift.expiresAt = Date.now() + 7 * DAY;
    } else {
      const report = ownedReport(value, role, order.paid_report_id, order.product_code !== 'deep_report_v1');
      if (order.product_code === 'deep_report_v1') deliver(report);
      else report.purchasedCredits += PRODUCTS[order.product_code].question_credits;
    }
    order.status = 'completed'; order.provider_trade_state = 'SUCCESS'; order.paid_at = Date.now();
    publish(value, 'payment-confirmed'); return orderResult(order);
  }
  function visibleGift(value, role, gift, anonymous = false) {
    const result = { id: gift.id, status: gift.status, senderName: gift.senderName, expiresAt: gift.expiresAt, self: role === gift.sender,
      pairStatus: gift.pairId ? pairStatus(value, value.pairs[gift.pairId]) : 'waiting_reports', simulation: true };
    if (!anonymous && role === gift.sender) result.orderId = gift.orderId;
    if (!anonymous && role === gift.recipient) result.reportId = gift.reportId;
    return result;
  }
  function giftByToken(value, token) {
    const gift = Object.values(value.gifts).find(item => item.token === token);
    if (!gift) fail('GIFT_NOT_FOUND', 404);
    if (gift.status === 'funded' && gift.expiresAt < Date.now()) fail('GIFT_EXPIRED', 410);
    return gift;
  }
  function consent(body) { if (body?.confirmed !== true) fail('CONSENT_REQUIRED'); }
  function listPage(items, url) {
    if (url.searchParams.get('cursor')) fail('CURSOR_INVALID');
    return { items: items.slice(0, 20), hasMore: false, nextCursor: null };
  }
  async function dispatch(path, options = {}) {
    const url = new URL(path, root.location.origin);
    const method = String(options.method || 'GET').toUpperCase();
    const body = options.body || {};
    const value = load();
    const marker = url.pathname.indexOf(PREFIX + '/');
    const p = marker >= 0 ? url.pathname.slice(marker + PREFIX.length) : url.pathname;
    const mutation = result => { publish(value, method + ' ' + p); return clone(result); };
    if (['/auth/session', '/account/me'].includes(p) && method === 'GET') return account(value);
    if (p === '/auth/session/refresh' && method === 'POST') return tokens(value);
    if (p === '/auth/logout' && method === 'POST') { root.sessionStorage.removeItem(SESSION_KEY); saveSession(null); return mutation({ ok: true, simulation: true }); }
    if (p === '/account/init' && method === 'POST') return account(value);
    if (p === '/auth/wechat/oauth/start' && method === 'POST') {
      const target = new URL('test-login.html', root.ZXTestBootstrap?.baseUrl || root.location.href);
      if (target.origin !== root.location.origin) fail('SIM_LOGIN_URL_INVALID');
      target.searchParams.set('return', root.location.href);
      return { authorize_url: target.href, expires_at: Date.now() + 600000, simulation: true };
    }
    if (p === '/synastry/gifts/inspect' && method === 'POST') return visibleGift(value, roleOf(value), giftByToken(value, body.token), true);
    if (p === '/report-preview' && method === 'POST') {
      if (body.transfer_confirmed !== true) fail('REPORT_TRANSFER_CONFIRMATION_REQUIRED');
      const input = normalizedInput(body.input, { minimumAge: 14, allowUnspecifiedGender: true });
      return publicPreview(input, roleOf(value) || 'A');
    }
    // Only deep asks send an access token in JSON. Gift/invitation tokens are capabilities.
    const role = requireRole(value, { ...options, accessToken: p === '/ai/deep' ? body.token : null });
    if (p === '/account/closure' && method === 'GET') return { closure: null };
    if (p === '/account/profile') {
      if (method === 'GET') return { profile_name: value.users[role].name, account_ref: REF[role] };
      if (method === 'POST') { const name = String(body.profile_name || '').trim(); if (!name || name.length > 24) fail('DISPLAY_NAME_INVALID'); value.users[role].name = name; return mutation({ profile_name: name }); }
    }
    if (p === '/paid-reports/prepare' && method === 'POST') return mutation(publicReport(prepare(value, role, body)));
    if (p === '/paid-reports' && method === 'GET') {
      const before = Number(url.searchParams.get('before') || Infinity);
      const rows = Object.values(value.reports).filter(r => r.owner === role && !r.deleted && r.createdAt < before).sort((a, b) => b.createdAt - a.createdAt);
      return { items: rows.slice(0, 20).map(r => publicReport(r)), next_before: rows.length > 20 ? rows[19].createdAt : null };
    }
    let match = p.match(/^\/paid-reports\/([a-f0-9]{48})(?:\/(retry|correct))?$/);
    if (match) {
      const report = ownedReport(value, role, match[1]);
      if (method === 'GET' && !match[2]) return publicReport(report, url.searchParams.get('view') !== 'status');
      if (method === 'POST' && match[2] === 'retry') return publicReport(report, false);
      if (method === 'DELETE' && !match[2]) { consent(body); report.deleted = true; return mutation({ deleted: true }); }
      if (method === 'POST' && match[2] === 'correct') {
        if (body.discard_previous_confirmed !== true || body.transfer_confirmed !== true || body.storage_confirmed !== true) fail('REPORT_CORRECTION_CONFIRMATION_REQUIRED');
        const input = normalizedInput(body.input); report.input = input; report.revision++; report.fixtureKey = fixtureReport(input, role)?.key || report.fixtureKey;
        return mutation(publicReport(report));
      }
    }
    if (['/report/products', '/ask/products', '/payments/products'].includes(p) && method === 'GET') {
      const reportId = url.searchParams.get('report_id');
      if (reportId) ownedReport(value, role, reportId, p === '/ask/products');
      return { payment_available: true, products: (p === '/report/products' ? ['deep_report_v1'] : ['ask_single_v1', 'ask_pack_3_v1']).map(offer), simulation: true };
    }
    if (p === '/deep/peek' && method === 'POST') return balance(ownedReport(value, role, body.report_id, false));
    if (p === '/deep/history' && method === 'GET') return { items: Object.values(value.answers).filter(a => a.owner === role && !a.deleted).map(a => ({ report_id: a.reportId, result_id: a.id, persisted: true, result_status: 'completed', question: a.question, answer: a.answer, created_at: a.createdAt })) };
    if (p === '/deep/history' && method === 'DELETE') { Object.values(value.answers).filter(a => a.owner === role).forEach(a => { a.deleted = true; }); return mutation({ deleted: true }); }
    match = p.match(/^\/deep\/history\/([a-f0-9]{48})$/);
    if (match && method === 'DELETE') { const answer = value.answers[match[1]]; if (!answer || answer.owner !== role) fail('NOT_FOUND', 404); answer.deleted = true; return mutation({ deleted: true }); }
    if (p === '/ai/deep' && method === 'POST') {
      const report = ownedReport(value, role, body.report_id, true), question = String(body.question || '').trim();
      if (question.length < 2 || question.length > 1200) fail('PRIVATE_ASK_INPUT_INVALID');
      if (!body.idempotency_key || typeof body.idempotency_key !== 'string') fail('IDEMPOTENCY_KEY_REQUIRED');
      const idem = role + ':ask:' + body.idempotency_key;
      if (value.idempotency[idem]) { const prior = value.answers[value.idempotency[idem]]; if (prior.reportId !== report.id || prior.question !== question) fail('IDEMPOTENCY_CONFLICT', 409); return { ...prior.answer, persisted: true, result_status: 'completed', result_id: prior.id, consumption_id: prior.id, remaining: balance(report).remaining }; }
      if (!balance(report).allowed) fail('ASK_CREDIT_EXHAUSTED', 403, '模拟次数已用完，请通过模拟购买补充。');
      for (const id of body.history_ids || []) if (!value.answers[id] || value.answers[id].owner !== role || value.answers[id].reportId !== report.id) fail('ASK_HISTORY_INVALID');
      const source = fixtures().askAnswers?.find(item => item.question === question) || fixtures().askAnswers?.[body.history_ids?.length ? 1 : 0];
      const answer = clone(source?.answer || source || { reply: '【模拟问星】这是一段固定示例回答，用于验证提问、扣次和历史记录。请把问题拆成一个可以观察的具体情境。', parts: [{ label: '示例', body: '写下最近一次发生的具体事情，再区分感受和推测。', source: '模拟示例' }], advice: ['先确认一个实际需要。'], caveat: '未调用模型，不构成针对当前问题的真实分析。' });
      if (report.giftCredits > 0) report.giftCredits--; else report.purchasedCredits--;
      const id = hex(48); value.answers[id] = { id, owner: role, reportId: report.id, question, answer, createdAt: Date.now() }; value.idempotency[idem] = id;
      return mutation({ ...answer, persisted: true, result_status: 'completed', result_id: id, consumption_id: id, remaining: balance(report).remaining, simulation: true });
    }
    if (p === '/payments/orders' && method === 'POST') {
      if (body.consent !== true || body.adult_confirmed !== true) fail('PAYMENT_CONSENT_REQUIRED');
      const key = new Headers(options.headers || {}).get('idempotency-key');
      return mutation(orderResult(newOrder(value, role, body.product_code, body.paid_report_id, key, body)));
    }
    if (p === '/payments/orders' && method === 'GET') return { items: Object.values(value.orders).filter(o => o.owner === role).map(clone) };
    if (p === '/payments/refunds' && method === 'GET') return { items: Object.values(value.orders).filter(o => o.owner === role && o.status === 'refunded').map(o => ({ order_no: o.order_no, refund_no: o.refund_no, amount_fen: o.amount_fen, status: 'completed', simulation: true })) };
    match = p.match(/^\/payments\/orders\/([a-f0-9]{32})(?:\/(close|refunds))?$/);
    if (match) {
      const order = value.orders[match[1]]; if (!order || order.owner !== role) fail('ORDER_NOT_FOUND', 404);
      if (method === 'GET' && !match[2]) return orderResult(order);
      if (method === 'POST' && match[2] === 'close') { if (order.status !== 'created') fail('ORDER_NOT_CLOSABLE', 409); order.status = 'closed'; if (order.giftId) value.gifts[order.giftId].status = 'cancelled'; return mutation(orderResult(order)); }
      if (method === 'POST' && match[2] === 'refunds') fail('SIM_REFUND_USE_GIFT_FLOW', 409, '此模拟仅提供未领取礼物的退款流程；个人报告售后请查看说明。');
    }
    if (p === '/synastry/profile' && method === 'GET') return { name: value.users[role].name, code: CODE[role] };
    if (p === '/synastry/lookup' && method === 'POST') { const target = ROLES.find(r => CODE[r] === body.code && r !== role); if (!target) fail('ACCOUNT_UNAVAILABLE', 404); return { name: value.users[target].name, code: CODE[target] }; }
    if (p === '/synastry/invitations' && method === 'POST') {
      consent(body.consent); if (body.reportId) ownedReport(value, role, body.reportId, true);
      const target = body.targetCode ? ROLES.find(r => CODE[r] === body.targetCode && r !== role) : null;
      if (body.targetCode && !target) fail('ACCOUNT_UNAVAILABLE', 404);
      if (!body.key) fail('IDEMPOTENCY_KEY_REQUIRED');
      const idem = role + ':invite:' + body.key, fingerprint = JSON.stringify(body);
      if (value.idempotency[idem]) { const previous = value.idempotency[idem]; if (previous.fingerprint !== fingerprint) fail('IDEMPOTENCY_CONFLICT', 409); return clone(value.invitations[previous.id]); }
      const item = { id: hex(64), token: hex(64), sender: role, target, senderName: String(body.senderName || value.users[role].name),
        targetName: target ? value.users[target].name : null, reportId: body.reportId || null, status: 'active', expiresAt: Date.now() + 7 * DAY };
      value.invitations[item.id] = item; value.idempotency[idem] = { id: item.id, fingerprint }; return mutation(item);
    }
    if (['/synastry/invitations/inspect', '/synastry/invitations/accept'].includes(p) && method === 'POST') {
      const item = Object.values(value.invitations).find(i => i.token === body.token);
      if (!item || item.sender === role || item.target && item.target !== role || item.expiresAt < Date.now()) fail('INVITE_UNAVAILABLE', 409);
      if (p.endsWith('/inspect')) return { id: item.id, senderName: item.senderName, status: item.status, expiresAt: item.expiresAt };
      consent(body.consent); if (item.status === 'accepted' && item.target === role) return { pairId: item.pairId, status: pairStatus(value, value.pairs[item.pairId]) };
      if (item.status !== 'active') fail('INVITE_UNAVAILABLE', 409);
      if (body.reportId) ownedReport(value, role, body.reportId, true);
      const pair = createPair(value, [item.sender, role], [item.reportId, body.reportId || null]); item.target = role; item.status = 'accepted'; item.pairId = pair.id;
      return mutation({ pairId: pair.id, status: pair.status });
    }
    match = p.match(/^\/synastry\/invitations\/([a-f0-9]{64})\/revoke$/);
    if (match && method === 'POST') { const item = value.invitations[match[1]]; if (!item || item.sender !== role) fail('NOT_FOUND', 404); if (item.status !== 'active') fail('USE_PAIR_UNLINK', 409); item.status = 'revoked'; return mutation({ revoked: true }); }
    if (p === '/synastry/records' && method === 'GET') return { pairs: Object.values(value.pairs).filter(pair => !pair.managed && pair.roles.includes(role)).slice(0, 20).map(pair => ({ id: pair.id, status: pairStatus(value, pair), expiresAt: pair.expiresAt })), invitations: Object.values(value.invitations).filter(item => item.sender === role || item.target === role).slice(0, 20).map(item => ({ ...item, direction: item.sender === role ? 'sent' : 'received' })), hasMore: false, nextCursor: null };
    if (p === '/synastry/managed-pairs' && method === 'GET') return listPage(Object.values(value.pairs).filter(pair => pair.managed && pair.roles[0] === role).map(pair => pairResult(value, role, pair)), url);
    if (p === '/synastry/managed-pairs' && method === 'POST') {
      consent(body.consent); const ids = body.reportIds;
      if (!Array.isArray(ids) || ids.length !== 2 || ids[0] === ids[1]) fail('MANAGED_DISTINCT_REPORTS_REQUIRED');
      const reports = ids.map(id => ownedReport(value, role, id, true));
      if (JSON.stringify(reports[0].input) === JSON.stringify(reports[1].input)) fail('MANAGED_DISTINCT_REPORTS_REQUIRED');
      return mutation(pairResult(value, role, createPair(value, [role, role], ids, true)));
    }
    match = p.match(/^\/synastry\/(pairs|managed-pairs)\/([a-f0-9]{64})(?:\/(report|retry|unlink|remove|support))?$/);
    if (match) {
      const pair = value.pairs[match[2]]; if (!pair || !pair.roles.includes(role) || pair.managed !== (match[1] === 'managed-pairs')) fail('NOT_FOUND', 404);
      if (method === 'GET' && !match[3]) return pairResult(value, role, pair);
      if (method === 'POST' && match[3] === 'report') { consent(body.consent); ownedReport(value, role, body.reportId, true); if (['removed', 'unavailable'].includes(pair.status)) fail('PAIR_UNAVAILABLE', 409); pair.reportIds[pair.roles.indexOf(role)] = body.reportId; pair.revisions[body.reportId] = value.reports[body.reportId].revision; return mutation(pairResult(value, role, pair)); }
      if (method === 'POST' && ['unlink', 'remove'].includes(match[3])) { consent(body); pair.status = 'removed'; return mutation({ id: pair.id, status: pair.status }); }
      if (method === 'POST' && match[3] === 'retry') return pairResult(value, role, pair);
      if (method === 'POST' && match[3] === 'support') return { id: pair.id, status: pairStatus(value, pair), supportRequired: false, simulation: true };
    }
    if (p === '/synastry/gifts/orders' && method === 'POST') {
      if (body.consent !== true || body.adultConfirmed !== true) fail('PAYMENT_CONSENT_REQUIRED'); consent(body.synastryConsent);
      if (body.senderReportId) ownedReport(value, role, body.senderReportId, true);
      const order = newOrder(value, role, 'gift_report_v1', null, body.idempotencyKey, body);
      if (!order.giftId) {
        const bytes = await root.crypto.subtle.digest('SHA-256', new TextEncoder().encode('gift-order:' + order.order_no));
        // Hashing yields once; reject a concurrent identity/state change instead of overwriting it.
        const current = load(); if (current.serial !== value.serial || roleOf() !== role) fail('REPORT_ACCOUNT_CHANGED', 409);
        const gift = { id: Array.from(new Uint8Array(bytes), n => n.toString(16).padStart(2, '0')).join(''), token: hex(64), sender: role, senderName: String(body.senderName || value.users[role].name), senderReportId: body.senderReportId || null, recipient: null, orderId: order.order_no, status: 'created', expiresAt: null }; value.gifts[gift.id] = gift; order.giftId = gift.id;
      }
      return mutation({ gift: visibleGift(value, role, value.gifts[order.giftId]), ...orderResult(order) });
    }
    if (p === '/synastry/gifts' && method === 'GET') return listPage(Object.values(value.gifts).filter(g => g.sender === role || g.recipient === role).map(g => visibleGift(value, role, g)), url);
    if (p === '/synastry/gift-claims/prepare' && method === 'POST') {
      const gift = giftByToken(value, body.token); if (gift.sender === role) fail('GIFT_SELF_CLAIM'); if (gift.status !== 'funded') fail('GIFT_NOT_AVAILABLE', 409);
      const report = prepare(value, role, body); if (report.entitlement === 'active') fail('GIFT_USE_EXISTING_REPORT', 409);
      report.preparedForGift = gift.id; return mutation(publicReport(report));
    }
    if (p === '/synastry/gift-claims' && method === 'POST') {
      const gift = giftByToken(value, body.token); consent(body.consent);
      if (gift.sender === role) fail('GIFT_SELF_CLAIM');
      if (gift.recipient === role && gift.reportId === body.reportId) return visibleGift(value, role, gift);
      if (gift.status !== 'funded') fail('GIFT_NOT_AVAILABLE', 409);
      const report = ownedReport(value, role, body.reportId); if (report.preparedForGift !== gift.id) fail('GIFT_REPORT_INVALID');
      if (report.entitlement === 'active') fail('GIFT_USE_EXISTING_REPORT', 409);
      deliver(report); gift.recipient = role; gift.reportId = report.id; gift.status = 'delivered';
      const pair = createPair(value, [gift.sender, role], [gift.senderReportId, report.id]); gift.pairId = pair.id;
      return mutation(visibleGift(value, role, gift));
    }
    match = p.match(/^\/synastry\/gifts\/([a-f0-9]{64})(?:\/(order|share|retry|refund))?$/);
    if (match) {
      const gift = value.gifts[match[1]]; if (!gift || gift.sender !== role && gift.recipient !== role) fail('GIFT_NOT_FOUND', 404);
      if (method === 'GET' && !match[2]) return visibleGift(value, role, gift);
      if (method === 'GET' && match[2] === 'order') { if (gift.sender !== role) fail('GIFT_NOT_FOUND', 404); return { gift: visibleGift(value, role, gift), ...orderResult(value.orders[gift.orderId]) }; }
      if (method === 'POST' && match[2] === 'share') { if (gift.sender !== role || gift.status !== 'funded') fail('GIFT_NOT_AVAILABLE', 409); return { token: gift.token, senderName: gift.senderName, simulation: true }; }
      if (method === 'POST' && match[2] === 'retry') return visibleGift(value, role, gift);
      if (method === 'POST' && match[2] === 'refund') { consent(body); if (gift.sender !== role || !['funded', 'expired'].includes(gift.status)) fail('GIFT_NOT_REFUNDABLE', 409); gift.status = 'refunded'; const order = value.orders[gift.orderId]; order.status = 'refunded'; order.refund_no = hex(32); return mutation(visibleGift(value, role, gift)); }
    }
    fail('SIM_ENDPOINT_NOT_IMPLEMENTED', 501, '模拟接口尚未实现：' + method + ' ' + p);
  }
  root.fetch = async function (input, init = {}) {
    const url = new URL(typeof input === 'string' || input instanceof URL ? String(input) : input.url, root.location.href);
    if (url.origin !== root.location.origin) return new Response(JSON.stringify({ error: { code: 'SIM_EXTERNAL_NETWORK_BLOCKED', message: '模拟环境禁止访问真实外部服务。' } }), { status: 403, headers: { 'content-type': 'application/json' } });
    if (!(url.href.startsWith(apiBase + '/') || url.href === apiBase)) return nativeFetch(input, init);
    try {
      const raw = init.body !== undefined ? init.body : typeof input?.clone === 'function' ? await input.clone().text() : undefined;
      let body;
      try { body = typeof raw === 'string' && raw ? JSON.parse(raw) : raw || {}; } catch (_) { fail('SIM_INVALID_JSON'); }
      const result = await dispatch(url.pathname + url.search, { method: init.method || input?.method || 'GET', headers: init.headers || input?.headers, body });
      return new Response(JSON.stringify(result), { status: 200, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
    } catch (error) {
      return new Response(JSON.stringify({ error: { code: error.code || 'SIM_INTERNAL_ERROR', message: error.code ? error.message : '模拟处理失败，请重置模拟状态或报告此问题。' }, simulation: true }), { status: error.status || 500, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
    }
  };
  root.addEventListener('storage', event => { if (event.key === KEY) { const value = load(); for (const fn of listeners) { try { fn(stateView(value)); } catch (_) {} } } });
  root.ZXTestSim = Object.freeze({
    login: setRole, setRole, logout: () => setRole(null),
    reset: async () => { root.localStorage.removeItem(KEY); const value = fresh(); root.sessionStorage.removeItem(SESSION_KEY); saveSession(null); publish(value, 'reset'); root.dispatchEvent(new CustomEvent('zx-private-session-cleared')); if (root.zxMember?.me) await root.zxMember.me().catch(() => {}); return stateView(value); },
    getState: () => stateView(load()), onChange: fn => { listeners.add(fn); return () => listeners.delete(fn); },
    confirmPayment, handle: async (path, options) => clone(await dispatch(path, options)),
    orderForCheckout: params => { const match = String(params?.package || '').match(/^prepay_id=simulation_([a-f0-9]{32})$/); if (!match) fail('SIM_CHECKOUT_INVALID'); const value = load(), role = requireRole(value), order = value.orders[match[1]]; if (!order || order.owner !== role) fail('ORDER_NOT_FOUND', 404); return clone(order); },
    storageKey: KEY, apiBase, buildId: BUILD_ID, simulation: true
  });
})(window);
