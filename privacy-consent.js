/* privacy-consent.js — 知星前端隐私选择与本机资料控制
 * 只记录用户在当前浏览器中的选择；不把同意本身上传到服务端。
 */
(function () {
  'use strict';

  var NOTICE_VERSION = 'privacy-2026.09.09-report-v1';
  // The device chart library has its own notice. Updating local retention does
  // not revoke the separate account/AI choices or revise existing purchase terms.
  var BIRTH_LOCAL_NOTICE_VERSION = 'birth-local-2026.09.11-library-v1';
  var CHOICES_KEY = 'zx_privacy_choices_v1';
  var SUPPORT_EMAIL = 'wyh767745207@qq.com';
  var DOCK_SUPPRESSED = false;
  var EXPORT_KEYS = [
    'zx_input',
    'zx_saved_reports_v1',
    'zx_profile_name_v1',
    'zx_chart_library_v1',
    CHOICES_KEY
  ];
  var BIRTH_DATA_KEYS = ['zx_chart_library_v1', 'zx_chart_selection_v1', 'zx_input',
    'zx_active_input_v1', 'zx_report_handoff_v1', 'zx_display_profile_v1',
    'zx_saved_reports_v1', 'zx_profile_name_v1'];
  var SCOPES = ['birth_local', 'device_account', 'ai_processing', 'product_analytics'];

  function readJson(key) {
    try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch (_) { return null; }
  }

  function writeChoices(value) {
    try {
      localStorage.setItem(CHOICES_KEY, JSON.stringify(value));
      return true;
    } catch (_) {
      return false;
    }
  }

  function readChoices() {
    var saved = readJson(CHOICES_KEY);
    if (!saved || saved.version !== NOTICE_VERSION || !saved.scopes) {
      return { version: NOTICE_VERSION, updatedAt: null, scopes: {} };
    }
    return saved;
  }

  function has(scope) {
    if (SCOPES.indexOf(scope) < 0) return false;
    var choice = readChoices().scopes[scope];
    return !!choice && (scope !== 'birth_local' || choice.noticeVersion === BIRTH_LOCAL_NOTICE_VERSION);
  }

  function grant(scopes) {
    var list = Array.isArray(scopes) ? scopes : [scopes];
    var saved = readChoices();
    var now = new Date().toISOString();
    list.forEach(function (scope) {
      if (SCOPES.indexOf(scope) >= 0) {
        saved.scopes[scope] = { grantedAt: now };
        if (scope === 'birth_local') saved.scopes[scope].noticeVersion = BIRTH_LOCAL_NOTICE_VERSION;
      }
    });
    saved.updatedAt = now;
    if (!writeChoices(saved)) throw new Error('privacy choice unavailable');
    return saved;
  }

  function revoke(scope) {
    var saved = readChoices();
    if (scope) delete saved.scopes[scope];
    else saved.scopes = {};
    saved.updatedAt = new Date().toISOString();
    if (!writeChoices(saved)) throw new Error('privacy choice unavailable');
    if (!scope || scope === 'birth_local') {
      try { clearBirthLocalData(); } finally { notify('zx-birth-local-cleared'); }
    }
    if (!scope || scope === 'device_account') notify('zx-account-consent-revoked');
    return saved;
  }

  function notify(type) {
    try { window.dispatchEvent(new CustomEvent(type)); } catch (_) {}
  }

  function clearBirthLocalData() {
    [localStorage, typeof sessionStorage !== 'undefined' ? sessionStorage : null].forEach(function (storage) {
      if (!storage) return;
      BIRTH_DATA_KEYS.forEach(function (key) {
        storage.removeItem(key);
        if (storage.getItem(key) !== null) throw new Error('local data clear incomplete');
      });
    });
  }

  // A different tab cannot remove this tab's sessionStorage. Propagate a
  // withdrawal so that its temporary birth handoffs and visible chart are cleared.
  if (typeof window.addEventListener === 'function') window.addEventListener('storage', function (event) {
    if (event.key !== CHOICES_KEY && event.key !== null) return;
    var previous;
    try { previous = JSON.parse(event.oldValue || 'null'); } catch (_) {}
    var cleared = event.key === null || event.newValue === null;
    var current = readChoices();
    if (!has('birth_local') && (cleared || previous && previous.scopes && previous.scopes.birth_local &&
        (!current.scopes.birth_local || previous.scopes.birth_local.noticeVersion === BIRTH_LOCAL_NOTICE_VERSION))) {
      try { clearBirthLocalData(); } finally { notify('zx-birth-local-cleared'); }
    }
    if (!has('device_account') && (cleared || previous && previous.scopes && previous.scopes.device_account)) notify('zx-account-consent-revoked');
  });

  function exportLocalData() {
    var data = {
      product: '知星',
      exportedAt: new Date().toISOString(),
      noticeVersion: NOTICE_VERSION,
      birthLocalNoticeVersion: BIRTH_LOCAL_NOTICE_VERSION,
      data: {}
    };
    EXPORT_KEYS.forEach(function (key) {
      var value = null;
      try { value = localStorage.getItem(key); } catch (_) {}
      if (value === null) return;
      try { data.data[key] = JSON.parse(value); } catch (_) { data.data[key] = value; }
    });
    return data;
  }

  function clearZxStorage(storage) {
    var keys = [];
    if (!storage) return keys;
    for (var i = 0; i < storage.length; i += 1) {
      var key = storage.key(i);
      if (key && key.indexOf('zx_') === 0) keys.push(key);
    }
    keys.forEach(function (key) {
      storage.removeItem(key);
      if (storage.getItem(key) !== null) throw new Error('local data clear incomplete');
    });
    return keys;
  }

  function clearAllLocalData() {
    var cleared = clearZxStorage(localStorage);
    if (typeof sessionStorage !== 'undefined') cleared = cleared.concat(clearZxStorage(sessionStorage));
    notify('zx-local-data-cleared');
    return cleared;
  }

  function privacyPageHref() {
    var path = String(window.location && window.location.pathname || '');
    if (/\/v1\/report\.html$/.test(path)) return '../web/privacy.html';
    if (/\/web\//.test(path)) return './privacy.html';
    return './privacy.html';
  }

  function currentChoiceText(scope) {
    return has(scope) ? '已同意' : '未同意或已撤回';
  }

  function setDockSuppressed(suppressed) {
    DOCK_SUPPRESSED = !!suppressed;
    if (typeof document === 'undefined') return;
    var dock = document.getElementById('zxPrivacyDock');
    var center = document.getElementById('zxPrivacyCenter');
    if (dock) dock.hidden = DOCK_SUPPRESSED || !!(center && !center.hidden);
  }

  function mountPrivacyDock() {
    if (typeof document === 'undefined' || !document.body || document.getElementById('zxPrivacyDock')) return;

    var style = document.createElement('style');
    style.id = 'zx-privacy-center-style';
    style.textContent = [
      '#zxPrivacyDock{position:relative;display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:center;box-sizing:border-box;width:min(calc(100% - 32px),820px);margin:24px auto 0;padding:12px 0 max(20px,env(safe-area-inset-bottom));border-top:1px solid rgba(201,168,92,.22);font:12px/1.2 -apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif}',
      '#zxPrivacyDock[hidden],#zxPrivacyCenter[hidden]{display:none!important}',
      '#zxPrivacyDock a,#zxPrivacyDock button{min-height:44px;padding:0 12px;border:0;border-radius:999px;background:transparent;color:#e8e4d8;font:inherit;cursor:pointer;text-decoration:none;display:inline-flex;align-items:center;justify-content:center}',
      '#zxPrivacyDock a{color:#c9a85c}',
      '#zxPrivacyDock a:focus-visible,#zxPrivacyDock button:focus-visible,#zxPrivacyCenter a:focus-visible,#zxPrivacyCenter button:focus-visible{outline:2px solid #f0d695;outline-offset:2px}',
      '#zxPrivacyCenter{position:fixed;inset:0;z-index:140;display:grid;place-items:center;box-sizing:border-box;width:100%;height:100%;height:100dvh;max-width:none;max-height:none;margin:0;border:0;border-radius:0;padding:20px;background:rgba(8,11,20,.9);font:14px/1.75 -apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif}',
      '#zxPrivacyCenter::backdrop{background:transparent}',
      '#zxPrivacyCenterPanel{box-sizing:border-box;width:min(100%,480px);max-height:calc(100vh - 40px);max-height:calc(100dvh - 40px);overflow:auto;overscroll-behavior:contain;padding:24px 20px;border:1px solid rgba(201,168,92,.34);border-radius:12px;background:#1a2233;color:#e8e4d8;box-shadow:0 18px 55px rgba(0,0,0,.52)}',
      '#zxPrivacyCenterPanel .zx-privacy-heading{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:10px}',
      '#zxPrivacyCenterPanel .zx-privacy-heading button{flex:none;min-width:60px;padding:8px 12px}',
      '#zxPrivacyCenterPanel h2{margin:0 0 10px;color:#c9a85c;font:700 20px/1.5 "Songti SC","STSong",serif}',
      '#zxPrivacyCenterPanel p{margin:0 0 12px;color:#bcc4d0}',
      '#zxPrivacyCenterPanel .zx-privacy-state{padding:11px 13px;border-left:2px solid #c9a85c;background:rgba(201,168,92,.07)}',
      '#zxPrivacyCenterPanel .zx-privacy-actions{display:grid;gap:10px;margin:16px 0}',
      '#zxPrivacyCenterPanel button,#zxPrivacyCenterPanel .zx-privacy-link{min-height:44px;padding:10px 14px;border:1px solid rgba(201,168,92,.45);border-radius:999px;background:transparent;color:#e8e4d8;font:inherit;cursor:pointer;text-decoration:none;text-align:center}',
      '#zxPrivacyCenterPanel .zx-privacy-primary{background:#c9a85c;color:#241c0c;font-weight:700}',
      '#zxPrivacyCenterPanel .zx-privacy-danger{border-color:rgba(213,105,92,.65);color:#f0b5ad}',
      '#zxPrivacyCenterStatus{min-height:24px;color:#f0d695}',
      '@media(max-width:480px){#zxPrivacyDock{gap:2px}#zxPrivacyDock a,#zxPrivacyDock button{padding:0 10px}#zxPrivacyCenter{padding:14px}#zxPrivacyCenterPanel{max-height:calc(100vh - 28px);max-height:calc(100dvh - 28px);padding:21px 17px}}'
    ].join('');

    var complaintHref = 'mailto:' + SUPPORT_EMAIL + '?subject=' + encodeURIComponent('知星投诉或举报');
    var dock = document.createElement('nav');
    dock.id = 'zxPrivacyDock';
    dock.setAttribute('aria-label', '隐私与投诉快捷入口');
    dock.innerHTML = '<button id="zxPrivacyOpen" type="button" aria-haspopup="dialog" aria-controls="zxPrivacyCenter">隐私选择</button><a href="' + complaintHref + '">反馈 / 投诉举报</a>';

    var center = document.createElement('dialog');
    center.id = 'zxPrivacyCenter';
    center.setAttribute('aria-labelledby', 'zxPrivacyCenterTitle');
    center.hidden = true;
    center.innerHTML = '<section id="zxPrivacyCenterPanel" tabindex="-1">' +
      '<div class="zx-privacy-heading"><h2 id="zxPrivacyCenterTitle">隐私选择与本机资料</h2><button id="zxPrivacyClose" type="button">关闭</button></div>' +
      '<p class="zx-privacy-state" id="zxPrivacyChoiceState"></p>' +
      '<p>本期不收集产品使用统计。启用账号功能需要你确认；把盘面摘要、问题和必要的近期对话发送给 DeepSeek 前，也会单独征求同意。</p>' +
      '<p>基础图谱最多在本机保存 2 张，保留到你主动删除。可在“我的资料”逐张删除，或在这里撤回本机处理同意并清除全部本机图谱。已购报告按账号单独保存，不占这 2 个名额；清理本机不会删除服务端已购报告。</p>' +
      '<div class="zx-privacy-actions">' +
        '<button class="zx-privacy-danger" id="zxPrivacyRevokeBirth" type="button">撤回本机处理同意并删除图谱</button>' +
        '<button class="zx-privacy-primary" id="zxPrivacyRevoke" type="button">撤回问星处理与统计同意</button>' +
        '<button class="zx-privacy-danger" id="zxPrivacyClear" type="button">清除本机知星资料</button>' +
        '<a class="zx-privacy-link" href="' + complaintHref + '">提交投诉或举报</a>' +
        '<a class="zx-privacy-link" id="zxPrivacyPolicy" href="' + privacyPageHref() + '">查看隐私政策</a>' +
      '</div>' +
      '<p>投诉或举报按“受理 → 核验 → 处理 → 反馈”办理；该通道由人工值守，我们会在 15 个工作日内或法律规定期限内反馈。涉及微信账号服务、微信支付或 DeepSeek 的个人信息请求，我们会按需协调服务提供方处理。</p>' +
      '<p id="zxPrivacyCenterStatus" role="status" aria-live="polite"></p>' +
    '</section>';

    document.head.appendChild(style);
    document.body.appendChild(dock);
    document.body.appendChild(center);
    dock.hidden = DOCK_SUPPRESSED;

    var openButton = document.getElementById('zxPrivacyOpen');
    var closeButton = document.getElementById('zxPrivacyClose');
    var panel = document.getElementById('zxPrivacyCenterPanel');
    var choiceState = document.getElementById('zxPrivacyChoiceState');
    var status = document.getElementById('zxPrivacyCenterStatus');
    var returnFocus = null;
    var previousOverflow = '';

    function renderChoices() {
      choiceState.textContent = '本机图谱：' + currentChoiceText('birth_local') + '；问星处理（微信账号服务 + DeepSeek）：' + currentChoiceText('ai_processing') + '；产品统计：' + currentChoiceText('product_analytics') + '。';
    }

    function openCenter() {
      returnFocus = document.activeElement;
      previousOverflow = document.documentElement.style.overflow;
      status.textContent = '';
      renderChoices();
      dock.hidden = true;
      center.hidden = false;
      center.showModal();
      document.documentElement.style.overflow = 'hidden';
      panel.focus();
    }

    function closeCenter() {
      center.close();
      center.hidden = true;
      dock.hidden = DOCK_SUPPRESSED;
      document.documentElement.style.overflow = previousOverflow;
      if (returnFocus && typeof returnFocus.focus === 'function') returnFocus.focus();
    }

    openButton.addEventListener('click', openCenter);
    closeButton.addEventListener('click', closeCenter);
    center.addEventListener('cancel', function (event) {
      event.preventDefault();
      closeCenter();
    });
    center.addEventListener('click', function (event) {
      if (event.target === center) closeCenter();
    });
    center.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeCenter();
        return;
      }
      if (event.key !== 'Tab') return;
      var items = Array.prototype.slice.call(panel.querySelectorAll('a[href],button:not([disabled]),[tabindex]:not([tabindex="-1"])'));
      if (!items.length) return;
      var first = items[0];
      var last = items[items.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === panel)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    });

    document.getElementById('zxPrivacyRevokeBirth').addEventListener('click', function () {
      if (!window.confirm('撤回后将删除当前浏览器保存的基础图谱、称呼和临时出生资料，无法恢复。已购报告仍按账号保存，不会因此删除。是否继续？')) return;
      try {
        revoke('birth_local');
        renderChoices();
        status.textContent = '已撤回本机处理同意并删除本机图谱，页面即将刷新。已购报告仍可登录原账号查看。';
        window.setTimeout(function () { window.location.reload(); }, 900);
      } catch (_) {
        renderChoices();
        status.textContent = '本机资料未能完整清除，请检查浏览器站点存储设置后重试。';
      }
    });

    document.getElementById('zxPrivacyRevoke').addEventListener('click', function () {
      try {
        revoke('ai_processing');
        revoke('product_analytics');
        if (window.ZxAnalytics && typeof window.ZxAnalytics.clear === 'function') window.ZxAnalytics.clear();
        renderChoices();
        status.textContent = '已撤回问星处理与产品统计同意；后续不会继续按原选择向 DeepSeek 发送问星资料，重新使用前会再次确认。微信账号与退出登录由“我的”页单独管理。';
      } catch (_) {
        status.textContent = '当前浏览器未能保存撤回选择，请检查站点存储设置后重试。';
      }
    });

    document.getElementById('zxPrivacyClear').addEventListener('click', function () {
      if (!window.confirm('将清除当前浏览器中知星保存的出生资料、报告阅读位置和隐私选择。云端账号、订单、问星次数、答案及受保护的登录信息不会自动删除。此操作无法恢复，是否继续？')) return;
      try {
        clearAllLocalData();
        if (window.ZxAnalytics && typeof window.ZxAnalytics.clear === 'function') window.ZxAnalytics.clear();
        renderChoices();
        status.textContent = '已清除本机知星资料，页面即将刷新。云端记录和受保护的登录信息不会自动删除；如需处理，可通过反馈 / 投诉举报入口联系我们。';
        window.setTimeout(function () { window.location.reload(); }, 900);
      } catch (_) {
        renderChoices();
        status.textContent = '本机资料未能完整清除，请检查浏览器站点存储设置后重试。页面不会把本次操作显示为清除成功。';
      }
    });
  }

  window.ZxPrivacyConsent = {
    noticeVersion: NOTICE_VERSION,
    birthLocalNoticeVersion: BIRTH_LOCAL_NOTICE_VERSION,
    choicesKey: CHOICES_KEY,
    has: has,
    grant: grant,
    revoke: revoke,
    snapshot: readChoices,
    exportLocalData: exportLocalData,
    clearAllLocalData: clearAllLocalData,
    mountPrivacyDock: mountPrivacyDock,
    setDockSuppressed: setDockSuppressed
  };

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountPrivacyDock, { once:true });
    else mountPrivacyDock();
  }
})();
