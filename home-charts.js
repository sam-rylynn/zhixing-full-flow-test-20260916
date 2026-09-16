/* Device chart selection and server-owned daily-home restoration. No local entitlement fallback. */
(function(root){
  'use strict';
  const LOCAL=/^[a-f0-9]{32}$/, REPORT=/^[a-f0-9]{48}$/, OWNER=/^[a-f0-9]{64}$/;
  const signedIn=state=>!!(state&&state.authenticated===true&&state.identityKind==='wechat'&&OWNER.test(state.accountRef||''));
  const readable=(item,now=Date.now())=>!!(item&&REPORT.test(item.report_id||'')&&item.readable===true&&
    item.entitlement_status==='active'&&item.delivery_status==='ready'&&!item.unavailable_reason&&item.refund_status!=='pending'&&
    Number.isSafeInteger(item.expires_at)&&item.expires_at>now);
  function safeInput(value,ageAllowed){
    if(!value||typeof value.d!=='string'||!ageAllowed(value.d)||typeof value.c!=='string'||!value.c.trim()||value.c.length>160||
      /[<>\u0000-\u001f]/.test(value.c)||!['','男','女','其他',null].includes(value.g)||
      (value.t!==null&&typeof value.t!=='string')||(value.t&&!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value.t)))return null;
    return {d:value.d,t:value.t||'',c:value.c,g:value.g||''};
  }
  function reportInput(result,id,ageAllowed,now=Date.now()){
    if(!REPORT.test(id)||!readable(result,now)||result.report_id!==id||!result.snapshot)return null;
    return safeInput(root.ZX_TEST_SIMULATION&&result.simulation===true?result.input:result.snapshot.input,ageAllowed);
  }
  function legacyInput(record,{privateMode=false,now=Date.now(),ageAllowed,homePath,reportPath}){
    if(!record)return null;
    if(record.input&&(record.version!==1||record.sourcePath!==homePath||record.targetPath!==reportPath))return null;
    if((privateMode||record.createdAt!==undefined)&&(!Number.isSafeInteger(record.createdAt)||record.createdAt<=0||record.createdAt>now||now-record.createdAt>=86400000))return null;
    return safeInput(record.input||record,ageAllowed);
  }
  const helpers={signedIn,readable,safeInput,reportInput,legacyInput};
  if(typeof module==='object')module.exports=helpers;
  if(typeof document==='undefined')return;
  const $=id=>document.getElementById(id),vault=()=>root.ZxChartVault,bridge=root.ZxHomeChartBridge;
  if(!bridge||!vault())return;
  let revision=0,syncRevision=0,reports=[],owner='',reportsMessage='',loading=false,booted=false,editingId='',returnSelection=null;
  let returnToProfile=false,profileReturn={};
  const source=/\/web\/index\.html$/.test(location.pathname),params=new URLSearchParams(location.search);
  const snapshot=()=>root.zxMember?.snapshot?.()||{};
  const ageAllowed=date=>!!root.ZxMinimumAge?.evaluateMinimumAge(date).allowed;
  function route(page,query={}){
    const path=page==='home'?(source?'./index.html':'./app.html'):page==='report'&&source?'../v1/report.html':'./'+page+'.html';
    const url=new URL(path,location.href);
    if(params.get('private-report')==='1')url.searchParams.set('private-report','1');
    if(/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname))for(const key of ['api','deep']){
      try{const endpoint=new URL(params.get(key));if(/^https?:$/.test(endpoint.protocol)&&/^(localhost|127\.0\.0\.1|\[::1\])$/.test(endpoint.hostname)&&!endpoint.username&&!endpoint.password&&!endpoint.search&&!endpoint.hash)url.searchParams.set(key,endpoint.href.replace(/\/$/,''));}catch(_){}
    }
    for(const [key,value] of Object.entries(query))if(value)url.searchParams.set(key,value);
    return url.href;
  }
  function setUrl(query,{replace=false}={}){const url=route('home',query);if(url!==location.href)history[replace?'replaceState':'pushState'](null,'',url);}
  const sameInput=(first,second)=>!!(first&&second&&['d','t','c','g'].every(key=>(first[key]||'')===(second[key]||'')));
  function cancelButton(show){if($('cancelChartForm'))$('cancelChartForm').hidden=!show;}
  function formReturnQuery(){
    if(!returnToProfile)return {};
    const previous=returnSelection;
    if(previous?.kind==='local'&&LOCAL.test(previous.id||''))profileReturn={chart:previous.id};
    else if(previous?.kind==='report'&&REPORT.test(previous.id||''))profileReturn={report:previous.id};
    return {return:'profile',...(profileReturn.chart?{'return-chart':profileReturn.chart}:profileReturn.report?{'return-report':profileReturn.report}:{})};
  }
  function locals(){try{return vault().list();}catch(error){reportsMessage=error.message;return [];}}
  function status(message){$('homeChartStatus').textContent=message||'';}
  function button(title,detail,action){
    const element=document.createElement('button');element.className='home-chart-entry';element.type='button';
    const text=document.createElement('span'),strong=document.createElement('strong'),small=document.createElement('small'),arrow=document.createElement('span');
    strong.textContent=title;small.textContent=detail;arrow.textContent='进入日主页 ›';text.append(strong,small);element.append(text,arrow);element.onclick=action;return element;
  }
  function render(){
    const entries=locals(),activeReports=reports.filter(item=>readable(item));
    $('homeChartList').replaceChildren(...entries.map(entry=>button(entry.name||'未设置称呼',
      [entry.input.d,entry.input.c,'基础图谱 · 本机保存'].join(' · '),()=>openLocal(entry.id))));
    activeReports.forEach((report,index)=>{
      let name='';try{name=vault().paidName(report.report_id,owner);}catch(_){}
      $('homeChartList').append(button(name||'已购深度报告 '+(index+1),'深度报告 · 登录账号保存',()=>openReport(report.report_id)));
    });
    $('switchChartBtn').hidden=entries.length+activeReports.length<2;
    if($('day-chart-switch'))$('day-chart-switch').hidden=entries.length+activeReports.length<2;
    $('homeChartsProfile').href=route('profile');
    const selection=vault().selected(),profileQuery=selection?.kind==='local'?{chart:selection.id}:selection?.kind==='report'?{report:selection.id}:{};
    if($('day-profile-link'))$('day-profile-link').href=route('profile',profileQuery);
    if($('homeRankSynastry'))$('homeRankSynastry').href=route('synastry',profileQuery)+'#rank';
    if($('homeInviteSynastry'))$('homeInviteSynastry').href=route('synastry',profileQuery)+'#invite';
    status(reportsMessage||(entries.length>=2?'本机已保存 2 张基础图谱；可在“我的资料”删除一张后再添加。':entries.length+activeReports.length?'选择一张图谱进入，也可以在“我的资料”管理称呼与合盘。':'还没有保存的图谱，可以先添加一张。'));
  }
  function choose(message,options={}){
    revision++;editingId='';returnSelection=null;cancelButton(false);bridge.reset();bridge.showChooser();setUrl({},options);render();if(message)status(message);
    requestAnimationFrame(()=>$('chartChooserTitle').focus({preventScroll:true}));
  }
  function add(options={}){
    if(!vault().hasRoom()){choose('本机已保存 2 张基础图谱，请在“我的资料”主动删除一张后再添加。已有图谱不会被覆盖。');return;}
    revision++;editingId='';returnSelection=vault().selected();vault().select(null);bridge.reset();$('formTitle').textContent='填写出生资料';
    $('formReadiness').textContent='录入他人资料前，请先取得对方同意。';cancelButton(returnToProfile||locals().length>0||reports.length>0);
    try{sessionStorage.removeItem('zx_display_profile_v1');sessionStorage.removeItem('zx_active_input_v1');sessionStorage.removeItem('zx_report_handoff_v1');}catch(_){}
    if($('bDisplayName'))$('bDisplayName').value='';
    root.dispatchEvent(new CustomEvent('zx-new-chart'));root.dispatchEvent(new CustomEvent('zx-display-profile-changed'));
    setUrl({'new-chart':'1',...formReturnQuery()},options);bridge.showNew();root.dispatchEvent(new CustomEvent('zx-chart-form-changed',{detail:{mode:'new'}}));requestAnimationFrame(()=>{root.scrollTo?.({top:0,behavior:'instant'});$('bDate').focus({preventScroll:true});});
  }
  async function openLocal(id,options={}){
    let entry;try{entry=vault().get(id);}catch(error){choose(error.message);return;}
    if(!entry){
      if(LOCAL.test(id)){
        const epoch=++revision;await refreshReports();if(epoch!==revision)return;
        const state=snapshot(),link=signedIn(state)&&vault().resolvedPaidLink?.(id,state.accountRef);
        if(link){await openReport(link.reportId,{replace:true});return;}
      }
      choose('这张本机图谱已移除，或需要重新确认本机保存方式。请重新选择。',{replace:true});return;
    }
    revision++;editingId='';returnSelection=null;cancelButton(false);bridge.reset();vault().select({kind:'local',id:entry.id});setUrl({chart:entry.id},options);
    bridge.openInput(entry.input,{selection:{kind:'local',id:entry.id},restore:true});render();
  }
  async function openReport(id,options={}){
    if(!REPORT.test(id)){choose('报告入口无效，请从“我的资料”重新选择。');return;}
    const epoch=++revision;editingId='';returnSelection=null;cancelButton(false);setUrl({report:id},options);
    bridge.reset();bridge.showChooser();render();status('正在核验当前账号并读取这张报告的图谱……');
    try{
      if(!root.ZxPrivacyConsent?.has('device_account')||!root.zxMember?.serviceConfigured?.()||!root.zxMember?.paidReportServiceAvailable?.())throw new Error('请在“我的资料”登录原微信账号，报告服务开放后即可恢复。');
      await root.zxMember.start();
      await root.zxMember.freshAccessToken();
      if(epoch!==revision)return;
      const state=snapshot();if(!signedIn(state))throw new Error('请登录原微信账号后查看这张报告。');
      const expected=state.accountRef;
      const result=await root.ZxPaidReports.read(id);
      if(epoch!==revision||!signedIn(snapshot())||snapshot().accountRef!==expected)return;
      const input=reportInput(result,id,ageAllowed);if(!input)throw new Error('这份报告暂不能读取，请到“我的资料”查看交付或保存状态。');
      owner=expected;vault().select({kind:'report',id,accountRef:expected});
      bridge.openInput(input,{selection:{kind:'report',id,accountRef:expected},report:result,restore:true});render();
    }catch(error){if(epoch!==revision)return;status(error&&error.status===401?'登录已失效，请在“我的资料”登录后重试。':error.message||'暂时无法恢复报告，请在“我的资料”重试。');}
  }
  function saved(entry){revision++;editingId='';returnSelection=null;cancelButton(false);setUrl({chart:entry.id},{replace:true});render();}
  function edit(id,options={}){
    const entry=vault().get(id);if(!entry){choose('这张基础图谱已移除，请重新选择。');return;}
    revision++;editingId=entry.id;returnSelection={kind:'local',id:entry.id};cancelButton(true);bridge.reset();vault().select({kind:'local',id:entry.id});bridge.setForm(entry.input);
    if($('bDisplayName'))$('bDisplayName').value=entry.name||'';
    $('formTitle').textContent='修改这张基础图谱';
    $('formReadiness').textContent='只更新这张本机基础图谱，不占新名额；已购报告不会被修改。修改后如需深度报告，须重新核对盘面。';
    setUrl({'edit-chart':entry.id,...formReturnQuery()},options);bridge.showNew();root.dispatchEvent(new CustomEvent('zx-chart-form-changed',{detail:{mode:'edit'}}));requestAnimationFrame(()=>{root.scrollTo?.({top:0,behavior:'instant'});$('bDate').focus({preventScroll:true});});
  }
  function cancel(){
    const previous=returnSelection;editingId='';returnSelection=null;
    if(returnToProfile){
      revision++;bridge.reset();cancelButton(false);
      if(previous?.kind==='local'&&vault().get(previous.id)){vault().select(previous);profileReturn={chart:previous.id};}
      else if(profileReturn.chart&&vault().get(profileReturn.chart))vault().select({kind:'local',id:profileReturn.chart});
      else if(previous?.kind==='report'&&signedIn(snapshot())&&snapshot().accountRef===previous.accountRef){vault().select(previous);profileReturn={report:previous.id};}
      location.replace(route('profile',profileReturn)+'#chart-library-title');return;
    }
    if(previous?.kind==='local'&&vault().get(previous.id))return openLocal(previous.id,{replace:true});
    if(previous?.kind==='report'&&signedIn(snapshot())&&snapshot().accountRef===previous.accountRef)return openReport(previous.id,{replace:true});
    choose('',{replace:true});
  }
  async function refreshReports(){
    if(loading||!bridge.privateMode()||!root.ZxPrivacyConsent?.has('device_account')||!root.zxMember?.serviceConfigured?.()||!root.zxMember?.paidReportServiceAvailable?.())return;
    const syncEpoch=++syncRevision;loading=true;
    try{
      await root.zxMember.start();await root.zxMember.freshAccessToken();const state=snapshot();if(syncEpoch!==syncRevision||!signedIn(state)||!root.ZxPrivacyConsent?.has('device_account'))return;
      const expected=state.accountRef,items=[],seen=new Set();let before;
      do{
        const data=await root.ZxPaidReports.list({limit:50,...(before?{before}:{})});
        if(syncEpoch!==syncRevision||!signedIn(snapshot())||snapshot().accountRef!==expected||!root.ZxPrivacyConsent?.has('device_account'))return;
        if(!data||!Array.isArray(data.items))throw new Error('报告列表暂时不可用');
        items.push(...data.items);before=data.next_before;
        if(before!=null&&(!Number.isSafeInteger(before)||before<1||seen.has(before)))throw new Error('报告列表暂时不可用');
        seen.add(before);
      }while(before!=null&&seen.size<20);
      if(before!=null)throw new Error('报告较多，列表未完整读取，请到“我的资料”继续查看。');
      await vault().reconcile(items,expected);
      if(syncEpoch!==syncRevision||!signedIn(snapshot())||snapshot().accountRef!==expected||!root.ZxPrivacyConsent?.has('device_account'))return;
      reports=items;owner=expected;reportsMessage='';render();
      const current=bridge.getCurrent(),selection=vault().selected(),entry=current?.libraryId&&vault().get(current.libraryId);
      // A storage event can arrive while the report list is in flight. Recheck
      // the current local input after reconciliation as well as its existence.
      if(entry&&current.reportInput&&!sameInput(entry.input,current.reportInput))await openLocal(entry.id,{replace:true});
      else if(booted&&current?.libraryId&&!entry&&selection?.kind==='report')await openReport(selection.id,{replace:true});
      else if(current?.ownedReport&&!reports.some(item=>item.report_id===current.ownedReport.report_id&&readable(item)))choose('这份报告的可读状态已变化，请在“我的资料”查看详情。',{replace:true});
    }catch(_){if(syncEpoch===syncRevision){reportsMessage='已购报告暂时无法同步；本机基础图谱仍可查看。';render();}}
    finally{if(syncEpoch===syncRevision){loading=false;if(bridge.getCurrent()?.libraryId)libraryChanged();}}
  }
  function lastDraft(){
    const options={privateMode:bridge.privateMode(),ageAllowed,homePath:location.pathname,reportPath:new URL(route('report')).pathname};
    for(const [storage,key] of [[sessionStorage,'zx_active_input_v1'],[localStorage,'zx_input']])try{
      const input=legacyInput(JSON.parse(storage.getItem(key)||'null'),options);if(input)return input;
    }catch(_){}
    return null;
  }
  function clear(){revision++;syncRevision++;loading=false;editingId='';returnSelection=null;reports=[];owner='';cancelButton(false);bridge.reset();bridge.showNew(false);render();setUrl({},{replace:true});}
  function libraryChanged(){
    render();if(!booted||loading)return;
    const current=bridge.getCurrent(),entry=current?.libraryId&&vault().get(current.libraryId);
    if(entry&&current.reportInput&&!sameInput(entry.input,current.reportInput)){openLocal(entry.id,{replace:true});return;}
    if(current?.libraryId&&!entry){
      const selection=vault().selected();if(selection?.kind==='report')openReport(selection.id,{replace:true});else choose('这张图谱已在本机移除，请重新选择。');
    }
  }
  root.ZxHomeCharts={choose,add,edit,cancel,render,editingId:()=>editingId,openLocal,openReport,saved,refresh:refreshReports,route};
  if($('cancelChartForm'))$('cancelChartForm').onclick=cancel;
  root.addEventListener('zx-chart-library-changed',libraryChanged);
  ['zx-birth-local-cleared','zx-local-data-cleared'].forEach(type=>root.addEventListener(type,clear));
  root.addEventListener('zx-private-session-cleared',()=>{
    revision++;syncRevision++;loading=false;reports=[];owner='';if(bridge.getCurrent()?.ownedReport){vault().select(null);choose('账号已退出，请重新登录后查看已购图谱。');}else render();
  });
  root.addEventListener('pageshow',event=>{if(event.persisted)bootstrap();});
  root.addEventListener('popstate',()=>{revision++;bootstrap().catch(error=>choose(error.message,{replace:true}));});
  root.addEventListener('focus',()=>{
    libraryChanged();const current=bridge.getCurrent();
    if(current?.ownedReport&&!readable(current.ownedReport))choose('这份报告已到保存期限，请在“我的资料”查看详情。',{replace:true});
    refreshReports();
  });
  async function bootstrap(){
    const epoch=++revision;
    booted=false;bridge.reset();
    const query=new URLSearchParams(location.search);
    returnToProfile=query.getAll('return').length===1&&query.get('return')==='profile';profileReturn={};
    if(returnToProfile){
      if(query.getAll('return-chart').length===1&&LOCAL.test(query.get('return-chart')||'')&&!query.has('return-report'))profileReturn={chart:query.get('return-chart')};
      else if(query.getAll('return-report').length===1&&REPORT.test(query.get('return-report')||'')&&!query.has('return-chart'))profileReturn={report:query.get('return-report')};
    }
    const requested=query.get('chart'),requestedReport=query.get('report'),requestedEdit=query.get('edit-chart');
    if(['chart','report','edit-chart','new-chart','save-last'].some(key=>query.getAll(key).length>1)||
      [requested,requestedReport,requestedEdit,query.get('new-chart')==='1',query.get('save-last')==='1'].filter(Boolean).length>1){booted=true;choose('图谱入口不明确，请重新选择。');return;}
    if(query.get('new-chart')==='1'){booted=true;add({replace:true});return;}
    if(requestedEdit){booted=true;edit(requestedEdit,{replace:true});return;}
    if(requested){booted=true;await openLocal(requested,{replace:true});refreshReports();return;}
    if(requestedReport){booted=true;await openReport(requestedReport,{replace:true});refreshReports();return;}
    if(query.get('save-last')==='1'){
      const last=lastDraft();booted=true;
      if(last&&vault().hasRoom()){vault().select(null);bridge.requestSaveLast(last,true);return;}
      choose(last?'本机已保存 2 张，请先在“我的资料”删除一张。':'旧草稿已过期或已清除，请添加新的图谱。');return;
    }
    render();bridge.showChooser();await refreshReports();if(epoch!==revision)return;booted=true;
    const entries=locals(),paid=reports.filter(item=>readable(item)),total=entries.length+paid.length;
    if(total>1){choose('',{replace:true});return;}
    if(total===1){if(entries.length)openLocal(entries[0].id,{replace:true});else await openReport(paid[0].report_id,{replace:true});return;}
    const last=lastDraft();if(last){vault().select(null);bridge.requestSaveLast(last);return;}
    bridge.showNew(false);
  }
  bootstrap().catch(error=>{booted=true;choose(error.message||'本机图谱暂时无法读取，请在“我的资料”查看。');});
})(typeof window==='object'?window:globalThis);
