/* paid-h5.js — 知星付费问星前端（历史文件名保留，支付仅支持微信 JSAPI）。
 *
 * 安全边界：
 * - API、服务号 AppId、政策版本缺一即失败关闭；不回退到 H5 或私人收款。
 * - openid 只由后端通过 snsapi_base OAuth 换取并加密保存，浏览器不接收也不提交。
 * - 浏览器只消费后端返回的 JSAPI 拉起参数；支付和次数到账只认后端订单状态。
 * - 商品必须由用户主动选择，页面不预选单次或三次包。
 */
(function () {
  'use strict';

  var DEFAULTS = Object.freeze({
    paidAskEnabled: false,
    accountApiBase: '',
    paymentOrigin: '',
    merchantLegalName: '',
    supportUrl: '',
    refundUrl: '',
    userAgreementUrl: '',
    membershipRulesUrl: '',
    privacyUrl: '',
    aiDisclosureUrl: '',
    purchaseNoticeUrl: '',
    wechatOfficialAccountAppId: '',
    agreementVersion: '',
    privacyVersion: '',
    membershipTermsVersion: '',
    refundPolicyVersion: '',
    aiDisclosureVersion: '',
    purchaseNoticeVersion: ''
  });
  var REQUIRED_VERSIONS = Object.freeze({
    agreementVersion: 'user-agreement-2026.08.25-paid-ask-v1',
    privacyVersion: 'privacy-2026.08.25-paid-ask-v1',
    membershipTermsVersion: 'ask-credits-2026.08.25-v1',
    refundPolicyVersion: 'refund-2026.08.25-paid-ask-v1',
    aiDisclosureVersion: 'ai-disclosure-2026.08.25-paid-ask-v1',
    purchaseNoticeVersion: 'purchase-notice-2026.08.25-paid-ask-v1'
  });
  var rawConfig = window.ZX_PUBLIC_CONFIG;
  if (!rawConfig || typeof rawConfig !== 'object' || Array.isArray(rawConfig)) rawConfig = {};
  var CONFIG = Object.freeze(Object.keys(DEFAULTS).reduce(function (result, key) {
    if (typeof DEFAULTS[key] === 'boolean') result[key] = rawConfig[key] === true;
    else result[key] = typeof rawConfig[key] === 'string' ? rawConfig[key].trim() : '';
    return result;
  }, {}));

  var PRODUCT_CONTRACT = Object.freeze({
    ask_single_v1: Object.freeze({
      productCode: 'ask_single_v1', title: '单次问星', amountFen: 290,
      questionCredits: 1, unitAmountFen: 290, description: '1 次问星'
    }),
    ask_pack_3_v1: Object.freeze({
      productCode: 'ask_pack_3_v1', title: '三次问星包', amountFen: 600,
      questionCredits: 3, unitAmountFen: 200, description: '3 次问星 · 每次 ¥2'
    })
  });
  var ORDER_RE = /^[a-f0-9]{32}$/i;
  var WECHAT_APP_ID_RE = /^wx[0-9a-f]{16}$/i;
  var PENDING_PURCHASE_KEY = 'zx_pending_paid_ask_purchase_v1';
  var IDENTITY_RESUME_KEY = 'zx_paid_ask_identity_resume_v1';
  var AUTO_OAUTH_BLOCK_KEY = 'zx_paid_ask_auto_oauth_block_v1';
  var ORDER_KEY = 'zx_pending_payment_order_v1';
  var selectedProduct = null;
  var catalog = [];
  var creditsState = { remaining: null, kind: '', expiresAt: null };
  var wechatState = { enabled: false, bound: false, officialAccountAppId: '' };
  var accountMountPromise = null;
  var oauthStartInFlight = false;
  var checkoutPoll = null;
  var checkoutCountdown = null;
  var checkoutInFlight = false;

  function $(id) { return document.getElementById(id); }
  function member() { return window.zxMember || null; }
  function track(name, details) {
    try { return !!(window.ZxAnalytics && ZxAnalytics.track(name, details)); }
    catch (_) { return false; }
  }
  function text(id, value) {
    var node = $(id);
    if (node) node.textContent = String(value == null ? '' : value);
  }
  function clear(node) { if (node) node.replaceChildren(); }
  function button(label, handler, className) {
    var node = document.createElement('button');
    node.type = 'button';
    node.className = 'btn' + (className ? ' ' + className : '');
    node.textContent = label;
    node.addEventListener('click', handler);
    return node;
  }
  function link(label, href, className) {
    var node = document.createElement('a');
    node.className = 'btn' + (className ? ' ' + className : '');
    node.textContent = label;
    node.href = href;
    return node;
  }
  function money(amountFen) {
    var value = Number(amountFen);
    return Number.isInteger(value) && value >= 0 ? '¥' + (value / 100).toFixed(value % 100 ? 2 : 0) : '—';
  }
  function timeValue(value) {
    if (value == null || value === '') return null;
    var numeric = Number(value);
    var date = new Date(Number.isFinite(numeric) ? numeric : String(value));
    return Number.isNaN(date.getTime()) ? null : date.getTime();
  }
  function formatDateTime(value) {
    var timestamp = timeValue(value);
    return timestamp == null ? '' : new Date(timestamp).toLocaleString('zh-CN', {
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
    });
  }
  function randomKey() {
    if (!window.crypto || typeof window.crypto.getRandomValues !== 'function') return '';
    var bytes = new Uint8Array(16);
    window.crypto.getRandomValues(bytes);
    return Array.prototype.map.call(bytes, function (value) {
      return value.toString(16).padStart(2, '0');
    }).join('');
  }

  function safeHttpsUrl(value, options) {
    options = options || {};
    var raw = String(value || '').trim();
    if (!raw) return '';
    try {
      var url = new URL(raw, window.location.href);
      if (url.protocol !== 'https:' || url.username || url.password) return '';
      if (!options.allowSearch && url.search) return '';
      if (!options.allowHash && url.hash) return '';
      return url.href;
    } catch (_) { return ''; }
  }
  function safeApiBase(value) {
    if(window.ZX_TEST_SIMULATION===true && value===window.ZXTestBootstrap.apiBase)return value;
    var safe = safeHttpsUrl(value);
    if (!safe) return '';
    try {
      var url = new URL(safe);
      var host = url.hostname.toLowerCase().replace(/\.$/, '');
      if ((url.pathname && url.pathname !== '/') ||
          (host !== 'zhixng.cn' && !host.endsWith('.zhixng.cn'))) return '';
      return url.origin;
    } catch (_) { return ''; }
  }
  function samePaymentOrigin(value) {
    var safe = safeHttpsUrl(value);
    if (!safe) return false;
    try { return new URL(safe).origin === 'https://zhixng.cn'; }
    catch (_) { return false; }
  }
  function privateReports() {
    return window.ZX_PRIVATE_REPORT_BUILD === true || (window.ZxPaidReports && window.ZxPaidReports.isPrivate()) ||
      ((location.protocol === 'file:' || /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname)) && new URLSearchParams(location.search).get('private-report') === '1');
  }
  function publicConfigReady() {
    if (privateReports()) return false;
    if (CONFIG.paidAskEnabled !== true || !safeApiBase(CONFIG.accountApiBase) ||
        !samePaymentOrigin(CONFIG.paymentOrigin) || !WECHAT_APP_ID_RE.test(CONFIG.wechatOfficialAccountAppId) ||
        !String(CONFIG.merchantLegalName || '').trim()) return false;
    var urls = ['supportUrl', 'refundUrl', 'userAgreementUrl', 'membershipRulesUrl',
      'privacyUrl', 'aiDisclosureUrl', 'purchaseNoticeUrl'];
    if (!urls.every(function (key) { return !!safeHttpsUrl(CONFIG[key], { allowHash: key === 'supportUrl' }); })) return false;
    return Object.keys(REQUIRED_VERSIONS).every(function (key) { return CONFIG[key] === REQUIRED_VERSIONS[key]; });
  }
  function isWeChatBrowser() { return window.ZX_TEST_SIMULATION===true || /MicroMessenger/i.test(navigator.userAgent || ''); }
  function snapshot() {
    var client = member();
    var state = client && client.snapshot ? client.snapshot() : {};
    return {
      serviceConfigured: !!(client && client.serviceConfigured && client.serviceConfigured()),
      configured: !!(client && client.configured && client.configured()),
      ready: !!state.ready,
      authenticated: state.authenticated === true,
      identityKind: String(state.identityKind || ''),
      accountRef: /^[a-f0-9]{64}$/.test(String(state.accountRef || '')) ? String(state.accountRef) : '',
      consentRequired: state.consentRequired === true
    };
  }

  async function api(path, options) {
    options = options || {};
    var base = safeApiBase(CONFIG.accountApiBase);
    if (!base || !publicConfigReady()) {
      var configError = new Error('paid ask is not configured');
      configError.code = 'PAID_ASK_NOT_CONFIGURED';
      throw configError;
    }
    var headers = Object.assign({ 'content-type': 'application/json' }, options.headers || {});
    if (options.auth !== false) {
      var client = member();
      if (!client || typeof client.freshAccessToken !== 'function') {
        var loginError = new Error('login required');
        loginError.code = 'LOGIN_REQUIRED';
        throw loginError;
      }
      var token = await client.freshAccessToken();
      if (!token) {
        var tokenError = new Error('login required');
        tokenError.code = 'LOGIN_REQUIRED';
        throw tokenError;
      }
      headers.authorization = 'Bearer ' + token;
    }
    var controller = typeof AbortController === 'function' ? new AbortController() : null;
    var timer = controller ? window.setTimeout(function () { controller.abort(); }, options.timeoutMs || 20000) : null;
    try {
      var response = await fetch(base + path, {
        method: options.method || 'GET', headers: headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        credentials: 'include', signal: controller ? controller.signal : undefined
      });
      var data = await response.json().catch(function () { return {}; });
      if (!response.ok) {
        var detail = data && data.error;
        var code = detail && typeof detail === 'object' ? detail.code : data.code || detail;
        var error = new Error(detail && detail.message || code || ('HTTP ' + response.status));
        error.status = response.status;
        error.code = String(code || '');
        error.data = data;
        throw error;
      }
      return data;
    } catch (error) {
      if (error && error.name === 'AbortError') {
        var timeoutError = new Error('request timed out');
        timeoutError.code = 'REQUEST_TIMEOUT';
        throw timeoutError;
      }
      throw error;
    } finally {
      if (timer) window.clearTimeout(timer);
    }
  }

  function normalizeProduct(input) {
    input = input || {};
    var code = String(input.product_code || input.productCode || '');
    var contract = PRODUCT_CONTRACT[code];
    if (!contract) return null;
    var required = ['amount_fen', 'question_credits', 'unit_amount_fen', 'currency',
      'auto_renew', 'purchase_eligible'];
    if (required.some(function (key) { return !Object.prototype.hasOwnProperty.call(input, key); })) return null;
    var amount = Number(input.amount_fen);
    var credits = Number(input.question_credits);
    var unit = Number(input.unit_amount_fen);
    if (amount !== contract.amountFen || credits !== contract.questionCredits || unit !== contract.unitAmountFen ||
        input.currency !== 'CNY' || input.auto_renew !== false || typeof input.purchase_eligible !== 'boolean') return null;
    return Object.freeze({
      productCode: code,
      title: String(input.title || contract.title),
      amountFen: amount,
      questionCredits: credits,
      unitAmountFen: unit,
      description: contract.description,
      purchaseEligible: input.purchase_eligible === true,
      reason: String(input.reason || '')
    });
  }
  function normalizeCredits(data) {
    var value = data && data.question_credits || {};
    var remaining = Number(value.remaining);
    if (!Number.isInteger(remaining) || remaining < 0 || value.kind !== 'paid_ask_credits') {
      return { remaining: null, kind: '', expiresAt: null };
    }
    return { remaining: remaining, kind: value.kind, expiresAt: value.expires_at || null };
  }
  async function refreshCredits() {
    var data = await api('/account/me');
    creditsState = normalizeCredits(data);
    return Object.freeze(Object.assign({}, creditsState));
  }
  async function peekCredits() {
    var data = await api('/deep/peek', { method: 'POST' });
    var remaining = Number(data && data.remaining);
    return Object.freeze({
      allowed: data && data.allowed === true,
      remaining: Number.isInteger(remaining) && remaining >= 0 ? remaining : 0,
      kind: String(data && data.kind || '')
    });
  }
  async function refreshWechatStatus() {
    var data = await api('/auth/wechat/status');
    var appId = String(data && data.official_account_appid || '');
    wechatState = {
      enabled: data && data.enabled === true && appId === CONFIG.wechatOfficialAccountAppId,
      bound: data && data.bound === true,
      officialAccountAppId: appId
    };
    if (!wechatState.enabled) wechatState.bound = false;
    return Object.freeze(Object.assign({}, wechatState));
  }
  function trustedOauthUrl(value) {
    var safe = safeHttpsUrl(value, { allowSearch: true, allowHash: true });
    if (!safe) return '';
    try {
      var url = new URL(safe);
      if (url.hostname !== 'open.weixin.qq.com' || url.pathname !== '/connect/oauth2/authorize' ||
          url.searchParams.get('appid') !== CONFIG.wechatOfficialAccountAppId ||
          url.searchParams.get('response_type') !== 'code' ||
          url.searchParams.get('scope') !== 'snsapi_base' ||
          url.hash !== '#wechat_redirect' || !url.searchParams.get('redirect_uri') ||
          !/^[A-Za-z0-9._~-]{16,512}$/.test(url.searchParams.get('state') || '')) return '';
      var redirect = new URL(url.searchParams.get('redirect_uri'));
      if (redirect.origin !== safeApiBase(CONFIG.accountApiBase) ||
          redirect.pathname !== '/auth/wechat/oauth/callback' || redirect.search || redirect.hash ||
          redirect.username || redirect.password) return '';
      return url.href;
    } catch (_) { return ''; }
  }
  function oauthCallbackState() {
    var value = new URLSearchParams(window.location.search).get('wechat_bind') || '';
    return value === 'success' || value === 'failed' ? value : '';
  }
  function rememberIdentityResume(value) {
    var safe = value === '/report.html#sec-deep' ? value : '';
    try {
      if (safe) sessionStorage.setItem(IDENTITY_RESUME_KEY, safe);
      else sessionStorage.removeItem(IDENTITY_RESUME_KEY);
    } catch (_) {}
  }
  function takeIdentityResume() {
    var value = '';
    try {
      value = sessionStorage.getItem(IDENTITY_RESUME_KEY) || '';
      sessionStorage.removeItem(IDENTITY_RESUME_KEY);
    } catch (_) {}
    return value === '/report.html#sec-deep' ? value : '';
  }
  function automaticOauthBlocked() {
    try { return sessionStorage.getItem(AUTO_OAUTH_BLOCK_KEY) === '1'; }
    catch (_) { return false; }
  }
  async function startWechatIdentity(returnPath, resumePath) {
    if (!isWeChatBrowser()) {
      var environmentError = new Error('wechat browser required');
      environmentError.code = 'WECHAT_BROWSER_REQUIRED';
      throw environmentError;
    }
    if (!publicConfigReady()) {
      var configError = new Error('wechat identity is not configured');
      configError.code = 'PAID_ASK_NOT_CONFIGURED';
      throw configError;
    }
    var safeReturnPath = returnPath === '/checkout.html' ? '/checkout.html' : '/account.html';
    try { sessionStorage.removeItem(AUTO_OAUTH_BLOCK_KEY); } catch (_) {}
    rememberIdentityResume(resumePath);
    var data = await api('/auth/wechat/oauth/start', {
      method: 'POST', auth: false, body: { return_path: safeReturnPath }
    });
    var authorizeUrl = trustedOauthUrl(data && data.authorize_url);
    var expiresAt = timeValue(data && data.expires_at);
    if (!authorizeUrl || (expiresAt != null && expiresAt <= Date.now())) {
      var invalidError = new Error('invalid oauth response');
      invalidError.code = 'WECHAT_OAUTH_RESPONSE_INVALID';
      throw invalidError;
    }
    window.location.assign(authorizeUrl);
  }

  function renderAuth() {
    var state = snapshot();
    var actions = $('accountActions');
    if (!actions) return;
    clear(actions);
    if (!state.serviceConfigured || !publicConfigReady()) {
      text('accountBadge', '未开放'); text('accountTitle', '账号与付费问星尚未开放');
      text('accountBody', '你仍可查看排盘与报告。登录、购买及云端记录暂不可用。');
      return;
    }
    if (!isWeChatBrowser()) {
      text('accountBadge', '请在微信打开'); text('accountTitle', '付费问星仅在微信内开放');
      text('accountBody', '请使用微信内置浏览器打开本页，完成服务号授权后可恢复次数、订单和已保存答复。基础图谱仍可查看。');
      return;
    }
    if (!state.configured) {
      text('accountBadge', '待确认'); text('accountTitle', '请先启用设备与账号功能');
      text('accountBody', '微信授权后，还需你确认启用设备与账号功能，才能恢复账号资料。确认前不会创建订单。');
      if (typeof window.ZxAccountEnableFeatures === 'function') {
        actions.append(button('启用设备与账号功能', window.ZxAccountEnableFeatures, 'primary'));
      }
      return;
    }
    if (!state.authenticated || !state.accountRef || state.identityKind !== 'wechat') {
      text('accountBadge', '待授权'); text('accountTitle', '正在进入微信身份确认');
      text('accountBody', '请使用原微信账号登录，以找回已购次数、订单和已保存答复。');
      actions.append(button('微信授权登录', function () {
        startWechatIdentity('/account.html').catch(function () {
          text('accountBody', '微信授权未完成，当前不会创建订单或发起问星。');
        });
      }, 'primary'));
      return;
    }
    text('accountBadge', '已登录'); text('accountTitle', '微信账号已确认');
    text('accountBody', '同一服务号下使用同一微信账号，可恢复次数、订单、完整答复和已保存报告。更换或注销微信账号后无法自动找回，请凭订单号联系人工核验。');
    if (member() && typeof member().logout === 'function') {
      actions.append(button('退出登录', async function () { await member().logout(); await mountAccount(true); }));
    }
  }
  function renderCredits() {
    var remaining = creditsState.remaining;
    var closed = !publicConfigReady();
    var authenticated = snapshot().authenticated && snapshot().accountRef;
    text('memberBadge', closed ? '未开放' : remaining == null ? '未读取' : '剩 ' + remaining + ' 次');
    text('memberTitle', closed ? '问星次数暂不可查询' : remaining == null ? '暂时无法确认问星次数' : '当前可用 ' + remaining + ' 次问星');
    text('memberBody', closed ? '服务开放后，可登录原微信账号查询已购次数。' : remaining == null
      ? (authenticated ? '暂时无法读取次数，请稍后重试。' : '登录原微信账号后，可查询已购次数。')
      : '首问和每次追问各消耗 1 次；模型失败、超时或答案未成功保存时不扣次数。');
    if ($('memberPolicy')) {
      $('memberPolicy').hidden = remaining == null;
      $('memberPolicy').textContent = '已生成的完整答复保存到账号，可在“问答存档”恢复。问星次数不自动续费；分享不会增加次数。';
    }
    var actions = $('memberActions');
    if (actions) { clear(actions); if (!closed && remaining != null) actions.append(link('去问星', './report.html#sec-deep')); }
  }
  function planNodes() {
    return [
      { input: $('planSingle'), product: catalog.find(function (item) { return item.productCode === 'ask_single_v1'; }) },
      { input: $('planPack3'), product: catalog.find(function (item) { return item.productCode === 'ask_pack_3_v1'; }) }
    ];
  }
  function renderCatalog(data) {
    catalog = (data && Array.isArray(data.products) ? data.products : []).map(normalizeProduct).filter(Boolean);
    selectedProduct = null;
    planNodes().forEach(function (entry) {
      if (!entry.input) return;
      entry.input.checked = false;
      entry.input.disabled = !entry.product || !entry.product.purchaseEligible;
    });
    var single = catalog.find(function (item) { return item.productCode === 'ask_single_v1'; });
    var pack = catalog.find(function (item) { return item.productCode === 'ask_pack_3_v1'; });
    if (single) text('planSinglePrice', money(single.amountFen));
    if (pack) text('planPack3Price', money(pack.amountFen));
    if (data && data.payment_available !== true) {
      planNodes().forEach(function (entry) { if (entry.input) entry.input.disabled = true; });
    }
  }
  function selectedRadioProduct() {
    var checked = document.querySelector('input[name="askProduct"]:checked');
    if (!checked) return null;
    return catalog.find(function (item) { return item.productCode === checked.value; }) || null;
  }
  function renderUpgradeState(paymentAvailable) {
    var panel = $('member-upgrade');
    if (!panel) return;
    panel.hidden = !publicConfigReady();
    var state = snapshot();
    var ready = publicConfigReady() && paymentAvailable === true;
    var message = '';
    if (!ready) message = '问星购买尚未开放，暂时不能下单。';
    else if (!isWeChatBrowser()) message = '请在微信内打开本页，登录后再选择商品。';
    else if (!state.authenticated || !state.accountRef) message = '微信登录后，可主动选择单次问星或三次问星包。';
    else if (!wechatState.enabled) message = '微信支付暂不可用，当前不能下单。';
    else if (!wechatState.bound) message = '确认商品后，将前往微信确认本次支付身份。';
    else message = '请选择一种商品。页面不会默认勾选，购买不自动续费。';
    text('upgradeBadge', ready && state.authenticated && state.accountRef && isWeChatBrowser() && wechatState.enabled ? '可选择' : '不可购买');
    text('upgradeStateTitle', ready ? '按次购买问星服务' : '问星购买当前不可用');
    text('upgradeNote', message);
    var enabled = ready && state.authenticated && !!state.accountRef && isWeChatBrowser() && wechatState.enabled;
    planNodes().forEach(function (entry) { if (entry.input) entry.input.disabled = !enabled || !entry.product || !entry.product.purchaseEligible; });
    var actions = $('upgradeActions');
    clear(actions);
    var purchase = button(wechatState.bound ? '确认所选商品' : '选择商品并绑定微信', openPurchase, 'primary');
    purchase.disabled = !enabled;
    actions.append(purchase);
  }
  function renderPurchasePolicyLinks() {
    var root = $('purchasePolicyLinks');
    if (!root) return;
    clear(root);
    [
      ['用户协议', CONFIG.userAgreementUrl], ['问星次数服务规则', CONFIG.membershipRulesUrl],
      ['退款规则', CONFIG.refundUrl], ['隐私政策', CONFIG.privacyUrl],
      ['AI 服务说明', CONFIG.aiDisclosureUrl], ['购买确认摘要', CONFIG.purchaseNoticeUrl]
    ].forEach(function (item) {
      var safe = safeHttpsUrl(item[1]);
      if (!safe) return;
      var node = document.createElement('a'); node.textContent = item[0]; node.href = safe;
      node.target = '_blank'; node.rel = 'noopener noreferrer'; root.append(node);
    });
  }
  function syncPurchaseButton() {
    var primary = $('purchasePrimary');
    if (!primary) return;
    primary.disabled = !($('purchaseAdultConsent').checked && $('purchaseConsent').checked && $('purchasePaymentConsent').checked);
  }
  function openPurchase() {
    selectedProduct = selectedRadioProduct();
    if (!selectedProduct) { text('upgradeNote', '请先主动选择“单次问星”或“三次问星包”。'); return; }
    text('purchaseProduct', selectedProduct.title + ' · ' + selectedProduct.questionCredits + ' 次');
    text('purchaseAmount', money(selectedProduct.amountFen));
    text('purchaseDuration', '次数长期有效；服务停止时依法处理未使用部分');
    text('purchaseMerchant', CONFIG.merchantLegalName || '尚未配置');
    text('purchaseError', '');
    ['purchaseAdultConsent', 'purchaseConsent', 'purchasePaymentConsent'].forEach(function (id) { if ($(id)) $(id).checked = false; });
    syncPurchaseButton(); renderPurchasePolicyLinks();
    $('purchaseDialog').showModal();
  }
  function pendingPurchase(product) {
    var current = readPendingPurchase();
    if (current && current.productCode === product.productCode) return current;
    if (current && current.orderAttemptedAt != null) {
      var conflict = new Error('another order creation is unresolved');
      conflict.code = 'PENDING_ORDER_DIFFERS';
      throw conflict;
    }
    var idempotencyKey = randomKey();
    if (!idempotencyKey) {
      var randomError = new Error('secure randomness unavailable');
      randomError.code = 'RANDOM_UNAVAILABLE';
      throw randomError;
    }
    var value = {
      productCode: product.productCode,
      idempotencyKey: idempotencyKey,
      orderAttemptedAt: null,
      createdAt: Date.now(),
      versions: Object.assign({}, REQUIRED_VERSIONS)
    };
    var encoded = JSON.stringify(value);
    try {
      sessionStorage.setItem(PENDING_PURCHASE_KEY, encoded);
      if (sessionStorage.getItem(PENDING_PURCHASE_KEY) !== encoded) throw new Error('pending purchase was not persisted');
    } catch (cause) {
      var storageError = new Error('purchase idempotency storage unavailable');
      storageError.code = 'PURCHASE_STORAGE_UNAVAILABLE';
      storageError.cause = cause;
      throw storageError;
    }
    return value;
  }
  function readPendingPurchase() {
    try {
      var value = JSON.parse(sessionStorage.getItem(PENDING_PURCHASE_KEY) || 'null');
      if (!value || !PRODUCT_CONTRACT[value.productCode] || !ORDER_RE.test(String(value.idempotencyKey || '')) ||
          (value.orderAttemptedAt != null && !Number.isFinite(Number(value.orderAttemptedAt))) ||
          Date.now() - Number(value.createdAt || 0) > 35 * 60 * 1000) return null;
      if (!value.versions || Object.keys(REQUIRED_VERSIONS).some(function (key) { return value.versions[key] !== REQUIRED_VERSIONS[key]; })) return null;
      return value;
    } catch (_) { return null; }
  }
  function forgetPendingPurchase() { try { sessionStorage.removeItem(PENDING_PURCHASE_KEY); } catch (_) {} }
  function claimPendingPurchase(productCode) {
    var product = PRODUCT_CONTRACT[productCode];
    if (!product) { var productError = new Error('invalid product'); productError.code = 'PRODUCT_INVALID'; throw productError; }
    var value = readPendingPurchase() || pendingPurchase(product);
    if (value.productCode !== productCode) {
      var conflict = new Error('another order creation is unresolved'); conflict.code = 'PENDING_ORDER_DIFFERS'; throw conflict;
    }
    if (value.orderAttemptedAt == null) value.orderAttemptedAt = Date.now();
    var encoded = JSON.stringify(value);
    try {
      sessionStorage.setItem(PENDING_PURCHASE_KEY, encoded);
      if (sessionStorage.getItem(PENDING_PURCHASE_KEY) !== encoded) throw new Error('order idempotency was not persisted');
    } catch (cause) {
      var storageError = new Error('purchase idempotency storage unavailable');
      storageError.code = 'PURCHASE_STORAGE_UNAVAILABLE';
      storageError.cause = cause;
      throw storageError;
    }
    return value;
  }
  async function createOrderForProduct(productCode) {
    var pending = claimPendingPurchase(productCode);
    var data = await api('/payments/orders', {
      method: 'POST', headers: { 'Idempotency-Key': pending.idempotencyKey },
      body: {
        product_code: productCode,
        channel: 'wechatpay_jsapi',
        consent: true,
        agreement_version: CONFIG.agreementVersion,
        privacy_version: CONFIG.privacyVersion,
        membership_terms_version: CONFIG.membershipTermsVersion,
        refund_policy_version: CONFIG.refundPolicyVersion,
        ai_disclosure_version: CONFIG.aiDisclosureVersion,
        purchase_notice_version: CONFIG.purchaseNoticeVersion,
        adult_confirmed: true
      }
    });
    var order = data && data.order || data || {};
    var orderNo = String(order.order_no || data.order_no || '');
    if (!ORDER_RE.test(orderNo)) { var orderError = new Error('invalid order'); orderError.code = 'ORDER_RESPONSE_INVALID'; throw orderError; }
    try { localStorage.setItem(ORDER_KEY, orderNo); } catch (_) {}
    return orderNo;
  }
  async function submitPurchase(event) {
    event.preventDefault();
    if (!selectedProduct || !$('purchaseAdultConsent').checked || !$('purchaseConsent').checked || !$('purchasePaymentConsent').checked) return;
    if (!publicConfigReady() || !isWeChatBrowser() || !snapshot().authenticated || !snapshot().accountRef || !wechatState.enabled) {
      text('purchaseError', '当前暂时无法付款，订单没有创建。请稍后再试。'); return;
    }
    var primary = $('purchasePrimary'); primary.disabled = true;
    try {
      if (!wechatState.bound) {
        pendingPurchase(selectedProduct);
        text('purchaseError', '正在前往微信确认支付身份…');
        await startWechatIdentity('/checkout.html');
        return;
      }
      text('purchaseError', '正在创建订单…');
      var orderNo = await createOrderForProduct(selectedProduct.productCode);
      forgetPendingPurchase();
      window.location.href = './checkout.html?order=' + encodeURIComponent(orderNo);
    } catch (error) {
      var unresolved = readPendingPurchase();
      var message = error && error.code === 'WECHAT_OAUTH_BINDING_REQUIRED'
        ? '微信支付身份尚未绑定，请重新进行服务号授权。'
        : (error && error.code === 'PURCHASE_STORAGE_UNAVAILABLE'
          ? '当前浏览器无法安全保存订单重试标识，本次不会创建订单。请关闭无痕模式或允许会话存储后重试。'
          : (unresolved && unresolved.orderAttemptedAt != null
            ? '订单创建结果暂未确认。请不要更换商品；再次确认会复用同一请求标识，避免重复订单。'
            : '订单没有创建，请稍后重试；不要通过其他入口付款。'));
      text('purchaseError', message);
      primary.disabled = false;
    }
  }

  function unwrapOrder(input) {
    input = input || {};
    return { order: input.order || input, checkout: input.checkout || (input.order && input.order.checkout) || {} };
  }
  function orderState(order) {
    var value = String(order && (order.status || order.state) || '').toLowerCase();
    if (['fulfilled', 'completed', 'active', 'entitled'].includes(value)) return 'active';
    if (['paid', 'success', 'confirming', 'entitlement_pending'].includes(value)) return 'confirming';
    if (['refunding'].includes(value)) return 'refunding';
    if (['refunded'].includes(value)) return 'refunded';
    if (['closed', 'expired', 'cancelled'].includes(value)) return 'expired';
    if (['failed', 'error'].includes(value)) return 'failed';
    return 'waiting';
  }
  function orderLabel(state) {
    return {
      waiting: ['待支付', '等待微信支付', '付款后会自动查询结果，请等待订单确认。'],
      confirming: ['确认中', '支付结果确认中', '请不要重复付款，页面会继续查询订单和次数到账状态。'],
      active: ['已到账', '问星次数已到账', '可以返回问星；首问和追问各消耗 1 次。'],
      expired: ['已关闭', '本次支付未完成', '订单已关闭或过期，没有发放问星次数。'],
      failed: ['未完成', '本次支付没有完成', '没有发放问星次数，请稍后重新尝试。'],
      refunding: ['退款中', '退款正在处理', '到账进度以微信支付和知星订单记录为准。'],
      refunded: ['已退款', '订单已退款', '退款和对应次数调整以订单及原支付渠道记录为准。']
    }[state];
  }
  function productForOrder(order) {
    var code = String(order && (order.product_code || order.product && order.product.product_code) || '');
    return PRODUCT_CONTRACT[code] || null;
  }
  async function loadOrders() {
    var root = $('orderList');
    if (!root) return;
    clear(root);
    if (!publicConfigReady()) {
      text('orderBadge', '未开放'); text('orderStateTitle', '订单查询暂不可用');
      text('orderStateBody', '已有订单问题可联系人工处理，请保留订单号和付款记录。'); return;
    }
    if (!snapshot().authenticated || !snapshot().accountRef) {
      text('orderBadge', '需授权'); text('orderStateTitle', '微信授权后可查看订单');
      text('orderStateBody', '请使用原微信账号登录，查看订单、支付和退款进度。'); return;
    }
    try {
      var data = await api('/payments/orders');
      var items = Array.isArray(data && data.items) ? data.items : Array.isArray(data && data.orders) ? data.orders : [];
      text('orderBadge', String(items.length) + ' 笔');
      text('orderStateTitle', items.length ? '我的问星订单' : '还没有问星订单');
      text('orderStateBody', '支付、退款和次数到账进度会随订单更新。');
      items.forEach(function (input) {
        var data = unwrapOrder(input); var order = data.order; var state = orderState(order); var product = productForOrder(order);
        var article = document.createElement('article'); article.className = 'order-item';
        var content = document.createElement('div');
        var titleNode = document.createElement('h3'); titleNode.className = 'order-title'; titleNode.textContent = product ? product.title : '问星次数服务';
        var meta = document.createElement('p'); meta.className = 'order-meta';
        meta.textContent = money(order.amount_fen) + ' · ' + String(order.order_no || '') + ' · ' + (formatDateTime(order.created_at) || '时间待确认');
        content.append(titleNode, meta);
        var side = document.createElement('div'); side.className = 'order-status'; side.append(document.createTextNode(orderLabel(state)[0]));
        var orderNo = String(order.order_no || '');
        if (ORDER_RE.test(orderNo) && ['waiting', 'confirming'].includes(state)) side.append(link('查看订单', './checkout.html?order=' + encodeURIComponent(orderNo)));
        article.append(content, side); root.append(article);
      });
    } catch (_) {
      text('orderBadge', '读取失败'); text('orderStateTitle', '暂时无法读取订单');
      text('orderStateBody', '页面不会因此假定订单已支付、已退款或次数已到账。');
    }
  }
  function renderServiceLinks(target) {
    if (!target) return;
    clear(target);
    [[CONFIG.supportUrl, '联系客服'], [CONFIG.refundUrl, '退款规则']].forEach(function (item) {
      var safe = safeHttpsUrl(item[0], { allowHash: true });
      if (!safe) return;
      var node = document.createElement('a'); node.href = safe; node.textContent = item[1];
      if (new URL(safe).origin !== window.location.origin) { node.target = '_blank'; node.rel = 'noopener noreferrer'; }
      target.append(node);
    });
  }
  async function mountAccount(force) {
    if (privateReports()) return window.ZxPaidReports ? window.ZxPaidReports.mountAccount() : undefined;
    if (!$('member-upgrade')) return;
    if (accountMountPromise && !force) return accountMountPromise;
    accountMountPromise = (async function () {
      var state = snapshot();
      if (publicConfigReady() && state.configured && member() && typeof member().whenReady === 'function') {
        try { await member().whenReady(); } catch (_) {}
        state = snapshot();
      }
      renderAuth();
      var callbackState = oauthCallbackState();
      if (callbackState === 'success' && state.authenticated && state.accountRef) {
        var clean = new URL(window.location.href);
        clean.searchParams.delete('wechat_bind');
        history.replaceState(null, '', clean.pathname + clean.search + clean.hash);
        var resume = takeIdentityResume();
        if (resume) {
          window.location.replace(resume);
          return;
        }
      }
      if (!publicConfigReady() || !state.configured || !state.authenticated || !state.accountRef) {
        creditsState = { remaining: null, kind: '', expiresAt: null };
        wechatState = { enabled: false, bound: false, officialAccountAppId: '' };
        renderCredits(); renderCatalog({ products: [], payment_available: false }); renderUpgradeState(false); await loadOrders();
        if (publicConfigReady() && state.serviceConfigured && isWeChatBrowser() &&
            !state.authenticated && !oauthStartInFlight && !callbackState && !automaticOauthBlocked()) {
          oauthStartInFlight = true;
          text('accountBody', '正在前往微信服务号授权…');
          try { await startWechatIdentity('/account.html'); }
          catch (_) {
            oauthStartInFlight = false;
            text('accountBody', '微信授权未完成，当前不会创建订单或发起问星。');
          }
        } else if (callbackState && publicConfigReady()) {
          text('accountBody', '微信登录尚未确认，当前不会创建订单或发起问星。可重新授权。');
        }
        return;
      }
      var results = await Promise.allSettled([api('/ask/products'), refreshCredits(), refreshWechatStatus()]);
      var productResult = results[0].status === 'fulfilled' ? results[0].value : { products: [], payment_available: false };
      renderCatalog(productResult); renderCredits(); renderUpgradeState(productResult.payment_available === true); renderAuth();
      await loadOrders(); renderServiceLinks($('orderServiceLinks'));
    })().finally(function () { accountMountPromise = null; });
    return accountMountPromise;
  }

  function validateJsapiCheckout(input) {
    input = input || {};
    var checkout = input.checkout || input;
    var timeStamp = String(checkout.timeStamp || checkout.timestamp || '');
    var timestampNumber = Number(timeStamp);
    var nonceStr = String(checkout.nonceStr || checkout.nonce_str || '');
    var packageValue = String(checkout.package || '');
    var paySign = String(checkout.paySign || checkout.pay_sign || '');
    if (checkout.type !== 'wechatpay_jsapi' || checkout.appId !== CONFIG.wechatOfficialAccountAppId ||
        !/^\d{10}$/.test(timeStamp) || Math.abs(Date.now() / 1000 - timestampNumber) > 2 * 60 * 60 ||
        !/^[A-Za-z0-9_-]{8,64}$/.test(nonceStr) || !/^prepay_id=[A-Za-z0-9_-]{8,128}$/.test(packageValue) ||
        checkout.signType !== 'RSA' || !/^[A-Za-z0-9+/=]{32,1024}$/.test(paySign)) return null;
    return Object.freeze({ appId: checkout.appId, timeStamp: timeStamp, nonceStr: nonceStr,
      package: packageValue, signType: 'RSA', paySign: paySign });
  }
  function invokeJsapi(params) {
    if(window.ZX_TEST_SIMULATION===true)return window.ZXTestUI.invokePayment(params);
    return new Promise(function (resolve, reject) {
      function call() {
        if (!window.WeixinJSBridge || typeof window.WeixinJSBridge.invoke !== 'function') {
          var unavailable = new Error('WeixinJSBridge unavailable'); unavailable.code = 'WEIXIN_BRIDGE_UNAVAILABLE'; reject(unavailable); return;
        }
        window.WeixinJSBridge.invoke('getBrandWCPayRequest', params, function (result) {
          var message = String(result && result.err_msg || '');
          if (message === 'get_brand_wcpay_request:ok') resolve({ outcome: 'submitted' });
          else if (message === 'get_brand_wcpay_request:cancel') resolve({ outcome: 'cancelled' });
          else { var failure = new Error('wechat pay failed'); failure.code = 'WECHAT_PAY_FAILED'; reject(failure); }
        });
      }
      if (window.WeixinJSBridge) call();
      else {
        var once = function () { document.removeEventListener('WeixinJSBridgeReady', once); call(); };
        document.addEventListener('WeixinJSBridgeReady', once, false);
        window.setTimeout(function () {
          document.removeEventListener('WeixinJSBridgeReady', once);
          if (!window.WeixinJSBridge) { var timeout = new Error('WeixinJSBridge timeout'); timeout.code = 'WEIXIN_BRIDGE_TIMEOUT'; reject(timeout); }
        }, 5000);
      }
    });
  }
  function checkoutOrderNo() {
    var value = new URLSearchParams(window.location.search).get('order') || '';
    if (!ORDER_RE.test(value)) { try { value = localStorage.getItem(ORDER_KEY) || ''; } catch (_) {} }
    return ORDER_RE.test(value) ? value : '';
  }
  function renderCountdown(expiresAt) {
    window.clearInterval(checkoutCountdown);
    var end = timeValue(expiresAt);
    if ($('checkoutCountdown')) $('checkoutCountdown').hidden = end == null;
    if (end == null || !$('checkoutCountdown')) { text('checkoutCountdown', ''); return; }
    function tick() {
      var seconds = Math.max(0, Math.floor((end - Date.now()) / 1000));
      text('checkoutCountdown', seconds > 0 ? '订单将在 ' + Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0') + ' 后关闭' : '订单有效期已结束');
      if (!seconds) window.clearInterval(checkoutCountdown);
    }
    tick(); checkoutCountdown = window.setInterval(tick, 1000);
  }
  function scheduleCheckoutPoll(delay) {
    window.clearTimeout(checkoutPoll);
    checkoutPoll = window.setTimeout(refreshCheckout, Math.max(0, Number(delay) || 0));
  }
  function renderCheckout(input) {
    var data = unwrapOrder(input); var order = data.order; var checkout = data.checkout;
    var state = orderState(order); var labels = orderLabel(state); var product = productForOrder(order);
    ['checkoutDetails', 'checkoutRefundNotice', 'checkoutRecoveryNote'].forEach(function (id) { if ($(id)) $(id).hidden = false; });
    text('checkoutBadge', labels[0]); text('checkoutTitle', labels[1]); text('checkoutBody', labels[2]);
    text('checkoutProduct', product ? product.title + ' · ' + product.questionCredits + ' 次' : '问星次数服务');
    text('checkoutAmount', money(order.amount_fen)); text('checkoutOrderNo', order.order_no || '—');
    text('checkoutCreatedAt', formatDateTime(order.created_at) || '—');
    text('checkoutExpiresAt', formatDateTime(order.expires_at || checkout.expires_at) || '—');
    var granted = Number(order.granted_credits);
    text('checkoutCredits', Number.isInteger(granted) && granted >= 0 ? granted + ' 次已到账' : (product ? product.questionCredits + ' 次，支付确认后到账' : '待订单确认'));
    renderCountdown(state === 'waiting' ? order.expires_at || checkout.expires_at : null);
    var actions = $('checkoutActions'); clear(actions); renderServiceLinks($('checkoutServiceLinks'));
    if (state === 'waiting') {
      var params = validateJsapiCheckout(checkout);
      if (!publicConfigReady() || !isWeChatBrowser() || !params) {
        text('checkoutNotice', '当前暂时无法拉起微信支付，本次没有发起付款。请返回订单列表后重试。');
        actions.append(link('返回选择商品', './account.html#member-upgrade', 'primary'));
        return;
      }
      text('checkoutNotice', '付款后请等待订单确认，问星次数到账后会显示在这里。');
      actions.append(button('微信支付', async function () {
        if (checkoutInFlight) return;
        checkoutInFlight = true;
        try {
          var result = await invokeJsapi(params);
          if (result.outcome === 'cancelled') {
            text('checkoutNotice', '你取消了支付，没有发放问星次数。可在订单有效期内重新支付。');
          } else {
            text('checkoutNotice', '正在确认微信支付结果，请不要重复付款。');
            scheduleCheckoutPoll(800);
          }
        } catch (_) { text('checkoutNotice', '微信支付没有完成，当前不会发放问星次数。请稍后重试。'); }
        finally { checkoutInFlight = false; }
      }, 'primary'));
    } else if (state === 'confirming') {
      text('checkoutNotice', labels[2]); actions.append(button('刷新订单状态', function () { scheduleCheckoutPoll(0); }, 'primary')); scheduleCheckoutPoll(1500);
    } else if (state === 'active') {
      text('checkoutNotice', labels[2]); actions.append(link('返回问星', './report.html#sec-deep', 'primary'));
      try { localStorage.removeItem(ORDER_KEY); } catch (_) {}
    } else {
      text('checkoutNotice', labels[2]); actions.append(link('返回我的订单', './account.html#order-center', 'primary'));
    }
  }
  async function refreshCheckout() {
    var orderNo = checkoutOrderNo();
    if (!orderNo || !publicConfigReady() || !snapshot().authenticated || !snapshot().accountRef) return;
    try { renderCheckout(await api('/payments/orders/' + encodeURIComponent(orderNo))); }
    catch (_) {
      text('checkoutBadge', '查询失败'); text('checkoutTitle', '暂时无法确认订单状态');
      text('checkoutBody', '页面不会假定已支付、已退款或次数已到账，请不要重复付款。');
      text('checkoutNotice', '网络恢复后请重新查询；如已扣款，请保留订单号联系人工处理。');
      clear($('checkoutActions')); $('checkoutActions').append(button('重新查询', function () { scheduleCheckoutPoll(0); }, 'primary'));
    }
  }
  async function resumeOauthPurchase() {
    var query = new URLSearchParams(window.location.search);
    if (query.get('wechat_bind') !== 'success') return false;
    var pending = readPendingPurchase();
    if (!pending) return false;
    var identity = snapshot();
    if (!identity.authenticated || !identity.accountRef || identity.identityKind !== 'wechat') return false;
    await refreshWechatStatus();
    if (!wechatState.bound) return false;
    text('checkoutNotice', '微信支付身份已绑定，正在创建你刚才确认的订单…');
    var orderNo = await createOrderForProduct(pending.productCode);
    forgetPendingPurchase();
    var clean = new URL(window.location.href); clean.search = ''; clean.searchParams.set('order', orderNo);
    history.replaceState(null, '', clean.pathname + clean.search);
    return true;
  }
  async function mountCheckout() {
    if (privateReports()) return window.ZxPaidReports ? window.ZxPaidReports.mountCheckout() : undefined;
    if (!$('paidCheckoutPage')) return;
    ['checkoutDetails', 'checkoutRefundNotice', 'checkoutRecoveryNote', 'checkoutCountdown'].forEach(function (id) { if ($(id)) $(id).hidden = true; });
    renderServiceLinks($('checkoutServiceLinks'));
    if (!publicConfigReady()) {
      text('checkoutBadge', '未开放'); text('checkoutTitle', '问星购买尚未开放');
      text('checkoutBody', '问星服务准备中，当前无法下单或付款。');
      text('checkoutNotice', '如需处理已有订单，请保留订单号和付款记录，通过页面底部的反馈入口联系我们。');
      clear($('checkoutActions')); $('checkoutActions').append(link('返回我的', './account.html', 'primary'));
      return;
    }
    if (!isWeChatBrowser()) {
      text('checkoutBadge', '请在微信打开'); text('checkoutTitle', '请在微信内查看订单');
      text('checkoutBody', '使用原微信账号打开本页，以查询订单或继续付款。');
      text('checkoutNotice', '本页尚未发起付款；已有订单会在微信登录后查询。');
      clear($('checkoutActions')); $('checkoutActions').append(link('返回我的订单', './account.html#order-center', 'primary'));
      return;
    }
    try { await member().whenReady(); } catch (_) {}
    var identity = snapshot();
    if (!identity.authenticated || !identity.accountRef || identity.identityKind !== 'wechat') {
      var callbackState = oauthCallbackState();
      text('checkoutBadge', '需授权'); text('checkoutTitle', '正在确认微信身份');
      text('checkoutBody', '请使用原微信账号登录，以恢复订单和问星次数。');
      clear($('checkoutActions'));
      if (callbackState) {
        text('checkoutNotice', '微信登录尚未确认，当前不会发起支付。');
        $('checkoutActions').append(button('重新微信授权', function () {
          startWechatIdentity('/checkout.html').catch(function () {});
        }, 'primary'));
        return;
      }
      var pendingOrderNo = checkoutOrderNo();
      if (pendingOrderNo) {
        try { localStorage.setItem(ORDER_KEY, pendingOrderNo); } catch (_) {}
      }
      text('checkoutNotice', '正在前往微信服务号授权…');
      try { await startWechatIdentity('/checkout.html'); }
      catch (_) {
        text('checkoutNotice', '微信授权未完成，当前不会发起支付。');
      }
      return;
    }
    try { await resumeOauthPurchase(); } catch (_) {
      text('checkoutBadge', '绑定未完成'); text('checkoutTitle', '微信支付身份绑定或订单创建未完成');
      text('checkoutBody', '没有发起支付，也没有发放问星次数。请返回商品页重新确认。');
      clear($('checkoutActions')); $('checkoutActions').append(link('返回选择商品', './account.html#member-upgrade', 'primary')); return;
    }
    var orderNo = checkoutOrderNo();
    if (!orderNo) {
      text('checkoutBadge', '无订单'); text('checkoutTitle', '没有可恢复的支付订单');
      text('checkoutBody', '请返回商品页主动选择并确认商品。');
      text('checkoutNotice', '本页尚未发起付款。如已付款，请到“我的订单”查询。');
      clear($('checkoutActions')); $('checkoutActions').append(link('返回选择商品', './account.html#member-upgrade', 'primary')); return;
    }
    await refreshCheckout();
    window.addEventListener('pageshow', function () { scheduleCheckoutPoll(0); });
    window.addEventListener('focus', function () { scheduleCheckoutPoll(0); });
    window.addEventListener('online', function () { scheduleCheckoutPoll(0); });
    document.addEventListener('visibilitychange', function () { if (!document.hidden) scheduleCheckoutPoll(0); });
  }

  function bindPageEvents() {
    ['planSingle', 'planPack3'].forEach(function (id) {
      if ($(id)) $(id).addEventListener('change', function () { selectedProduct = selectedRadioProduct(); });
    });
    ['purchaseAdultConsent', 'purchaseConsent', 'purchasePaymentConsent'].forEach(function (id) {
      if ($(id)) $(id).addEventListener('change', syncPurchaseButton);
    });
    if ($('purchaseForm')) $('purchaseForm').addEventListener('submit', submitPurchase);
    if ($('purchaseCancel')) $('purchaseCancel').addEventListener('click', function () { $('purchaseDialog').close(); });
  }

  window.ZxPaidAsk = Object.freeze({
    config: CONFIG,
    products: PRODUCT_CONTRACT,
    publicConfigReady: publicConfigReady,
    isWeChatBrowser: isWeChatBrowser,
    normalizeProduct: normalizeProduct,
    validateJsapiCheckout: validateJsapiCheckout,
    invokeReportJsapi: function (input) {
      if (!privateReports() || !member() || !member().paidReportPurchaseReady() || !isWeChatBrowser()) return Promise.reject(new Error('REPORT_PAYMENT_UNAVAILABLE'));
      var params = validateJsapiCheckout(input);
      if (!params) return Promise.reject(new Error('WECHAT_CHECKOUT_INVALID'));
      return invokeJsapi(params);
    },
    credits: refreshCredits,
    peek: peekCredits,
    wechatStatus: refreshWechatStatus,
    ensureIdentity: function (resumePath) {
      if (privateReports()) {
        if (!window.ZxPaidReports) return Promise.reject(new Error('REPORT_SERVICE_UNAVAILABLE'));
        return window.ZxPaidReports.startLogin(window.ZxPaidReports.reportId());
      }
      var identity = snapshot();
      if (identity.authenticated && identity.accountRef && identity.identityKind === 'wechat') {
        return Promise.resolve(Object.freeze({ authenticated: true, accountRef: identity.accountRef }));
      }
      return startWechatIdentity('/account.html', resumePath === '/report.html#sec-deep' ? resumePath : '');
    },
    mountAccount: mountAccount,
    mountCheckout: mountCheckout
  });
  window.ZxPaidH5 = window.ZxPaidAsk;
  if (!privateReports()) bindPageEvents();
  if ($('member-upgrade')) mountAccount();
  if ($('paidCheckoutPage')) mountCheckout();
})();
