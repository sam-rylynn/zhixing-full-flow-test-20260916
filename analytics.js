/*
 * 知星最小化产品埋点。
 *
 * - 只接受固定事件名与枚举字段，不接收出生资料、图谱、问题正文、手机号、
 *   账号令牌、设备标识或任意自由文本。
 * - 默认只保留当前页面内最多 40 条调试事件；只有公开配置了受信任的 HTTPS
 *   analyticsEndpoint 时才发送，且不携带 Cookie、Referer 或持久化标识。
 */
(function (root) {
  'use strict';

  var EVENT_NAMES = new Set([
    'page_view','home_view',
    'birth_consent_shown','birth_consent_granted','birth_consent_declined',
    'chart_generated','report_opened','report_section_viewed',
    'today_card_generated','share_started','native_share_completed','poster_saved','share_failed','report_unlocked',
    'ai_consent_shown','ai_consent_granted','ai_consent_declined',
    'pilot_grant_started','pilot_grant_completed','pilot_grant_failed',
    'ai_request_started','ai_request_completed','ai_request_failed',
    'device_account_consent_shown','device_account_consent_granted','device_account_consent_declined',
    'login_started','login_completed','login_failed',
    'checkout_started','payment_returned','order_confirmed','refund_started'
  ]);
  var VALUES = Object.freeze({
    page:new Set(['home','report','account','checkout','privacy','terms','membership_rules','refund_policy','ai_disclosure','purchase_notice','opening','other']),
    section:new Set(['chart','overview','astro','energy','skeleton','relation','action','phase','context','card']),
    outcome:new Set(['shown','granted','declined','started','completed','failed','cancelled','unavailable']),
    plan:new Set(['monthly','yearly']),
    method:new Set(['native_share','download','wechat_h5','sms']),
    reason:new Set(['validation','network','timeout','storage','quota','login','membership','configuration','unknown']),
    stage:new Set(['initial','followup'])
  });
  var QUEUE_LIMIT = 40;
  var queue = [];
  var transportQueue = [];
  var flushTimer = 0;
  var flushing = false;
  var sessionId = randomId();

  function randomId(){
    try {
      var bytes = new Uint8Array(8);
      root.crypto.getRandomValues(bytes);
      return Array.from(bytes,function (n) { return n.toString(16).padStart(2,'0'); }).join('');
    } catch (_) {
      return String(Date.now()) + Math.random().toString(16).slice(2,10);
    }
  }

  function pageName(pathname){
    var path = String(pathname || '').toLowerCase();
    if (/\/(?:web\/index|app)\.html$/.test(path) || /\/$/.test(path)) return 'home';
    if (/\/report\.html$/.test(path)) return 'report';
    if (/\/account\.html$/.test(path)) return 'account';
    if (/\/checkout\.html$/.test(path)) return 'checkout';
    if (/\/privacy\.html$/.test(path)) return 'privacy';
    if (/\/terms\.html$/.test(path)) return 'terms';
    if (/\/membership-rules\.html$/.test(path)) return 'membership_rules';
    if (/\/refund-policy\.html$/.test(path)) return 'refund_policy';
    if (/\/ai-disclosure\.html$/.test(path)) return 'ai_disclosure';
    if (/\/purchase-notice\.html$/.test(path)) return 'purchase_notice';
    if (/\/opening\.html$/.test(path)) return 'opening';
    return 'other';
  }

  function viewportBucket(){
    var width = Number(root.innerWidth || 0);
    if (width <= 360) return 'xs';
    if (width <= 430) return 'sm';
    if (width <= 760) return 'md';
    return 'lg';
  }

  function referrerClass(){
    var raw = root.document && root.document.referrer;
    if (!raw) return 'direct';
    try { return new URL(raw).origin === root.location.origin ? 'same_origin' : 'external'; }
    catch (_) { return 'unknown'; }
  }

  function endpoint(){
    var config = root.ZX_PUBLIC_CONFIG;
    var raw = config && typeof config.analyticsEndpoint === 'string' ? config.analyticsEndpoint.trim() : '';
    if (!raw) return '';
    try {
      var url = new URL(raw);
      var host = url.hostname.toLowerCase().replace(/\.$/,'');
      if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) return '';
      if (host !== 'zhixng.cn' && !host.endsWith('.zhixng.cn')) return '';
      return url.href;
    } catch (_) { return ''; }
  }

  function transportAllowed(){
    var config=root.ZX_PUBLIC_CONFIG;
    return !!(config && config.analyticsEnabled === true && endpoint() &&
      root.ZxPrivacyConsent && root.ZxPrivacyConsent.has('product_analytics'));
  }

  function sanitizedDetails(details){
    var clean = {};
    if (!details || typeof details !== 'object') return clean;
    Object.keys(VALUES).forEach(function (key) {
      if (VALUES[key].has(details[key])) clean[key] = details[key];
    });
    return clean;
  }

  function track(name,details){
    if (!EVENT_NAMES.has(name) || (root.navigator && root.navigator.doNotTrack === '1')) return false;
    var event = Object.assign({
      schema_version:1,
      event:name,
      page:pageName(root.location && root.location.pathname),
      viewport:viewportBucket(),
      referrer_class:referrerClass(),
      occurred_at:new Date().toISOString(),
      session_id:sessionId
    },sanitizedDetails(details));
    queue.push(event);
    if (queue.length > QUEUE_LIMIT) queue.splice(0,queue.length - QUEUE_LIMIT);
    // 同意前的事件只留在当前页面内供本机调试，之后即使用户选择同意也不补发。
    if (transportAllowed()) {
      transportQueue.push(event);
      if (transportQueue.length > QUEUE_LIMIT) transportQueue.splice(0,transportQueue.length - QUEUE_LIMIT);
      scheduleFlush();
    }
    return true;
  }

  function scheduleFlush(){
    if (!transportAllowed() || flushTimer) return;
    flushTimer = root.setTimeout(function () { flushTimer=0; flush(); },800);
  }

  async function flush(){
    var url = endpoint();
    if (!url || !transportAllowed() || flushing || !transportQueue.length || typeof root.fetch !== 'function') return false;
    flushing = true;
    var batch = transportQueue.slice(0,20);
    try {
      var response = await root.fetch(url,{
        method:'POST',
        headers:{'content-type':'application/json'},
        body:JSON.stringify({events:batch}),
        credentials:'omit',
        referrerPolicy:'no-referrer',
        keepalive:true
      });
      if (!response.ok) return false;
      transportQueue.splice(0,batch.length);
      if (transportQueue.length) scheduleFlush();
      return true;
    } catch (_) {
      return false;
    } finally {
      flushing = false;
    }
  }

  function snapshot(){ return queue.map(function (item) { return Object.assign({},item); }); }
  function clear(){ queue.length=0; transportQueue.length=0; }

  root.ZxAnalytics = Object.freeze({track:track,flush:flush,snapshot:snapshot,clear:clear});
  track('page_view');
})(typeof window !== 'undefined' ? window : globalThis);
