/* Private report client. Only server-owned snapshots confer access.
 * The source preview stays local by default. No report text is persisted here.
 */
(function () {
  'use strict';
  var REPORT_RE = /^[a-f0-9]{48}$/;
  var ORDER_RE = /^[a-f0-9]{32}$/;
  var RESUME_KEY = 'zx_private_report_resume_id';
  var RETURN_KEY = 'zx_private_profile_return_v1';
  var GIFT_RETURN_KEY = 'zx_private_gift_return_v1';
  var RETURN_TTL = 30 * 60 * 1000;
  var SYN_PAGES = ['home','rank','invite','invite-external','invite-internal','gift','connections'];
  // Formal policy plus the server's per-account offer authorize purchase.
  var pendingPurchaseKeys = new Map();
  var submittedOrders = new Map(),checkoutRefreshTimer = null;
  var generation = 0;
  var accountPending = null;
  function localPage() { return location.protocol === 'file:' || /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname); }
  function isPrivate() { return window.ZX_PRIVATE_REPORT_BUILD === true || (localPage() && new URLSearchParams(location.search).get('private-report') === '1'); }
  function pruneLocalDrafts() {
    if(!isPrivate())return;
    [[localStorage,'zx_input'],[sessionStorage,'zx_active_input_v1']].forEach(function(entry){
      try{
        var value=JSON.parse(entry[0].getItem(entry[1])||'null'),created=value&&value.createdAt,now=Date.now();
        if(value&&(!Number.isSafeInteger(created)||created<=0||created>now||now-created>=86400000))entry[0].removeItem(entry[1]);
      }catch(_){try{entry[0].removeItem(entry[1]);}catch(_){} }
    });
    try{sessionStorage.removeItem('zx_report_handoff_v1');}catch(_){}
  }
  function error(code) { var e = new Error(code); e.code = code; return e; }
  function checkedId(id) { if (typeof id !== 'string' || !REPORT_RE.test(id)) throw error('REPORT_NOT_FOUND'); return id; }
  function reportId() {
    var values = new URLSearchParams(location.search).getAll('report');
    return values.length === 1 && REPORT_RE.test(values[0]) ? values[0] : '';
  }
  function member() { if (!window.zxMember) throw error('REPORT_SERVICE_UNAVAILABLE'); return window.zxMember; }
  function call(method, args) {
    return Promise.resolve().then(function () {
      if (!isPrivate()) throw error('REPORT_SERVICE_UNAVAILABLE');
      var client = member();
      if (typeof client[method] !== 'function') throw error('REPORT_SERVICE_UNAVAILABLE');
      return client[method].apply(client, args || []);
    });
  }
  function route(file, id, hash) {
    if (file === 'account') file = 'profile';
    var source = /\/(web|v1)\/[^/]*$/.test(location.pathname);
    var path = source ? (file === 'report' ? '../v1/report.html' : '../web/' + (file === 'home' ? 'index' : file) + '.html') : './' + (file === 'home' ? 'app' : file) + '.html';
    var url = new URL(path, location.href);
    if (id) url.searchParams.set('report', checkedId(id));
    if (localPage() && isPrivate()) {
      url.searchParams.set('private-report', '1');
      ['api','deep'].forEach(function (name) {
        var value = new URLSearchParams(location.search).get(name);
        if (!value) return;
        try {
          var endpoint = new URL(value);
          if (/^https?:$/.test(endpoint.protocol) && /^(localhost|127\.0\.0\.1|\[::1\])$/.test(endpoint.hostname) && !endpoint.username && !endpoint.password && !endpoint.search && !endpoint.hash) url.searchParams.set(name, endpoint.href.replace(/\/$/, ''));
        } catch (_) {}
      });
      if (new URLSearchParams(location.search).get('deepMode') === 'mock') url.searchParams.set('deepMode', 'mock');
    }
    if (hash) url.hash = hash;
    return url.href;
  }
  function reportUrl(id) { return route('report', checkedId(id)); }
  function giftReturn() {
    try {
      var value=JSON.parse(sessionStorage.getItem(GIFT_RETURN_KEY)||'null'),now=Date.now();
      if (!value || value.v!==1 || !Number.isSafeInteger(value.createdAt) || value.createdAt>now || now-value.createdAt>=RETURN_TTL ||
          !['purchase','incoming','gift','records'].includes(value.mode) || value.owner && !/^[a-f0-9]{64}$/.test(value.owner) ||
          value.mode==='incoming' && !/^[a-f0-9]{64}$/.test(value.token||'') || value.mode==='gift' && !/^[a-f0-9]{64}$/.test(value.giftId||'') ||
          value.senderReportId && !REPORT_RE.test(value.senderReportId) || value.senderName!==undefined && (typeof value.senderName!=='string'||value.senderName.length>100)) {
        sessionStorage.removeItem(GIFT_RETURN_KEY);return null;
      }
      return value;
    }catch(_){try{sessionStorage.removeItem(GIFT_RETURN_KEY);}catch(_){}return null;}
  }
  function consumeGiftReturn() {
    var value=giftReturn();try{sessionStorage.removeItem(GIFT_RETURN_KEY);}catch(_){}
    var state=member().snapshot();
    return value && state.authenticated && state.identityKind==='wechat' && /^[a-f0-9]{64}$/.test(state.accountRef||'') && (!value.owner||value.owner===state.accountRef) ? value : null;
  }
  async function startGiftLogin(context, assertCurrent) {
    if (!context || !['purchase','incoming','gift','records'].includes(context.mode) ||
        context.mode==='incoming' && !/^[a-f0-9]{64}$/.test(context.token||'') || context.mode==='gift' && !/^[a-f0-9]{64}$/.test(context.giftId||'') ||
        context.senderReportId && !REPORT_RE.test(context.senderReportId) || context.senderName!==undefined && (typeof context.senderName!=='string'||context.senderName.length>100)) throw error('RETURN_PATH_INVALID');
    var state=member().snapshot(),value={v:1,mode:context.mode,createdAt:Date.now(),owner:state.authenticated?state.accountRef:''};
    ['token','giftId','senderReportId','senderName'].forEach(function(key){if(context[key])value[key]=context[key];});
    try{sessionStorage.setItem(GIFT_RETURN_KEY,JSON.stringify(value));}catch(_){throw error('LOCAL_STORAGE_UNAVAILABLE');}
    try{return await startLogin(undefined,{gift:true,assertCurrent:assertCurrent});}catch(e){try{sessionStorage.removeItem(GIFT_RETURN_KEY);}catch(_){}throw e;}
  }
  function synastryReturn() {
    try {
      var value = JSON.parse(sessionStorage.getItem(RETURN_KEY) || 'null'), now = Date.now();
      if (!value || value.returnTo !== 'synastry' || !Number.isSafeInteger(value.createdAt) || value.createdAt > now || now - value.createdAt >= RETURN_TTL ||
          (value.inviteToken && !/^[a-f0-9]{64}$/.test(value.inviteToken)) || (value.chart && !/^[a-f0-9]{32}$/.test(value.chart)) ||
          (value.reportId && !REPORT_RE.test(value.reportId)) || (value.chart && value.reportId) || (value.page && !SYN_PAGES.includes(value.page))) { sessionStorage.removeItem(RETURN_KEY); return null; }
      return value;
    } catch (_) { return null; }
  }
  function rememberSynastryReturn(inviteToken, options) {
    options=options || {};
    if ((options.chart && !/^[a-f0-9]{32}$/.test(options.chart)) || (options.reportId && !REPORT_RE.test(options.reportId)) || (options.chart && options.reportId) || (options.page && !SYN_PAGES.includes(options.page))) throw error('RETURN_PATH_INVALID');
    if (inviteToken !== undefined && inviteToken !== '' && !/^[a-f0-9]{64}$/.test(inviteToken)) throw error('SYN_REQUEST_INVALID');
    var value = {returnTo:'synastry',createdAt:Date.now()};
    if (inviteToken) value.inviteToken = inviteToken;
    ['chart','reportId','page'].forEach(function(key){if(options[key])value[key]=options[key];});
    try { sessionStorage.setItem(RETURN_KEY,JSON.stringify(value)); } catch (_) { throw error('LOCAL_STORAGE_UNAVAILABLE'); }
  }
  function consumeSynastryReturn() {
    var value=synastryReturn(); try { sessionStorage.removeItem(RETURN_KEY); } catch (_) {}
    return value ? Object.assign({},value,{inviteToken:value.inviteToken || ''}) : null;
  }
  function synastryUrl() {
    var value=synastryReturn() || {}, query=new URLSearchParams(location.search), url=new URL(route('synastry'));
    if(query.getAll('return').length===1 && query.get('return')==='synastry') {
      var chart=query.getAll('chart'),report=query.getAll('report'),page=query.getAll('synastry-page');
      if(chart.length===1 && /^[a-f0-9]{32}$/.test(chart[0]) && report.length===0){value.chart=chart[0];delete value.reportId;}
      if(report.length===1 && REPORT_RE.test(report[0]) && chart.length===0){value.reportId=report[0];delete value.chart;}
      if(page.length===1 && SYN_PAGES.includes(page[0]))value.page=page[0];
    }
    if(value.reportId)url.searchParams.set('report',value.reportId);else if(value.chart)url.searchParams.set('chart',value.chart);
    url.hash=value.page || 'home';return url.href;
  }
  function loginUrl(id, options) {
    var url = new URL(route('profile', id, 'account-status'));
    if(options&&options.chartId)options=Object.assign({},options,{chart:options.chart || options.chartId});
    if (options && options.returnTo !== undefined) {
      if (options.returnTo !== 'synastry') throw error('RETURN_PATH_INVALID');
      if ((options.chart && (!/^[a-f0-9]{32}$/.test(options.chart) || id)) || (options.page && !SYN_PAGES.includes(options.page))) throw error('RETURN_PATH_INVALID');
      if (options.inviteToken) rememberSynastryReturn(options.inviteToken,{chart:options.chart,reportId:id,page:options.page});
      url.searchParams.set('return','synastry');
      if(options.chart)url.searchParams.set('chart',options.chart);
      if(options.page)url.searchParams.set('synastry-page',options.page);
    }
    return url.href;
  }
  function homeUrl(id) { return route('home', id === undefined ? undefined : checkedId(id)); }
  function checkoutReport(id) { window.location.assign(route('account', checkedId(id), 'report-purchase')); }
  function checkoutUrl(orderNo, id) {
    if (!ORDER_RE.test(orderNo)) throw error('PAYMENT_ORDER_NOT_FOUND');
    var url = new URL(route('checkout', id)); url.searchParams.set('order', orderNo); return url.href;
  }
  function priceLabel(offer) {
    return offer && offer.currency === 'CNY' && Number.isSafeInteger(offer.amount_fen) && offer.amount_fen > 0 && offer.amount_fen <= 1000000
      ? '¥' + (offer.amount_fen / 100).toFixed(2) : '';
  }
  function salesNotice() {
    var config=window.ZX_PUBLIC_CONFIG||{},notice=config.reportSalesNotice,stopped=config.reportSalesStoppedAt;
    var date=typeof stopped==='number'?stopped:typeof stopped==='string'&&/^\d{4}-\d{2}-\d{2}T/.test(stopped)?Date.parse(stopped):NaN;
    if(typeof notice!=='string'||!notice.trim()||notice.length>2000||!Number.isSafeInteger(date)||date<=0)return null;
    return {text:notice.trim(),stoppedAt:date};
  }
  function renderSalesNotice() {
    var value=salesNotice(),existing=$('reportSalesNotice');
    if(!value){if(existing)existing.remove();return;}
    var host=$('mainContent')||$('reportMain')||document.querySelector('main');if(!host)return;
    var panel=existing||node('aside','','report-sales-notice');panel.id='reportSalesNotice';panel.setAttribute('role','status');
    panel.style.cssText='margin:20px auto;padding:18px 20px;max-width:900px;border:1px solid #a58a50;border-radius:14px;background:#1a2233;color:#e8e4d8;font-size:14px;line-height:1.8';
    panel.replaceChildren(node('strong','深度报告服务公告'),node('p',value.text),node('p','停售日期：'+new Date(value.stoppedAt).toLocaleDateString('zh-CN',{timeZone:'Asia/Shanghai'})));
    if(!existing)host.prepend(panel);
  }
  function purchaseReady() { return !!(window.zxMember && member().paidReportPurchaseReady && member().paidReportPurchaseReady()); }
  function checkoutProduct(order) {
    var products = {deep_report_v1:{amount:1990,credits:1,title:'完整深度报告',note:'赠送1次问星'},
      ask_single_v1:{amount:290,credits:1,title:'单次问星',note:'增加1次问星'},ask_pack_3_v1:{amount:600,credits:3,title:'三次问星包',note:'增加3次问星'}};
    if (!order || !Object.prototype.hasOwnProperty.call(products, order.product_code)) return null;
    var product = products[order.product_code];
    return order.currency === 'CNY' && order.amount_fen === product.amount ? product : null;
  }
  function consent() { return !!(window.ZxPrivacyConsent && window.ZxPrivacyConsent.has('device_account')); }
  function ownedCall(method, args) {
    return Promise.resolve().then(function () {
      if (!isPrivate() || !member().serviceConfigured()) throw error('REPORT_SERVICE_UNAVAILABLE');
      if (!consent()) throw error('PRIVACY_CONSENT_REQUIRED');
      return member().freshAccessToken();
    }).then(function () { return member()[method].apply(member(), args || []); });
  }
  function message(e) {
    var code = String(e && e.code || '');
    if (code === 'PRIVACY_CONSENT_REQUIRED') return '请先确认在当前设备启用账号功能，再登录原微信账号。';
    if (/AUTH|SESSION|TOKEN/.test(code) || e && e.status === 401) return '请登录原微信账号后再查看。';
    if (/NOT_FOUND|NOT_OWNED/.test(code) || e && e.status === 403) return '当前账号无法查看这份报告。';
    if (/SERVICE_UNAVAILABLE|NOT_CONFIGURED/.test(code)) return '报告服务尚未开放，可先返回首页查看基础解读。';
    if (/SALES_NOT_APPROVED/.test(code)) return '购买尚未开放，请稍后再来。';
    return '暂时无法读取，请稍后重试。';
  }
  function $(id) { return document.getElementById(id); }
  function text(id, value) { var n = $(id); if (n) n.textContent = String(value == null ? '' : value); }
  function empty(id) { var n = $(id); if (n) n.replaceChildren(); return n; }
  function hide(id, value) { var n = $(id); if (n) n.hidden = value !== false; }
  function node(tag, value, className) { var n = document.createElement(tag); if (value) n.textContent = value; if (className) n.className = className; return n; }
  function link(label, href) { var n = node('a', label, 'btn'); n.href = href; return n; }
  function button(label, action) { var n = node('button', label, 'btn'); n.type = 'button'; n.addEventListener('click', action); return n; }
  function append(id, child) { if ($(id)) $(id).append(child); }
  function readableState(item) {
    if (item.entitlement_status === 'revoked') return '权益已撤销';
    if (item.entitlement_status !== 'active') return '尚未购买';
    if (item.delivery_status === 'ready' && item.readable) return '可以阅读';
    if (item.delivery_status === 'failed') return '报告待重试';
    return '报告准备中';
  }
  function storageExpiry(value) {
    return Number.isSafeInteger(value) && value > 0 ? new Date(value).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false}) + '（北京时间）' : '';
  }
  function privacyReset() {
    generation += 1;
    try{sessionStorage.removeItem(RETURN_KEY);sessionStorage.removeItem(GIFT_RETURN_KEY);}catch(_){}
    pendingPurchaseKeys.clear();submittedOrders.clear();
    if(checkoutRefreshTimer){clearTimeout(checkoutRefreshTimer);checkoutRefreshTimer=null;}
    ['accountActions','reportList','orderList','privatePurchaseActions','checkoutActions','checkoutServiceLinks','deleteActions'].forEach(empty);
    hide('delete-account'); text('deleteLive','');
    text('reportCount', '—'); text('reportLive', '请重新登录后查看报告。');
    text('orderBadge', '需登录'); text('orderStateTitle', '登录后查看订单'); hide('orderStateTitle', false); text('orderStateBody', '登录后可查询支付与交付状态。');
    text('accountBadge', '未登录'); text('accountTitle', '请登录原微信账号'); text('accountBody', '已退出当前账号，报告内容已从页面清除。');
    text('privatePurchaseBody', '请登录后查看这份报告的状态。');
    ['checkoutProduct','checkoutAmount','checkoutOrderNo','checkoutCreatedAt','checkoutExpiresAt','checkoutCredits'].forEach(function (id) { text(id, ''); });
    hide('checkoutDetails'); text('checkoutTitle', '请登录原微信账号'); text('checkoutBody', '订单详情已从当前页面清除。'); text('checkoutNotice', '登录后可继续查询订单。');
    if($('profile-account')&&window.zxMember&&member().serviceConfigured())renderLogin();
  }
  window.addEventListener('zx-private-session-cleared', privacyReset);
  function authenticated() { var state = member().snapshot(); return state.authenticated === true && state.identityKind === 'wechat' && /^[a-f0-9]{64}$/.test(state.accountRef || ''); }
  async function startLogin(id, giftOptions) {
    if (!consent()) throw error('PRIVACY_CONSENT_REQUIRED');
    if (!(window.ZX_TEST_SIMULATION || /MicroMessenger/i.test(navigator.userAgent || ''))) throw error('WECHAT_BROWSER_REQUIRED');
    var config = window.ZX_PUBLIC_CONFIG || {};
    if (!/^wx[0-9a-f]{16}$/i.test(config.wechatOfficialAccountAppId || '') || !member().serviceConfigured()) throw error('REPORT_SERVICE_UNAVAILABLE');
    var data = await member().wechatOAuthStart('/account.html');
    var target, redirect, base;
    try {
      if(window.ZX_TEST_SIMULATION){
        target=new URL(data.authorize_url);
        const expected=new URL('test-login.html',window.ZXTestBootstrap.baseUrl);
        if(target.origin!==expected.origin||target.pathname!==expected.pathname||target.username||target.password||target.hash||!Number.isFinite(Number(data.expires_at))||Number(data.expires_at)<=Date.now())throw new Error('invalid mock login');
      }else{
      target = new URL(data.authorize_url); redirect = new URL(target.searchParams.get('redirect_uri')); base = new URL(config.accountApiBase);
      if (target.origin !== 'https://open.weixin.qq.com' || target.pathname !== '/connect/oauth2/authorize' || target.username || target.password || target.hash !== '#wechat_redirect' ||
          target.searchParams.get('appid') !== config.wechatOfficialAccountAppId || target.searchParams.get('scope') !== 'snsapi_base' || target.searchParams.get('response_type') !== 'code' ||
          !/^[A-Za-z0-9._~-]{16,512}$/.test(target.searchParams.get('state') || '') || ['appid','redirect_uri','response_type','scope','state'].some(function (key) { return target.searchParams.getAll(key).length !== 1; }) ||
          base.protocol !== 'https:' || !/(^|\.)zhixng\.cn$/.test(base.hostname) || redirect.origin !== base.origin || redirect.pathname !== '/auth/wechat/oauth/callback' || redirect.search || redirect.hash || redirect.username || redirect.password ||
          !Number.isFinite(Number(data.expires_at)) || Number(data.expires_at) <= Date.now()) throw new Error('invalid');
      }
    } catch (_) { throw error('WECHAT_OAUTH_RESPONSE_INVALID'); }
    if(giftOptions?.gift && typeof giftOptions.assertCurrent==='function')giftOptions.assertCurrent();
    try { if (id) sessionStorage.setItem(RESUME_KEY, checkedId(id)); else sessionStorage.removeItem(RESUME_KEY); } catch (_) {}
    var returning = new URLSearchParams(location.search).getAll('return');
    if (!giftOptions?.gift && returning.length === 1 && returning[0] === 'synastry') {
      var context=synastryReturn(), returnUrl=new URL(synastryUrl());
      rememberSynastryReturn(context && context.inviteToken || '',{chart:returnUrl.searchParams.get('chart') || undefined,reportId:returnUrl.searchParams.get('report') || undefined,page:returnUrl.hash.slice(1)});
    } else { try { sessionStorage.removeItem(RETURN_KEY); } catch (_) {} }
    window.location.assign(target.href);
  }
  function restoreLoginReport() {
    var callbacks=new URLSearchParams(location.search).getAll('wechat_bind');
    if(callbacks.length!==1 || !['success','failed'].includes(callbacks[0]))return;
    try {
      var url=new URL(location.href),context=synastryReturn();
      if(context){
        url.searchParams.set('return','synastry');
        if(context.page)url.searchParams.set('synastry-page',context.page);
        if(context.chart&&!url.searchParams.has('report'))url.searchParams.set('chart',context.chart);
      }
      if(callbacks[0]==='success' && !reportId()) {
        var id=sessionStorage.getItem(RESUME_KEY);sessionStorage.removeItem(RESUME_KEY);
        if(REPORT_RE.test(id || '')&&!url.searchParams.has('chart'))url.searchParams.set('report',id);
      }
      if(url.href!==location.href)window.history.replaceState(null,'',url.href);
    } catch (_) {}
  }
  function renderLogin() {
    text('accountBadge', '未登录'); text('accountTitle', '登录原微信账号');
    text('accountBody', '登录原微信账号，可在这里恢复已购报告、问星次数、合盘和订单；本机基础图谱无需登录。');
    var actions = empty('accountActions'); if (!actions) return;
    var check;
    if (!consent()) {
      var label = node('label', '', 'confirm-check'); check = node('input'); check.type = 'checkbox';
      label.append(check, node('span', '我同意在当前设备启用账号功能，用于登录和读取我的报告。')); actions.append(label);
    }
    var login = button('微信登录', async function () {
      if (check && !check.checked) return;
      login.disabled = true;
      try {
        if (check) window.ZxPrivacyConsent.grant('device_account');
        await startLogin(reportId());
      } catch (e) { text('accountBody', e.code === 'WECHAT_BROWSER_REQUIRED' ? '请在微信内打开本页，使用原微信账号登录。' : message(e)); }
      finally { login.disabled = !!check && !check.checked; }
    });
    login.disabled = !!check;
    if (check) check.addEventListener('change', function () { login.disabled = !check.checked; });
    actions.append(login);
    if (!$('profile-account')) actions.append(link('返回日主页', homeUrl()));
  }
  function purchasePanel() {
    var host=$('profile-account') || $('profile-summary'); if (!host) return;
    if (!$('report-purchase')) {
      var panel = node('section', '', 'panel panel-wide'); panel.id = 'report-purchase';
      var title = node('h2', '完整深度报告'); var body = node('p', '', 'state-body'); body.id = 'privatePurchaseBody';
      var actions = node('div', '', 'actions'); actions.id = 'privatePurchaseActions'; panel.append(title, body, actions);
      host.after(panel);
    }
    hide('report-purchase', !reportId());
    text('privatePurchaseBody', '登录后可查看这份报告。'); empty('privatePurchaseActions');
  }
  function renderPurchaseConfirmation(id,epoch) {
    var actions=$('privatePurchaseActions'),config=window.ZX_PUBLIC_CONFIG||{};
    if(!actions)return;
    actions.style.flexDirection='column';actions.style.alignItems='stretch';
    var policies=node('p','','state-body');
    [['用户协议','userAgreementUrl'],['隐私政策','privacyUrl'],['报告服务规则','membershipRulesUrl'],['退款政策','refundUrl'],['AI服务说明','aiDisclosureUrl'],['购买须知','purchaseNoticeUrl']].forEach(function(item,index){
      var a=node('a',item[0]);a.href=config[item[1]];a.target='_blank';a.rel='noopener';policies.append(index ? document.createTextNode(' · ') : document.createTextNode(''),a);
    });
    function check(id,label){var wrap=node('label','','confirm-check'),input=node('input');input.type='checkbox';input.id=id;wrap.append(input,node('span',label));actions.append(wrap);return input;}
    actions.append(policies);
    var policy=check('reportPurchasePolicyConsent','我已阅读并同意以上六项条款，确认购买当前盘面的完整报告。');
    var adult=check('reportPurchaseAdultConsent','我已满18周岁。');
    var inFlight=false;
    var submit=button('确认购买 ¥19.90',async function(){
      if(inFlight||!policy.checked||!adult.checked||epoch!==generation)return;
      inFlight=true;submit.disabled=true;
      try{
        var owner=member().snapshot().accountRef,key=owner+':'+id;
        if(!pendingPurchaseKeys.has(key)){var bytes=new Uint8Array(16);crypto.getRandomValues(bytes);pendingPurchaseKeys.set(key,Array.from(bytes,function(b){return b.toString(16).padStart(2,'0');}).join(''));}
        var result=await member().paidReportCreateOrder(id,{policyConsent:true,adultConfirmed:true},pendingPurchaseKeys.get(key));
        if(epoch!==generation||member().snapshot().accountRef!==owner)return;
        var order=result.order;
        if(!order||!ORDER_RE.test(order.order_no||'')||order.paid_report_id!==id||order.product_code!=='deep_report_v1'||order.amount_fen!==1990||order.currency!=='CNY')throw error('ORDER_RESPONSE_INVALID');
        window.location.assign(checkoutUrl(order.order_no,id));
      }catch(e){if(epoch===generation){policy.checked=false;adult.checked=false;text('privatePurchaseBody',e.code==='WECHAT_BROWSER_REQUIRED'?'请在手机微信内打开本页完成支付。':'订单结果尚未确认。请先查看我的订单；再次确认会复用本次请求，避免重复建单。');}}
      finally{inFlight=false;if(epoch===generation)submit.disabled=!policy.checked||!adult.checked;}
    });
    submit.id='reportPurchaseSubmit';submit.disabled=true;
    function update(){submit.disabled=inFlight||!policy.checked||!adult.checked;}
    policy.addEventListener('change',update);adult.addEventListener('change',update);actions.append(submit);
  }
  async function renderPurchase(epoch) {
    var id = reportId(); if (!id) return;
    try {
      var state = await api.status(id); if (epoch !== generation) return;
      text('privatePurchaseBody', readableState(state));
      if (state.entitlement_status === 'active') {
        append('privatePurchaseActions', link('进入这份报告', reportUrl(id)));
        var balance;
        try { balance = await api.balance(id); }
        catch (_) { if (epoch === generation) text('privatePurchaseBody', readableState(state) + ' · 问星次数暂时无法读取'); return; }
        if (epoch !== generation) return;
        var remaining = balance && balance.remaining;
        if (Number.isInteger(remaining) && remaining >= 0) text('privatePurchaseBody', readableState(state) + ' · 本盘可用问星 ' + remaining + ' 次');
      } else if (state.entitlement_status === 'unpaid') {
        var catalog = await api.products(id); if (epoch !== generation) return;
        var report = (catalog.products || []).find(function (item) { return item.product_code === 'deep_report_v1'; });
        var price = priceLabel(report);
        var allowed = purchaseReady() && report && report.purchase_eligible === true && report.payment_available === true &&
          report.amount_fen === 1990 && report.currency === 'CNY';
        text('privatePurchaseBody', price ? price + ' · 赠送1次问星。根据你的盘面对知星进行任意提问解读。' + (allowed ? '购买后可阅读完整五章，并下载保存。' : '购买暂未开放。')
          : '完整报告尚未开放购买。赠送1次问星，根据你的盘面对知星进行任意提问解读。');
        if (allowed) renderPurchaseConfirmation(id,epoch);
        else {var closed = button('暂未开放购买', function () {}); closed.disabled = true; append('privatePurchaseActions', closed);}
      }
    } catch (e) { if (epoch === generation) text('privatePurchaseBody', message(e)); }
  }
  async function renderReportPage(epoch, before) {
    var result = await api.list(before ? {before:before} : undefined); if (epoch !== generation) return;
    var list = $('reportList'); if (!list) return;
    if (!before) list.replaceChildren();
    (result.items || []).forEach(function (item) {
      if (!REPORT_RE.test(item.report_id || '')) return;
      var row = node('article', '', 'report-item');
      var content = node('div'); content.append(node('strong', item.title || '深度发展报告'), node('p', readableState(item), 'state-body'));
      var expiry = storageExpiry(item.storage_expires_at || item.expires_at);
      if (expiry) content.append(node('p','保存至 ' + expiry,'state-body'));
      var actions = node('div', '', 'report-item-actions');
      actions.append(link(item.entitlement_status === 'unpaid' ? '查看报告状态' : '进入报告', item.entitlement_status === 'unpaid' ? route('account', item.report_id, 'report-purchase') : reportUrl(item.report_id)));
      row.append(content, actions); list.append(row);
    });
    text('reportCount', String(list.children.length) + ' 份');
    if (!list.children.length) list.append(node('p', '还没有已购报告。可返回首页选择并确认盘面。', 'report-empty'));
    empty('reportLive');
    if (Number.isSafeInteger(result.next_before) && result.next_before > 0) {
      append('reportLive', button('加载更多', async function () { try { await renderReportPage(epoch, result.next_before); } catch (e) { if (epoch === generation) text('reportLive', message(e)); } }));
    }
  }
  async function renderOrders(epoch) {
    try {
      var result = await ownedCall('paymentOrders'); if (epoch !== generation) return;
      var list = empty('orderList');
      var orders = Array.isArray(result) ? result : result.orders || result.items || [];
      orders.forEach(function (order) {
        if (!list || !ORDER_RE.test(order.order_no || '')) return;
        var row = node('article', '', 'order-item');
        row.append(node('span', (order.product_code === 'deep_report_v1' ? '完整深度报告' : order.product_code === 'gift_report_v1' ? '赠送深度报告' : '问星次数') + ' · ' + String(order.order_no)), link('查看订单', checkoutUrl(order.order_no, REPORT_RE.test(order.paid_report_id || '') ? order.paid_report_id : undefined))); list.append(row);
      });
      text('orderBadge', String(orders.length) + ' 笔'); hide('orderStateTitle', orders.length > 0); text('orderStateTitle', orders.length ? '' : '暂无订单'); text('orderStateBody', '支付与交付状态以订单查询结果为准。');
    } catch (e) { if (epoch === generation) text('orderStateBody', message(e)); }
  }
  function closureNotice(closure) {
    var details = [];
    if (Number.isSafeInteger(closure.refunds_pending) && closure.refunds_pending > 0) details.push('待退款 ' + closure.refunds_pending + ' 笔');
    if (Number.isSafeInteger(closure.pending_orders) && closure.pending_orders > 0) details.push('待核对订单 ' + closure.pending_orders + ' 笔');
    if (Number.isSafeInteger(closure.pending_requests) && closure.pending_requests > 0) details.push('处理中请求 ' + closure.pending_requests + ' 个');
    return '注销申请已提交，退款结清后完成注销。当前尚未注销，请保留账号以便查看进度。' + (details.length ? ' ' + details.join('；') + '。' : '');
  }
  async function renderClosure(epoch) {
    if (!member().accountClosure || epoch !== generation || !authenticated()) return;
    hide('delete-account',false); text('deleteTitle','注销账号'); text('deleteLive','正在读取注销状态……');
    var actions=empty('deleteActions');
    try {
      var result=await call('accountClosure'); if(epoch!==generation)return;
      text('deleteLive','');
      if(result.closure){
        var closure=result.closure;
        text('deleteTitle',closure.status==='completed'?'账号注销已完成':'注销处理中');
        text('deleteBody',closure.status==='completed'?'服务器已确认注销完成；依法需要保留的交易记录按规定期限保存。':closureNotice(closure));
        if(closure.status!=='completed')actions.append(button('刷新注销进度',function(){return renderClosure(epoch);}));
        return;
      }
      text('deleteBody','注销会先结清应退款项，再永久删除账号中的报告和问星记录，无法恢复。已经下载到设备的文件仍由你自行保管；依法需要保留的交易记录按规定期限保存。');
      var label=node('label','','confirm-check'),check=node('input');check.type='checkbox';check.id='privateClosureConsent';
      label.append(check,node('span','我申请先处理退款，再注销账号，并确认账号资料删除后无法恢复。'));actions.append(label);
      var submit=button('确认申请注销',async function(){
        if(!check.checked||epoch!==generation)return;submit.disabled=true;
        try{
          var data=await call('deleteAccount',[{confirmed:true,refundBeforeDelete:true,irreversibleConfirmed:true}]);
          // Completed deletion intentionally clears the owner session (and generation).
          if(data.status==='completed'&&data.ok===true&&data.recoverable===false){
            if(member().snapshot().authenticated)return;
            hide('delete-account',false);empty('deleteActions');text('deleteTitle','账号注销已完成');text('deleteBody','服务器已确认注销完成，账号资料无法恢复。');text('deleteLive','');return;
          }
          if(epoch!==generation)return;
          if(data.status!=='closure_pending'||!data.closure)throw error('ACCOUNT_CLOSURE_RESPONSE_INVALID');
          empty('deleteActions');text('deleteTitle','注销处理中');text('deleteBody',closureNotice(data.closure));
          append('deleteActions',button('刷新注销进度',function(){return renderClosure(epoch);}));text('deleteLive','');
        }catch(e){
          if(epoch!==generation)return;
          text('deleteLive',e&&e.status===401?'会话已结束，当前无法确认注销是否完成。':'申请结果暂时无法确认，请先刷新注销进度，不要重复提交。');
          empty('deleteActions');append('deleteActions',button('刷新注销进度',function(){return renderClosure(epoch);}));
        }
      });submit.id='privateClosureSubmit';submit.disabled=true;check.addEventListener('change',function(){submit.disabled=!check.checked;});actions.append(submit);
    }catch(e){
      if(epoch!==generation)return;
      text('deleteLive',e&&e.status===401?'会话已结束，当前无法确认注销是否完成。':'暂时无法读取注销状态，请稍后刷新。');
      append('deleteActions',button('刷新注销进度',function(){return renderClosure(epoch);}));
    }
  }
  function mountAccount() {
    var integrated=!!$('profile-account');
    if (!isPrivate() || (!integrated && !$('profile-summary'))) return Promise.resolve();
    if (accountPending) return accountPending;
    var epoch = ++generation;
    accountPending = (async function () {
      restoreLoginReport();
      if (!integrated) {
        ['membership-status','member-upgrade','cloud-sync','daily-qian','qa-archive','local-data','delete-account','saveReportDialog','renameDialog'].forEach(function (id) { hide(id); });
        var identity = document.querySelector('.profile-identity'); if (identity) identity.hidden = true;
        var reportHeading = document.querySelector('#profile-summary .panel-title'); if (reportHeading) reportHeading.textContent = '我的报告';
        hide('reportLibraryTitle'); text('profileBadge', '账号报告'); text('reportCount', '—'); empty('reportList');
        if ($('newReportLink')) $('newReportLink').href = homeUrl();
      }
      if($('accountProfileLink'))$('accountProfileLink').href=route('profile',reportId());
      var back = $('reportLink'); if (back) { back.href = reportId() ? reportUrl(reportId()) : homeUrl(); back.textContent = reportId() ? '返回当前报告' : '返回日主页'; }
      purchasePanel();
      empty('orderList'); hide('delete-account'); empty('deleteActions');
      text('orderBadge','待登录');text('orderStateTitle','登录后查看订单');hide('orderStateTitle',false);text('orderStateBody','支付、交付与退款进度都会保留在原微信账号。');
      if (!window.zxMember || !member().serviceConfigured()) {
        text('accountBadge','暂未开放');text('accountTitle','账号服务暂未开放');text('accountBody','本机图谱、昵称和日主页可以继续使用。账号服务开放后，可在此登录并恢复已购记录。');
        empty('accountActions');text('orderBadge','暂未开放');text('orderStateTitle','订单服务暂未开放');text('orderStateBody','当前没有可完成的付款流程，请勿通过其他入口付款。');text('reportLive','报告服务尚未开放。');text('privatePurchaseBody','报告服务尚未开放，可保留当前图谱，稍后再查看。');return;
      }
      if (!consent()) { text('reportLive', '登录后查看报告。'); renderLogin(); return; }
      try { await member().start(); } catch (_) {}
      if (epoch !== generation) return;
      if (!authenticated()) { text('reportLive', '登录后查看报告。'); renderLogin(); return; }
      text('accountBadge', '已登录'); text('accountTitle', '微信账号已确认'); text('accountBody', '已购报告、问星、合盘和订单归属当前微信账号。本机基础图谱继续保留在当前浏览器。');
      var actions = empty('accountActions'); if (actions) actions.append(button('刷新账号记录',mountAccount), button('退出登录', async function () {
        try { await member().logout(); await mountAccount(); }
        catch (_) { text('accountBody','退出结果暂未确认，请刷新账号状态后重试。'); }
      }));
      if (new URLSearchParams(location.search).get('wechat_bind') === 'success' && synastryReturn()) {
        window.location.replace(synastryUrl());return;
      }
      await Promise.all([integrated ? Promise.resolve() : renderReportPage(epoch).catch(function (e) { if (epoch === generation) text('reportLive', message(e)); }), renderPurchase(epoch), renderOrders(epoch),renderClosure(epoch)]);
    })().finally(function () { accountPending = null; });
    return accountPending;
  }
  async function mountCheckout() {
    if (!isPrivate() || !$('paidCheckoutPage')) return;
    if(checkoutRefreshTimer){clearTimeout(checkoutRefreshTimer);checkoutRefreshTimer=null;}
    var epoch = ++generation; var params = new URLSearchParams(location.search); var values = params.getAll('order');
    var orderNo = values.length === 1 && ORDER_RE.test(values[0]) ? values[0] : '';
    empty('checkoutActions'); hide('checkoutDetails'); hide('checkoutRefundNotice'); hide('checkoutCountdown'); hide('checkoutRecoveryNote', false);
    text('checkoutNotice', '支付与报告交付以服务端查询结果为准。');
    if (!orderNo) { text('checkoutBadge', '无订单'); text('checkoutTitle', '没有可恢复的订单'); text('checkoutBody', '请到我的订单查看。'); append('checkoutActions', link('返回我的账户', loginUrl(reportId()))); return; }
    try {
      if (!consent()) throw error('PRIVACY_CONSENT_REQUIRED');
      await member().whenReady(); if (epoch !== generation) return;
      if (!authenticated()) throw error('WECHAT_AUTHENTICATION_REQUIRED');
      var result = await ownedCall('paymentOrder', [orderNo]); if (epoch !== generation) return;
      var order = result.order || result;
      if (order.order_no !== orderNo) throw error('ORDER_RESPONSE_INVALID');
      if(order.product_code==='gift_report_v1'){
        if(order.amount_fen!==1990||order.currency!=='CNY'||order.paid_report_id!=null)throw error('ORDER_RESPONSE_INVALID');
        text('checkoutBadge','赠送订单');text('checkoutTitle','送出的一份了解');text('checkoutBody','查看付款、发送礼物与领取状态。');
        text('checkoutProduct','赠送深度报告');text('checkoutAmount',priceLabel(order));text('checkoutOrderNo',order.order_no);
        text('checkoutNotice','');hide('checkoutRecoveryNote');
        if(window.ZxProfileGift&&member().giftReportServiceAvailable?.())append('checkoutActions',button('查看赠送详情',function(){window.ZxProfileGift.openOrder(orderNo);}));
        else text('checkoutNotice','赠送服务暂未开放。');
        append('checkoutActions',link('返回我的订单',route('account',undefined,'order-center')));
        return;
      }
      var product = checkoutProduct(order);
      var id = REPORT_RE.test(order.paid_report_id || '') ? order.paid_report_id : '';
      var paid = order.provider_trade_state === 'SUCCESS' && Number(order.paid_at) > 0;
      var done = paid && order.status === 'completed';
      text('checkoutProduct', product ? product.title : '订单商品');
      text('checkoutAmount', priceLabel(order) || '—');
      text('checkoutOrderNo', order.order_no); text('checkoutCreatedAt', order.created_at ? new Date(Number(order.created_at)).toLocaleString('zh-CN') : '—'); text('checkoutExpiresAt', order.expires_at ? new Date(Number(order.expires_at)).toLocaleString('zh-CN') : '—');
      text('checkoutCredits', order.status === 'refunded' ? '本单退款已完成' : done ? '以对应报告内可用次数为准' : '等待服务端交付'); hide('checkoutDetails', false);
      if (done && id) {
        submittedOrders.delete(orderNo);
        text('checkoutBadge', '已完成'); text('checkoutTitle', '支付与交付已确认'); text('checkoutBody', '可返回对应报告继续阅读。');
        append('checkoutActions', link('返回这份报告', reportUrl(id) + (order.product_code === 'deep_report_v1' ? '' : '#sec-deep')));
      } else if (paid && order.status === 'entitlement_pending' && id) {
        text('checkoutBadge', '已付款'); text('checkoutTitle', '报告正在准备'); text('checkoutBody', '已确认收款，请勿重复付款。可进入报告查看交付状态并重试。');
        append('checkoutActions', link('查看报告状态', reportUrl(id)));
      } else if (!paid && order.status === 'created' && submittedOrders.has(orderNo)) {
        text('checkoutBadge','核对中');text('checkoutTitle','正在核对支付结果');
        text('checkoutBody','已收到微信支付返回结果，请勿重复付款。正在向服务端确认收款与报告交付，也可点击下方刷新订单状态。');
        if(Date.now()-submittedOrders.get(orderNo)<60000)checkoutRefreshTimer=setTimeout(function(){if(epoch===generation)mountCheckout();},11000);
      } else if (!paid && id && order.status === 'created' && product &&
          Number(order.expires_at)>Date.now() && purchaseReady() &&
          window.ZxPaidAsk && window.ZxPaidAsk.validateJsapiCheckout(result)) {
        text('checkoutBadge','待支付');text('checkoutTitle','确认微信支付');text('checkoutBody',product.title+' '+priceLabel(order)+'，'+product.note+'。请在微信支付页核对商户和金额。');
        var pay=button('微信支付 '+priceLabel(order),async function(){
          if(epoch!==generation)return;pay.disabled=true;
          try{
            var owner=member().snapshot().accountRef,fresh=await ownedCall('paymentOrder',[orderNo]);
            if(epoch!==generation||member().snapshot().accountRef!==owner)return;
            var current=fresh.order;
            if(!current||current.order_no!==orderNo||current.paid_report_id!==id||current.product_code!==order.product_code||!checkoutProduct(current)||current.status!=='created'||Number(current.expires_at)<=Date.now())throw error('ORDER_RESPONSE_INVALID');
            if(current.product_code!=='deep_report_v1'){
              var report=await api.status(id),catalog=await api.products(id,'ask');
              if(epoch!==generation||member().snapshot().accountRef!==owner)return;
              var matches=(catalog.products||[]).filter(function(item){return item.product_code===current.product_code;});
              var offer=matches.length===1?matches[0]:null,expiry=report.storage_expires_at||report.expires_at;
              if(report.report_id!==id||report.readable!==true||report.entitlement_status!=='active'||report.delivery_status!=='ready'||report.unavailable_reason||
                  !Number.isSafeInteger(expiry)||expiry<=Date.now()||catalog.payment_available!==true||
                  !offer||offer.payment_available!==true||offer.purchase_eligible!==true||!checkoutProduct(offer)||offer.question_credits!==product.credits)throw error('ASK_PURCHASE_UNAVAILABLE');
            }
            var outcome=await window.ZxPaidAsk.invokeReportJsapi(fresh);
            if(epoch!==generation)return;
            if(outcome.outcome==='submitted')submittedOrders.set(orderNo,Date.now());
            text('checkoutBody',outcome.outcome==='cancelled'?'已取消微信支付，订单尚未确认收款。':'微信支付结果已返回，正在向服务端核对付款与交付。');
            await mountCheckout();
          }catch(e){if(epoch===generation){text('checkoutBody','支付结果尚未确认，请刷新订单状态核对；系统不会根据浏览器提示发放报告。');pay.disabled=false;}}
        });pay.id='reportCheckoutPay';append('checkoutActions',pay);
      } else {
        text('checkoutBadge', order.status === 'manual_review' ? '人工核验' : order.status === 'refunded' ? '已退款' : '待确认');
        text('checkoutTitle', order.status === 'manual_review' ? '订单需要人工核验' : order.status === 'refunded' ? '退款已完成' : '订单状态待确认');
        text('checkoutBody', order.status === 'refunded' ? '退款已完成，可返回我的订单查看记录。'
          : paid ? '已确认收款，请到订单售后核对当前处理状态。' : '当前购买尚未开放。本页不会发起付款，也不会根据浏览器支付提示发放权益。');
      }
      append('checkoutActions', button('刷新订单状态', mountCheckout)); append('checkoutActions', link('返回我的订单', route('account', id, 'order-center')));
    } catch (e) {
      if (epoch !== generation) return;
      text('checkoutBadge', '暂不可用'); text('checkoutTitle', '暂时无法读取订单'); text('checkoutBody', message(e));
      append('checkoutActions', link('登录并查看订单', loginUrl(reportId())));
    }
  }
  var api = Object.freeze({
    startGiftLogin:startGiftLogin,consumeGiftReturn:consumeGiftReturn,hasGiftReturn:function(){return !!giftReturn();},
    isPrivate:isPrivate, reportId:reportId, reportUrl:reportUrl, profileUrl:function(){return route('profile',reportId());}, loginUrl:loginUrl, homeUrl:homeUrl, checkoutReport:checkoutReport, checkoutUrl:checkoutUrl,
    preview:function (input, confirmation) { return call('paidReportPreview', [input,confirmation]); },
    prepare:function (input, confirmation) { return call('paidReportPrepare', [input,confirmation]); },
    list:function (options) { return call('paidReportList', [options]); },
    read:function (id) { return call('paidReportRead', [id]); },
    status:function (id) { return call('paidReportRead', [id,'status']); },
    retry:function (id) { return call('paidReportRetry', [id]); },
    remove:function (id,confirmation) { return call('paidReportDelete',[id,confirmation]); },
    correct:function (id,input,confirmation,key) { return call('paidReportCorrect',[id,input,confirmation,key]); },
    balance:function (id) { return call('paidReportBalance', [id]); },
    products:function (id,kind) { return call('paidReportProducts', [id,kind || 'report']); },
    priceLabel:priceLabel, salesNotice:salesNotice, pruneLocalDrafts:pruneLocalDrafts, purchaseReady:purchaseReady, startLogin:startLogin, restoreLoginReport:restoreLoginReport, synastryUrl:synastryUrl, rememberSynastryReturn:rememberSynastryReturn, consumeSynastryReturn:consumeSynastryReturn, mountAccount:mountAccount, mountCheckout:mountCheckout
  });
  window.ZxPaidReports = api;
  pruneLocalDrafts();
  document.addEventListener('visibilitychange',function(){if(!document.hidden)pruneLocalDrafts();});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',renderSalesNotice,{once:true});else renderSalesNotice();
  window.addEventListener('pageshow', function (event) {
    pruneLocalDrafts();
    if (event.persisted && isPrivate()) { privacyReset(); if ($('paidCheckoutPage')) mountCheckout(); else if ($('profile-summary') || $('profile-account')) mountAccount(); }
  });
})();
