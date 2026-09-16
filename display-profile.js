/* Display names belong to the selected local chart; report aliases never change paid-report identity. */
(function(root){
  'use strict';
  const KEY='zx_display_profile_v1';
  const clean=value=>String(value??'').normalize('NFC').trim();
  const count=value=>typeof Intl.Segmenter==='function'?[...new Intl.Segmenter('zh',{granularity:'grapheme'}).segment(value)].length:Array.from(value).length;
  const validate=value=>{const name=clean(value);return /[<>\{\}\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u.test(name)?'称呼不能包含控制符或尖括号。':count(name)>20?'称呼最多 20 个字。':'';};
  const read=()=>{try{const name=clean(JSON.parse(sessionStorage.getItem(KEY)||'{}').name);return validate(name)?'':name;}catch{return '';}};
  const write=value=>{const name=clean(value),error=validate(name);if(error)throw new Error(error);sessionStorage.setItem(KEY,JSON.stringify({name}));if(typeof root.dispatchEvent==='function')root.dispatchEvent(new CustomEvent('zx-display-profile-changed'));return name;};
  const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const api={KEY,clean,validate,read,write,escape};root.ZxDisplayProfile=api;
  if(typeof module==='object')module.exports=api;
  if(typeof document==='undefined')return;
  function mount(){
    const card=document.getElementById('formCard'), result=document.getElementById('result');if(!card||!result)return;
    const style=document.createElement('style');style.textContent='.zx-name-field{display:block;margin:20px 0}.zx-name-field[hidden]{display:none}.zx-name-field input{display:block;width:100%;height:50px;margin-top:8px;padding:10px 14px;background:#131c2c;color:#e8e4d8;border:1px solid #716345;border-radius:8px;font:inherit;box-sizing:border-box}.zx-name-help{font:12px/1.7 sans-serif;color:#aeb4c0}.zx-name-bar{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:16px 0;margin-bottom:24px;border-bottom:1px solid #665534}.zx-name-bar strong{font-size:18px;overflow-wrap:anywhere}.zx-name-actions{display:flex;align-items:center;gap:8px;flex-shrink:0;flex-wrap:wrap}.zx-name-bar a{text-decoration:none;display:inline-flex;align-items:center;justify-content:center}.zx-name-bar>div:first-child{min-width:0}@media(max-width:480px){.zx-name-bar{gap:8px}.zx-name-bar a,.zx-name-bar button{padding:8px 10px}}.zx-name-bar [hidden]{display:none!important}.zx-name-bar a,.zx-name-bar button{min-height:44px;color:#dfc185;background:#192233;border:1px solid #716345;border-radius:8px;padding:8px 14px;cursor:pointer}.zx-name-error{color:#f0b6a2;font-size:13px}';document.head.appendChild(style);
    const label=document.createElement('label');label.className='zx-name-field';label.htmlFor='bDisplayName';label.innerHTML='显示称呼 <small>（选填）</small><input id="bDisplayName" autocomplete="nickname" placeholder="怎么称呼你" maxlength="80" aria-describedby="display-name-help display-name-error"><span id="display-name-help" class="zx-name-help">用于这张图谱的日主页，可随时在“我的资料”修改。</span><span id="display-name-error" class="zx-name-error" role="alert"></span>';
    card.querySelector('.field')?.before(label);if(!label.isConnected)card.querySelector('#goBtn').before(label);
    const field=label.querySelector('input');field.value=read();
    const bar=document.createElement('div');bar.className='zx-name-bar';bar.innerHTML='<div><small class="zx-name-help">我的日主页</small><br><strong id="day-display-name"></strong></div><div class="zx-name-actions"><button type="button" id="day-chart-switch" hidden>切换图谱</button><a id="day-profile-link" href="./profile.html">我的资料 ›</a></div>';result.prepend(bar);
    const profileURL=new URL(root.ZxPaidReports?.profileUrl?root.ZxPaidReports.profileUrl():'./profile.html',location.href);if(new URLSearchParams(location.search).get('private-report')==='1')profileURL.searchParams.set('private-report','1');document.getElementById('day-profile-link').href=profileURL.href;if(document.getElementById('resumeProfileLink'))document.getElementById('resumeProfileLink').href=profileURL.href;
    const selectedName=()=>{try{const selected=root.ZxChartVault?.selected();if(selected?.kind==='local')return root.ZxChartVault.get(selected.id)?.name||'';if(selected?.kind==='report'){const state=root.zxMember?.snapshot();if(state?.authenticated&&state.accountRef===selected.accountRef)return root.ZxChartVault.paidName(selected.id,selected.accountRef)||'';return '';}}catch(_){}return read();};
    const editingName=()=>{const id=root.ZxHomeCharts?.editingId?.();if(!id)return null;try{return root.ZxChartVault?.get(id)?.name||'';}catch(_){return '';}};
    const update=()=>{
      const name=selectedName(),existingName=editingName();
      document.getElementById('day-display-name').textContent=name||'欢迎，先认识自己';
      label.hidden=existingName!==null;field.readOnly=label.hidden;
      if(existingName!==null)field.value=existingName;
      else if(document.body.dataset.viewState!=='new')field.value=name;
    };
    field.value=selectedName();update();
    ['pageshow','zx-display-profile-changed','zx-chart-library-changed','zx-chart-form-changed'].forEach(type=>window.addEventListener(type,update));
    window.addEventListener('zx-new-chart',()=>{field.value='';update();});
    ['zx-birth-local-cleared','zx-local-data-cleared','zx-private-session-cleared'].forEach(type=>window.addEventListener(type,()=>{field.value='';update();}));
    document.getElementById('goBtn').addEventListener('click',e=>{
      const existingName=editingName();if(existingName!==null)field.value=existingName;
      const error=validate(field.value);document.getElementById('display-name-error').textContent=error;
      if(error){e.stopImmediatePropagation();field.focus();return;}
      try{write(field.value);update();}catch{document.getElementById('display-name-error').textContent='浏览器未允许暂存称呼，请检查隐私设置。';}
    },true);
    document.getElementById('day-chart-switch').onclick=()=>root.ZxHomeCharts?.choose();
    root.ZxHomeCharts?.render();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount);else mount();
})(typeof window==='object'?window:globalThis);
