/* Profile access follows a local chart; paid access follows server-owned reports only. */
(function (root) {
  'use strict';
  const REPORT_ID = /^[a-f0-9]{48}$/;
  const usable = (item, now = Date.now()) => !!(item && REPORT_ID.test(item.report_id || '') &&
    item.readable === true && !item.unavailable_reason && item.refund_status !== 'pending' && item.entitlement_status === 'active' && item.delivery_status === 'ready' &&
    Number.isSafeInteger(item.expires_at) && item.expires_at > now);
  function balanceValue(value) {
    if (!value || !['remaining', 'gift_remaining', 'purchased_remaining'].every(key => Number.isSafeInteger(value[key]) && value[key] >= 0)) return null;
    if (value.remaining !== value.gift_remaining + value.purchased_remaining) return null;
    return { remaining: value.remaining, gift: value.gift_remaining, purchased: value.purchased_remaining };
  }
  function validDraft(record, options) {
    const input = record && record.input;
    if (!options.consent || !record || record.version !== 1 || record.sourcePath !== options.homePath || record.targetPath !== options.reportPath ||
        !input || typeof input.d !== 'string' || !options.ageAllowed(input.d) || typeof input.t !== 'string' ||
        (input.t && !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(input.t)) || typeof input.c !== 'string' || !input.c.trim() ||
        !['', '男', '女', '其他'].includes(input.g)) return false;
    return !options.privateMode || (Number.isSafeInteger(record.createdAt) && record.createdAt > 0 &&
      record.createdAt <= options.now && options.now - record.createdAt < 86400000);
  }
  function dayMasterSeal(input, engine) {
    if (!input || !engine || typeof engine.computeChart !== 'function' || !/^\d{4}-\d{2}-\d{2}$/.test(input.d || '') ||
        !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(input.t || '') || typeof input.c !== 'string' || !input.c.trim()) return null;
    const [y,m,d]=input.d.split('-').map(Number), [hh,mm]=input.t.split(':').map(Number);
    const date=new Date(Date.UTC(y,m-1,d));
    if(date.getUTCFullYear()!==y||date.getUTCMonth()!==m-1||date.getUTCDate()!==d)return null;
    try {
      if(!engine.resolveCity?.(input.c)?.complete)return null;
      const chart=engine.computeChart({y,m,d,hh,mm,city:input.c,gender:input.g||''});
      if(chart.meta?.requiresBirthTime || chart.meta?.inputPrecision?.provisionalPillars?.includes('day'))return null;
      const master=chart.dayMaster;
      return master&&'甲乙丙丁戊己庚辛壬癸'.includes(master.stem)&&'木火土金水'.includes(master.element)&&master.stem.length===1&&master.element.length===1?
        {stem:master.stem,element:master.element,label:master.stem+master.element}:null;
    } catch(_){return null;}
  }
  const helpers = { usable, balanceValue, validDraft, dayMasterSeal };
  if (typeof module === 'object') module.exports = helpers;
  if (typeof document === 'undefined') return;

  const $ = id => document.getElementById(id);
  const txt = (id, value) => { const target=$(id); if(!target)return; target.textContent=String(value); if(id==='profile-notice')target.hidden=!value; };
  const client = () => root.zxMember, vault = () => root.ZxChartVault;
  if(root.ZxPaidReports&&root.ZxPaidReports.restoreLoginReport)root.ZxPaidReports.restoreLoginReport();
  const params = new URLSearchParams(location.search);
  const local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname) || location.protocol === 'file:';
  const source = /\/web\/profile\.html$/.test(location.pathname);
  const privateMode = root.ZX_PRIVATE_REPORT_BUILD === true || (local && params.get('private-report') === '1');
  let reports=[], currentId='', owner='', revision=0, balanceRevision=0, loading=false, reconciling=false;
  const paidSeals=new Map();
  const incomingLocal=params.getAll('chart'),incomingReport=params.getAll('report');
  const incomingLocalId=incomingLocal.length===1&&incomingReport.length===0&&/^[a-f0-9]{32}$/.test(incomingLocal[0])?incomingLocal[0]:'';
  const awaitingLinkedChart=()=>!!incomingLocalId&&!incomingApplied;
  let serviceState='closed', fallbackSelection=null, nameTarget=null, removeTarget='', libraryError='', incomingApplied=false, requestedEntryOpened=false;
  function route(page, id, hash) {
    if(page==='account')page='profile';
    const file=page==='home'?(source?'./index.html':'./app.html'):page==='report'&&source?'../v1/report.html':'./'+page+'.html';
    const target=new URL(file,location.href);
    if(id&&REPORT_ID.test(id))target.searchParams.set('report',id);
    if(local&&(privateMode||['account','checkout'].includes(page)))target.searchParams.set('private-report','1');
    if(local&&privateMode)['api','deep'].forEach(key=>{
      try { const endpoint=new URL(params.get(key));
        if(/^https?:$/.test(endpoint.protocol)&&/^(localhost|127\.0\.0\.1|\[::1\])$/.test(endpoint.hostname)&&!endpoint.username&&!endpoint.password&&!endpoint.search&&!endpoint.hash)target.searchParams.set(key,endpoint.href.replace(/\/$/,''));
      } catch(_){}
    });
    if(hash)target.hash=hash;
    return target.href;
  }
  function homeFor(targetChoice, extra) {
    const url=new URL(route('home',targetChoice&&targetChoice.kind==='report'?targetChoice.id:'','result'));
    if(targetChoice&&targetChoice.kind==='local')url.searchParams.set('chart',targetChoice.id);
    if(extra){url.searchParams.set(extra,'1');url.hash='';
      if(extra==='new-chart'){const selected=choice();url.searchParams.set('return','profile');if(selected)url.searchParams.set(selected.kind==='local'?'return-chart':'return-report',selected.id);}
    }
    return url.href;
  }
  const snapshot=()=>client()&&client().snapshot?client().snapshot():{};
  const signedIn=state=>state.authenticated===true&&state.identityKind==='wechat'&&/^[a-f0-9]{64}$/.test(state.accountRef||'');
  const hasConsent=scope=>!!(root.ZxPrivacyConsent&&root.ZxPrivacyConsent.has(scope));
  function safeVault(read,fallback){try{return read();}catch(_){libraryError='本机图谱存档暂时无法读取，原数据已保留。请先检查浏览器存储权限后刷新，当前不覆盖或新增存档。';return fallback;}}
  const entries=()=>safeVault(()=>vault()&&vault().list?vault().list():[],[]);
  const hasRoom=()=>!libraryError&&safeVault(()=>!vault()||!vault().hasRoom||vault().hasRoom(),false);
  function hasChart() {
    if(entries().length)return true;
    const options={consent:hasConsent('birth_local'),privateMode,now:Date.now(),homePath:new URL(route('home')).pathname,
      reportPath:new URL(route('report')).pathname,ageAllowed:date=>!!(root.ZxMinimumAge&&root.ZxMinimumAge.evaluateMinimumAge(date).allowed)};
    try{if(validDraft(JSON.parse(sessionStorage.getItem('zx_active_input_v1')||'null'),options))return true;}catch(_){}
    try{const input=JSON.parse(localStorage.getItem('zx_input')||'null');return validDraft({version:1,sourcePath:options.homePath,targetPath:options.reportPath,input,createdAt:input&&input.createdAt},options);}catch(_){return false;}
  }
  function choice() {
    const rows=entries();if(awaitingLinkedChart()&&!rows.some(item=>item.id===incomingLocalId))return null;
    const selected=safeVault(()=>vault()&&vault().selected?vault().selected():fallbackSelection,null);
    if(selected&&selected.kind==='local'&&rows.some(item=>item.id===selected.id))return {kind:'local',id:selected.id};
    if(selected&&selected.kind==='report'&&selected.accountRef===owner&&reports.some(item=>item.report_id===selected.id))return {kind:'report',id:selected.id,accountRef:owner};
    // Retain the user's free chart instead of silently switching to a paid report.
    if(rows.length)return {kind:'local',id:rows[0].id};
    if(reports.length&&owner){const first=reports.find(item=>usable(item))||reports[0];return {kind:'report',id:first.report_id,accountRef:owner};}
    return null;
  }
  function hasTemporaryRecord(){try{return !!(sessionStorage.getItem('zx_active_input_v1')||localStorage.getItem('zx_input'));}catch(_){return false;}}
  function selectedEntry(){const selected=choice();return selected&&selected.kind==='local'?entries().find(item=>item.id===selected.id):null;}
  function selectedReport(){const selected=choice();return selected&&selected.kind==='report'?reports.find(item=>item.report_id===selected.id):null;}
  function select(value){incomingApplied=true;if(vault()&&vault().select)vault().select(value);else fallbackSelection=value;render();refreshBalance();}
  function chartName(selected=choice()) {
    if(selected&&selected.kind==='local'){const item=entries().find(item=>item.id===selected.id);return item&&item.name||'未命名图谱';}
    if(selected&&selected.kind==='report')return safeVault(()=>{const saved=vault()&&vault().paidName?vault().paidName(selected.id,selected.accountRef):'';return saved||(reports.find(row=>row.report_id===selected.id)||{}).title||'已购图谱';},'已购图谱');
    return awaitingLinkedChart()?'':root.ZxDisplayProfile?root.ZxDisplayProfile.read():'';
  }
  function updateName() {
    const selected=choice(), name=chartName(selected);
    txt('profile-name',name||'还没有设置昵称');txt('profile-avatar',Array.from(name)[0]||'我');txt('edit-profile-name',name?'修改昵称':'设置昵称');
    txt('profile-name-note','');
  }
  function node(tag,text,cls){const item=document.createElement(tag);if(text!=null)item.textContent=String(text);if(cls)item.className=cls;return item;}
  function action(label,fn){const button=node('button',label,'text-button');button.type='button';button.addEventListener('click',fn);return button;}
  function setLink(id,label,href){txt(id,label);$(id).href=href;}
  function renderLibrary() {
    const rows=entries(), selected=choice(), list=$('chart-library-list');list.replaceChildren();
    txt('chart-capacity',`基础图谱 ${rows.length} / 2`);
    txt('chart-library-note','免费保存2张基础图谱，主动删除前一直保留。已购报告另行保存，不占名额。');
    setLink('add-chart-action','添加图谱',homeFor(null,'new-chart'));
    const room=hasRoom();
    $('add-chart-action').setAttribute('aria-disabled',String(!room));
    txt('chart-capacity-help',room?'':'基础图谱已存满。删除一张，或完成报告购买后可继续添加。');
    function row(data,kind){
      const id=kind==='local'?data.id:data.report_id, picked=!!(selected&&selected.kind===kind&&selected.id===id);
      const selection=kind==='local'?{kind,id}:{kind,id,accountRef:owner};
      const item=node('article',null,'chart-library-item'+(picked?' is-current':''));
      const content=node('div',null,'chart-library-copy');
      const title=node('strong',kind==='local'?(data.name||'未命名图谱'):chartName(selection));
      const detail=kind==='local'?[data.input.d,data.input.t||'时间待补全',data.input.c].join(' · '):data.title||'账号中的深度报告';
      const status=kind==='local'?'深度报告待解锁':usable(data)?'深度报告已解锁':data.unavailable_reason?'报告已到期':'报告待确认';
      content.append(title,node('p',detail),node('small',(picked?'当前 · ':'')+status));
      const controls=node('div',null,'chart-library-actions');
      const choose=action(picked?'当前图谱':'选择这张',()=>select(selection));choose.disabled=picked;choose.hidden=picked;choose.setAttribute('aria-pressed',String(picked));
      const home=node('a',kind==='local'||usable(data)?'进入日主页':'查看报告状态','text-button');home.href=kind==='local'||usable(data)?homeFor(selection):route('account',id,'report-purchase');
      home.addEventListener('click',()=>{if(vault()&&vault().select)vault().select(selection);else fallbackSelection=selection;});
      controls.append(choose,home);
      if(kind==='local'){const edit=node('a','修改资料','text-button');const url=new URL(homeFor(null));url.searchParams.set('edit-chart',id);url.searchParams.set('return','profile');if(selected)url.searchParams.set(selected.kind==='local'?'return-chart':'return-report',selected.id);url.hash='';edit.href=url.href;controls.append(edit);}
      if(kind==='report'&&usable(data)){const manage=node('a','报告资料管理','text-button');manage.href=route('report',id,'reportManagement');controls.append(manage);}
      if(kind==='local')controls.append(action('删除',()=>{removeTarget=id;txt('remove-chart-copy','删除“'+(data.name||'未命名图谱')+'”的本机出生资料与日主页记录。此操作不会删除账号里的已购报告、订单或问星次数。');txt('remove-chart-error','');$('remove-chart-dialog').showModal();}));

      const master=kind==='local'?dayMasterSeal(data.input,root.BaziEngine):paidSeals.get(owner+':'+id);
      const seal=node('span',null,'chart-seal'+(master?'':' is-pending'));
      seal.setAttribute('role','img');seal.setAttribute('aria-label',master?'日主 · '+master.label:'日主待确认');
      seal.setAttribute('title',master?'日主 · '+master.label:kind==='local'?'补充准确出生时间后显示日主':'报告可读取后显示日主');
      seal.append(node('strong',master?master.stem:'—'),node('span',master?master.element:'日主'));
      item.append(content,seal,controls);list.append(item);
    }
    rows.forEach(item=>row(item,'local'));reports.filter(item=>usable(item)||!rows.some(entry=>entry.accountRef===owner&&entry.reportId===item.report_id)).forEach(item=>row(item,'report'));
    const temporary=!rows.length&&(hasChart()||hasTemporaryRecord());$('save-current-chart').hidden=!temporary;
    setLink('save-current-chart','保存当前临时图谱',homeFor(null,'save-last'));
    if(!rows.length&&!reports.length)list.append(node('p',temporary?'当前日主页尚未加入图谱列表，可先保存，再添加下一张。':'还没有保存的图谱。先添加一张，之后可在这里随时切换。','chart-library-empty'));
  }
  function render() {
    const selected=choice(), entry=selectedEntry(), record=selectedReport(), item=record&&usable(record)?record:null;
    currentId=item?item.report_id:'';
    if($('report-purchase'))$('report-purchase').hidden=!(selected&&selected.kind==='report'&&selected.id===params.get('report'));
    const localChart=hasChart(), access=localChart||reports.length>0;
    $('profile-gate').hidden=access;$('profile-content').hidden=false;
    txt('profile-status',entry?'基础图谱':record?(usable(record)?'已购图谱':'待解锁图谱'):localChart?'尚未保存':'还没有图谱');
    txt('base-chart-label',entry||localChart&&!record?'基础图谱已建立':record?'账号图谱':'基础图谱待建立');
    txt('chart-summary',!entry&&!record&&localChart?'先保存当前图谱。':'');
    txt('report-state',item?'已解锁':serviceState==='error'?'待确认':'待解锁');
    $('report-state').classList.toggle('is-unlocked',!!item);$('report-state').closest('section,article').classList.toggle('is-locked',!item);
    txt('report-description',item?'已解锁完整五章':record?'查看交付与有效期':'完整五章 ¥19.90 · 交付赠1次问星');
    setLink('report-action',item?'阅读深度报告':entry?'解锁深度报告':record?'查看报告状态':localChart?'保存图谱后购买':'先添加图谱',
      item?route('report',currentId):entry?'#purchase-report':record?route('account',record.report_id,'report-purchase'):homeFor(null,localChart?'save-last':'new-chart'));
    const items=reports.filter(item=>usable(item));$('report-select').replaceChildren();
    const placeholder=node('option','选择已购图谱');placeholder.value='';$('report-select').append(placeholder);
    items.forEach(row=>{const option=node('option',chartName({kind:'report',id:row.report_id,accountRef:owner}));option.value=row.report_id;$('report-select').append(option);});
    $('report-select').value=currentId;$('report-select-field').hidden=items.length<2&&!!item||!items.length;
    const balanceUnknown=!!item||serviceState==='error'||awaitingLinkedChart()&&serviceState!=='closed'||(!entry&&serviceState==='login'&&!!params.get('report'));
    txt('ask-count',balanceUnknown?'—':'0');txt('ask-detail',item?'正在读取次数…':serviceState==='error'?'次数暂时无法读取，请刷新。':record?'当前报告暂不可用于问星。':'解锁本盘深度报告后可用。');
    setLink('ask-action',item?'去问星':record?'查看报告状态':'解锁深度报告',item?route('report',currentId,'sec-deep'):entry?'#purchase-report':record?route('account',record.report_id,'report-purchase'):homeFor(null,localChart?'save-last':'new-chart'));
    setLink('recharge-action',item?'问星充值':record?'查看订单':entry?'问星充值':'先建立图谱',item?'#ask-section':record?route('account',record.report_id,'report-purchase'):entry?'#purchase-report':homeFor(null,localChart?'save-last':'new-chart'));$('recharge-action').setAttribute('aria-describedby','ask-detail');
    txt('synastry-state',items.length>=2?'可合盘':'待解锁');$('synastry-state').classList.toggle('is-unlocked',items.length>=2);
    txt('synastry-description',items.length>=2?'':'两张深度报告备齐后，合盘免费解锁。');
    txt('invite-description','');
    txt('synastry-records','');
    txt('profile-account-label',serviceState==='ready'?'已登录':serviceState==='closed'?'暂未开放':'登录 / 恢复记录');
    document.querySelectorAll('[data-home-link]').forEach(link=>{link.href=homeFor(null);});
    renderLibrary();updateName();$('edit-profile-name').disabled=awaitingLinkedChart();
    if(awaitingLinkedChart()){
      txt('profile-name','原图谱待恢复');txt('profile-status',serviceState==='ready'?'当前账号暂未找到这张图谱':'请恢复链接指定的图谱');txt('profile-name-note','请登录购买时的账号，或选择其他图谱。');
      txt('base-chart-label','原图谱待恢复');txt('chart-summary','');
      txt('report-state','待确认');setLink('report-action','账号登录与已购恢复',route('account'));
      txt('ask-detail','先恢复链接中的图谱，或在图谱列表中选择一张，再查看问星。');
      setLink('ask-action','选择一张图谱','#chart-library-title');setLink('recharge-action','选择一张图谱','#chart-library-title');
    }
    if(libraryError){txt('profile-notice',libraryError);txt('chart-capacity','本机存档待读取');txt('chart-capacity-help','恢复读取后再添加或修改，原有存档不会被替换。');}
  }
  function clearPaid(message){++revision;++balanceRevision;reports=[];paidSeals.clear();currentId='';owner='';loading=false;serviceState='login';fallbackSelection=null;nameTarget=null;$('profile-name-dialog').close();render();txt('profile-notice',message);}
  function unchanged(epoch,account){if(revision!==epoch)return false;const state=snapshot();if(signedIn(state)&&state.accountRef===account&&hasConsent('device_account'))return true;clearPaid('账号已变化，请刷新后恢复当前账号的资料。');return false;}
  async function refreshBalance(){
    const sequence=++balanceRevision,epoch=revision,account=owner,id=currentId;
    if(!id||!unchanged(epoch,account))return;
    txt('ask-count','—');txt('ask-detail','正在读取所选报告的可用次数…');
    try{const result=await client().paidReportBalance(id);
      if(!unchanged(epoch,account)||sequence!==balanceRevision||currentId!==id)return;
      if(result.owned===false||(result.reason&&result.reason!=='ASK_CREDIT_EXHAUSTED')){txt('ask-count','—');txt('ask-detail','当前报告暂不可用于问星，请查看报告与订单状态。');return;}
      const value=balanceValue(result);if(!value)throw new Error('INVALID_BALANCE');
      txt('ask-count',value.remaining);txt('ask-detail',`赠送 ${value.gift} 次 · 已购 ${value.purchased} 次`);
    }catch(_){if(unchanged(epoch,account)&&sequence===balanceRevision&&currentId===id){txt('ask-count','—');txt('ask-detail','次数暂时无法读取，请刷新重试。');}}
  }
  async function refresh(){
    libraryError='';
    if(awaitingLinkedChart()&&entries().some(item=>item.id===incomingLocalId)){
      incomingApplied=true;reconciling=true;try{select({kind:'local',id:incomingLocalId});}finally{reconciling=false;}
    }
    const preferred=choice(), epoch=++revision;++balanceRevision;paidSeals.clear();reports=[];currentId='';owner='';loading=true;
    serviceState=client()&&client().paidReportServiceAvailable()?'login':'closed';render();
    if(serviceState==='closed'){txt('profile-notice',libraryError||'');loading=false;return;}
    if(!hasConsent('device_account')){txt('profile-notice','');loading=false;return;}
    try{
      await client().start();if(revision!==epoch)return;const state=snapshot();
      if(!signedIn(state)){txt('profile-notice','');return;}
      owner=state.accountRef;let before,next,items=[];
      do{const page=await client().paidReportList(before?{before}:undefined);if(!unchanged(epoch,owner))return;
        if(!page||!Array.isArray(page.items))throw new Error('INVALID_REPORTS');items.push(...page.items.filter(item=>item&&REPORT_ID.test(item.report_id||'')));
        next=page.next_before;if(next!=null&&next!==0&&(!Number.isSafeInteger(next)||next<1||(before&&next>=before)))throw new Error('INVALID_PAGINATION');before=next;
      }while(next);
      if(!unchanged(epoch,owner))return;
      reports=[...new Map(items.map(item=>[item.report_id,item])).values()];
      const incoming=params.getAll('report'), wanted=preferred||(incoming.length===1?{kind:'report',id:incoming[0],accountRef:owner}:null);
      if(!vault())fallbackSelection=wanted;
      if(vault()&&vault().reconcile){reconciling=true;try{await vault().reconcile(reports,owner);}catch(_){libraryError='本机图谱关联暂未完成，原数据已保留。请稍后刷新再试。';}finally{reconciling=false;}if(!unchanged(epoch,owner))return;}
      if(awaitingLinkedChart()&&vault()&&vault().resolvedPaidLink){
        const link=safeVault(()=>vault().resolvedPaidLink(incomingLocalId,owner),null);
        if(link&&link.id===incomingLocalId&&link.accountRef===owner&&REPORT_ID.test(link.reportId||'')&&reports.some(item=>item.report_id===link.reportId)){
          reconciling=true;try{select({kind:'report',id:link.reportId,accountRef:owner});}finally{reconciling=false;}
        }
      }
      if(!incomingApplied&&incomingLocal.length===0&&incoming.length===1&&reports.some(item=>item.report_id===incoming[0])){
        const selected={kind:'report',id:incoming[0],accountRef:owner};
        reconciling=true;try{if(vault()&&vault().select)safeVault(()=>vault().select(selected),null);else fallbackSelection=selected;}finally{reconciling=false;}
        incomingApplied=true;
      }
      serviceState='ready';txt('profile-notice',awaitingLinkedChart()?'当前账号未找到链接指定的图谱。请登录购买时的原账号，或从图谱列表中主动选择另一张。':'');render();refreshSeals();await refreshBalance();
    }catch(_){if(revision!==epoch)return;reports=[];currentId='';owner='';serviceState='error';render();txt('profile-notice','账号资料暂时无法读取，请稍后刷新；已购权益以账号中的实际记录为准。');}
    finally{if(revision===epoch)loading=false;}
  }
  async function refreshSeals(){
    if(!root.ZxPaidReports?.read||!owner)return;
    const epoch=revision,account=owner;
    await Promise.allSettled(reports.filter(item=>usable(item)).map(async item=>{
      const key=account+':'+item.report_id;
      if(paidSeals.has(key))return;
      const result=await root.ZxPaidReports.read(item.report_id);
      if(!unchanged(epoch,account)||!usable(item)||!usable(result)||result.report_id!==item.report_id)return;
      const master=dayMasterSeal(root.ZX_TEST_SIMULATION&&result.simulation===true?result.input:result.snapshot?.input,root.BaziEngine);
      if(master)paidSeals.set(key,master);
    }));
    if(unchanged(epoch,account))renderLibrary();
  }
  function openAccountTarget(){
    if(['#account-status','#order-center','#report-purchase','#delete-account','#member-upgrade'].includes(location.hash)){
      $('profile-account').open=true;
      if(location.hash==='#delete-account')$('delete-account').closest('details').open=true;
    }
  }
  function mountStars(){
    const canvas=$('profile-starfield'),context=canvas?.getContext?.('2d');if(!context)return;
    function draw(){
      canvas.width=root.innerWidth;canvas.height=root.innerHeight;
      context.fillStyle='#0E1220';context.fillRect(0,0,canvas.width,canvas.height);
      const gradient=context.createRadialGradient(canvas.width*.5,canvas.height*.18,0,canvas.width*.5,canvas.height*.18,canvas.height*.75);
      gradient.addColorStop(0,'rgba(38,48,76,.55)');gradient.addColorStop(1,'rgba(14,18,32,0)');
      context.fillStyle=gradient;context.fillRect(0,0,canvas.width,canvas.height);
      for(let i=0,n=Math.floor(canvas.width*canvas.height/6500);i<n;i++){
        context.fillStyle=Math.random()>.92?'rgba(201,168,92,.9)':'rgba(232,228,216,'+(Math.random()*.7+.15)+')';
        context.beginPath();context.arc(Math.random()*canvas.width,Math.random()*canvas.height,Math.random()*1.1+.2,0,7);context.fill();
      }
    }
    draw();root.addEventListener('resize',draw);
  }
  function openPurchase(entry, options={}){
    if(!entry||!root.ZxProfilePurchase)return;
    const openingState=snapshot(), account=signedIn(openingState)&&hasConsent('device_account')?openingState.accountRef:'', id=entry.id, copy={...entry,input:{...entry.input}};
    if(copy.accountRef!==account){delete copy.reportId;delete copy.accountRef;}
    return root.ZxProfilePurchase.open({entry:copy,onReturn:options.onReturn,returnLabel:options.onReturn?'返回合盘选盘':'返回我的资料',onPrepared:async reportId=>{
      if(!account||!signedIn(snapshot())||snapshot().accountRef!==account||!hasConsent('device_account'))return;
      if(vault()&&vault().bindReport)await vault().bindReport(id,reportId,account,copy.input);
      if(typeof options.onPrepared==='function')options.onPrepared(reportId);
    },onChanged:refresh});
  }
  function openManaged(){
    requestedEntryOpened=true;
    if(owner&&!unchanged(revision,owner))return;
    const namedReports=reports.map(item=>({...item,name:chartName({kind:'report',id:item.report_id,accountRef:owner})}));
    if(root.ZxManagedSynastry)return root.ZxManagedSynastry.open({reports:namedReports,entries:entries(),onChanged:refresh,onUnlock:(entry,continuation={})=>openPurchase(entry,{onReturn:openManaged,onPrepared:continuation.onPrepared})});
  }
  function openInvitations(){
    requestedEntryOpened=true;
    if(root.ZxProfileSocial)return root.ZxProfileSocial.open({kind:'invitations',reportId:currentId,reports});
  }
  function openRequestedEntry(){
    if(requestedEntryOpened)return;
    const values=params.getAll('open');
    if(values.length!==1||!['managed','invitations'].includes(values[0]))return;
    if(values[0]==='managed')return openManaged();
    return openInvitations();
  }
  function mount(){
    if(!$('profile-content'))return;mountStars();openAccountTarget();root.addEventListener('hashchange',openAccountTarget);
    if(root.ZxPaidReports&&root.ZxPaidReports.mountAccount)root.ZxPaidReports.mountAccount().then(()=>{
      const selected=choice();if($('report-purchase'))$('report-purchase').hidden=!(selected&&selected.kind==='report'&&selected.id===params.get('report'));
      openAccountTarget();const section=$((location.hash||'').slice(1));if(section&&!section.hidden&&['#account-status','#order-center','#report-purchase'].includes(location.hash)&&section.scrollIntoView)section.scrollIntoView({block:'start'});
    });
    if(params.getAll('return').length===1&&params.get('return')==='synastry'&&root.ZxPaidReports&&root.ZxPaidReports.synastryUrl){
      $('profile-account').open=true;$('return-synastry').hidden=false;$('return-synastry').href=root.ZxPaidReports.synastryUrl();
    }
    $('social-close').addEventListener('click',()=>$('social-detail').close());
    $('edit-profile-name').addEventListener('click',()=>{nameTarget=choice();$('profile-name-input').value=chartName(nameTarget);txt('profile-name-error','');$('profile-name-dialog').showModal();$('profile-name-input').focus();});
    $('profile-name-cancel').addEventListener('click',()=>$('profile-name-dialog').close());
    $('profile-name-form').addEventListener('submit',async event=>{
      event.preventDefault();const target=nameTarget, epoch=revision;
      try{
        if(target&&target.kind==='local'&&vault())await vault().rename(target.id,$('profile-name-input').value);
        else if(target&&target.kind==='report'&&vault()){
          if(!unchanged(epoch,target.accountRef))return;await vault().renamePaid(target.id,target.accountRef,$('profile-name-input').value);if(!unchanged(epoch,target.accountRef))return;
        }else if(root.ZxDisplayProfile)root.ZxDisplayProfile.write($('profile-name-input').value);
        render();refreshBalance();$('profile-name-dialog').close();
      }catch(error){txt('profile-name-error',error.message||'昵称暂未保存，请重试。');}
    });
    $('remove-chart-cancel').addEventListener('click',()=>$('remove-chart-dialog').close());
    $('remove-chart-confirm').addEventListener('click',async()=>{
      const id=removeTarget;if(!id||!vault())return;const button=$('remove-chart-confirm');button.disabled=true;
      try{await vault().remove(id);removeTarget='';$('remove-chart-dialog').close();render();refreshBalance();}
      catch(error){txt('remove-chart-error',error.message||'删除暂未完成，请重试。');}finally{button.disabled=false;}
    });
    $('add-chart-action').addEventListener('click',event=>{if(!hasRoom()){event.preventDefault();txt('profile-notice',libraryError||'本机已保存2张基础图谱。请先删除一张，或完成其中一张报告的购买交付，再添加。');}});
    $('report-action').addEventListener('click',event=>{const entry=selectedEntry();if(entry){event.preventDefault();openPurchase(entry);}});
    $('ask-action').addEventListener('click',event=>{const entry=selectedEntry();if(entry){event.preventDefault();openPurchase(entry);}});
    $('report-select').addEventListener('change',()=>{const id=$('report-select').value;if(reports.some(item=>item.report_id===id&&usable(item)))select({kind:'report',id,accountRef:owner});});
    $('recharge-action').addEventListener('click',event=>{const entry=selectedEntry();if(entry){event.preventDefault();openPurchase(entry);return;}if(!currentId)return;event.preventDefault();if(root.ZxProfileRecharge)root.ZxProfileRecharge.open({reportId:currentId,onChanged:refresh});});
    $('managed-synastry-action').addEventListener('click',openManaged);
    $('synastry-action').addEventListener('click',()=>root.ZxProfileSocial&&root.ZxProfileSocial.open({kind:'records',reportId:currentId,reports}));
    $('invite-action').addEventListener('click',openInvitations);
    $('refresh-profile').addEventListener('click',()=>{if(!loading){refresh();if(root.ZxPaidReports)root.ZxPaidReports.mountAccount();}});
    root.addEventListener('zx-display-profile-changed',updateName);
    root.addEventListener('zx-private-session-cleared',()=>clearPaid('账号会话已清除，请重新登录后恢复资料。'));
    const libraryChanged=()=>{if(reconciling)return;render();refreshBalance();};
    if(vault()&&vault().subscribe)vault().subscribe(libraryChanged);else root.addEventListener('zx-chart-library-changed',libraryChanged);
    const onReturn=()=>{updateName();if(owner&&(!signedIn(snapshot())||snapshot().accountRef!==owner||!hasConsent('device_account')))refresh();
      else if(currentId&&!reports.some(item=>item.report_id===currentId&&usable(item)))refresh();else{render();refreshBalance();}};
    root.addEventListener('focus',onReturn);document.addEventListener('visibilitychange',()=>{if(!document.hidden)onReturn();});
    root.addEventListener('pageshow',event=>{if(event.persisted)refresh();});const initialRefresh=refresh();
    const invite=new URLSearchParams(location.hash.slice(1)).get('invite');
    if(/^[a-f0-9]{64}$/.test(invite||'')&&root.ZxProfileSocial){requestedEntryOpened=true;root.ZxProfileSocial.open({kind:'invitations',token:invite});}
    else initialRefresh.then(openRequestedEntry);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount);else mount();
})(typeof window==='object'?window:globalThis);
