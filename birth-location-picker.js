/* Shared local birthplace search. Queries stay in this browser. */
(function (global) {
  'use strict';
  const SELECTOR = 'input[data-birth-location]';
  const attached = new WeakMap();
  let serial = 0;
  const hint = '输入省、市、区县，例如贵州黔南、都匀；同名地点请补充上级地区。无需详细住址。';

  function attach(input) {
    if (attached.has(input)) return attached.get(input);
    const id = 'zx-location-' + (++serial);
    const wrapper = document.createElement('span');
    wrapper.className = 'zx-location-picker';
    input.parentNode.insertBefore(wrapper, input);
    wrapper.appendChild(input);
    const list = document.createElement('span');
    list.className = 'zx-location-options';
    list.id = id + '-list';
    list.setAttribute('role', 'listbox');
    list.setAttribute('aria-label', '出生地点建议');
    list.hidden = true;
    const status = document.createElement('small');
    status.className = 'zx-location-status';
    status.id = id + '-status';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    status.setAttribute('aria-atomic', 'true');
    wrapper.append(list, status);
    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-autocomplete', 'list');
    input.setAttribute('aria-haspopup', 'listbox');
    input.setAttribute('aria-controls', list.id);
    input.setAttribute('aria-expanded', 'false');
    input.setAttribute('autocomplete', 'off');
    input.setAttribute('spellcheck', 'false');
    input.setAttribute('aria-describedby', [input.getAttribute('aria-describedby'), status.id].filter(Boolean).join(' '));

    let results = [];
    let active = -1;
    let composing = false;
    let choosing = false;
    function close() {
      list.hidden = true;
      input.setAttribute('aria-expanded', 'false');
      input.removeAttribute('aria-activedescendant');
      active = -1;
      for (const option of list.children) option.setAttribute('aria-selected', 'false');
    }
    function describe(query) {
      const engine = global.BaziEngine;
      let hit = null;
      if (query && typeof engine?.resolveCity === 'function') {
        try { hit = engine.resolveCity(query); } catch (_) { /* Manual input remains usable. */ }
      }
      const provinceOnly = hit && (hit.src === 'prov' || hit.level === 'province');
      const matched = hit && hit.complete !== false && !provinceOnly;
      wrapper.dataset.locationState = !query ? 'empty' : provinceOnly ? 'province' : matched ? 'matched' : 'unmatched';
      if (!query) status.textContent = hint;
      else if (typeof engine?.searchLocations !== 'function') status.textContent = '地点搜索暂不可用，可手动填写完整省、市、区县；无需详细住址。';
      else if (provinceOnly) status.textContent = '目前仅匹配到' + (hit.label || hit.key || '省级地区') + '，请继续填写市、区县。';
      else if (matched) status.textContent = '已匹配：' + (hit.label || hit.key || query) + ' · 使用' + (hit.src === 'district' || hit.level === 'district' ? '区县' : '市州') + '参考坐标。';
      else status.textContent = results.length ? '请选择对应地点；同名区县请核对所属省、市。' : '暂未匹配到地点，请补充省、市、区县或核对名称。';
    }
    function refresh(open) {
      const query = input.value.trim();
      results = [];
      if (query && typeof global.BaziEngine?.searchLocations === 'function') {
        try { results = global.BaziEngine.searchLocations(query, {limit: 8}) || []; } catch (_) { /* Keep typing possible. */ }
      }
      results = Array.isArray(results) ? results.filter(item => item && typeof item.label === 'string').slice(0, 8) : [];
      list.replaceChildren();
      active = -1;
      input.removeAttribute('aria-activedescendant');
      results.forEach((place, index) => {
        const option = document.createElement('span');
        option.className = 'zx-location-option';
        option.id = id + '-option-' + index;
        option.dataset.index = String(index);
        option.setAttribute('role', 'option');
        option.setAttribute('aria-selected', 'false');
        const name = document.createElement('span');
        name.className = 'zx-location-name';
        name.textContent = place.label;
        const detail = document.createElement('span');
        detail.className = 'zx-location-level';
        detail.textContent = place.level === 'province' ? '省级 · 请继续细化' : place.level === 'district' ? '区县参考坐标' : '市州参考坐标';
        option.append(name, detail);
        list.appendChild(option);
      });
      describe(query);
      list.hidden = !(open && results.length);
      input.setAttribute('aria-expanded', String(!list.hidden));
    }
    function activate(index) {
      if (!results.length) return;
      active = (index + results.length) % results.length;
      for (let i = 0; i < list.children.length; i++) list.children[i].setAttribute('aria-selected', String(i === active));
      const option = list.children[active];
      input.setAttribute('aria-activedescendant', option.id);
      option.scrollIntoView({block: 'nearest', inline: 'nearest'});
    }
    function choose(index) {
      const place = results[index];
      if (!place) return;
      input.value = place.label;
      choosing = true;
      input.dispatchEvent(new Event('input', {bubbles: true}));
      input.dispatchEvent(new Event('change', {bubbles: true}));
      choosing = false;
      refresh(false);
      input.focus({preventScroll: true});
      close();
    }
    input.addEventListener('focus', () => refresh(true));
    input.addEventListener('input', () => { if (!composing && !choosing) refresh(document.activeElement === input); });
    input.addEventListener('change', () => { if (!choosing) refresh(false); });
    input.addEventListener('compositionstart', () => { composing = true; close(); });
    input.addEventListener('compositionend', () => { composing = false; refresh(true); });
    input.addEventListener('keydown', event => {
      if (composing || event.isComposing || event.keyCode === 229) return;
      if (event.key === 'Escape') { if (!list.hidden) { event.preventDefault(); event.stopPropagation(); } close(); return; }
      if (event.key === 'Tab') { close(); return; }
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        if (list.hidden) refresh(true);
        if (!results.length) return;
        event.preventDefault();
        activate(active < 0 ? event.key === 'ArrowDown' ? 0 : results.length - 1 : active + (event.key === 'ArrowDown' ? 1 : -1));
      } else if (event.key === 'Enter' && !list.hidden && active >= 0) {
        event.preventDefault();
        choose(active);
      }
    });
    list.addEventListener('pointerdown', event => { if (event.target.closest('[role="option"]')) event.preventDefault(); });
    list.addEventListener('click', event => {
      const option = event.target.closest('[role="option"]');
      if (option && list.contains(option)) { event.preventDefault(); choose(Number(option.dataset.index)); }
    });
    input.addEventListener('blur', close);
    const api = {refresh: () => refresh(false), close};
    attached.set(input, api);
    refresh(false);
    return api;
  }

  function attachAll(root = document) {
    if (root.matches?.(SELECTOR)) attach(root);
    root.querySelectorAll?.(SELECTOR).forEach(attach);
  }
  function boot() {
    attachAll();
    const observer = new MutationObserver(records => {
      for (const record of records) for (const node of record.addedNodes) if (node.nodeType === 1) attachAll(node);
    });
    observer.observe(document.body, {childList: true, subtree: true});
  }
  global.ZxBirthLocationPicker = {attachAll, attach};
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, {once: true});
  else boot();
})(window);
