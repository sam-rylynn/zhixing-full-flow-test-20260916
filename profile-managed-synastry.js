/* Account-owned two-report analysis. Local chart entries never confer paid access. */
(() => {
  'use strict';
  const VERSION='managed-synastry-consent-20260911-v1',REPORT_ID=/^[a-f0-9]{48}$/,PAIR_ID=/^[a-f0-9]{64}$/;
  const MESSAGES={REPORT_SERVICE_UNAVAILABLE:'账号与合盘服务暂未开放。可先把两张基础图谱保存在本机，深度报告开放后再解锁合盘。',
    SYN_DISABLED:'合盘服务暂未开放，所选的个人报告仍可正常查看。',WECHAT_AUTHENTICATION_REQUIRED:'请先到账号页验证微信身份，再读取已购买的报告。',
    REPORT_ACCOUNT_CHANGED:'账号已切换，请重新打开自己的合盘。',PRIVACY_CONSENT_REQUIRED:'请先到账号页确认账号资料用途。',
    AUTH_REQUIRED:'账号会话已失效，请重新登录。',REPORT_UNAVAILABLE:'所选报告尚未交付、已经到期或当前不可用，请刷新资料后重新选择。',
    MANAGED_DISTINCT_REPORTS_REQUIRED:'请选择两张出生资料不同的有效深度报告。',MANAGED_PERMISSION_REQUIRED:'请确认你有权使用两张资料开展本次合盘。',
    CURSOR_INVALID:'记录已更新，请刷新重试。',PAIR_RECONFIRM_REQUIRED:'来源报告已更正，请重新选盘并确认。旧的合盘已停止阅读。',PAIR_UNAVAILABLE:'此份合盘已移除或来源报告已失效。',
    PARTICIPANT_INELIGIBLE:'两张资料的主体均需已满 18 周岁。',RATE_LIMITED:'操作较频繁，请稍后重试。',NOT_FOUND:'没有找到当前账号可查看的这份合盘。'};
  let active=null,revision=0;
  const PICK_KEY='zx_managed_synastry_selection_v1';
  let remembered=null;
  const selectionOwner=()=>{const s=state();return s.authenticated&&s.identityKind==='wechat'&&/^[a-f0-9]{64}$/.test(s.accountRef||'')?s.accountRef:'';};
  function savedPicks(owner){
    try{const value=remembered||JSON.parse(sessionStorage.getItem(PICK_KEY)||'null');
      if(value&&value.version===1&&Array.isArray(value.picks)&&value.picks.length===2&&(value.owner===owner||!value.owner&&value.picks.every(p=>String(p.key).startsWith('draft:'))))return value.picks.map(p=>({key:String(p.key),reportId:REPORT_ID.test(p.reportId||'')?p.reportId:''}));
    }catch(_){}return null;
  }
  function remember(ctx,picks){
    ctx.picks=picks.map(p=>({key:p.key,reportId:p.reportId||''}));
    remembered={version:1,owner:ctx.selectionOwner,picks:ctx.picks};
    try{sessionStorage.setItem(PICK_KEY,JSON.stringify(remembered));}catch(_){}
  }
  function preparedPick(ctx,key,reportId){
    if(selectionOwner()!==ctx.selectionOwner||!REPORT_ID.test(reportId||''))return;
    remember(ctx,(ctx.picks||[]).map(p=>p.key===key?{...p,reportId}:p));
  }
  const node=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=String(text??'');if(cls)n.className=cls;return n;};
  const error=code=>Object.assign(new Error(code),{code});
  const state=()=>window.zxMember?.snapshot?.()||{};
  const usable=r=>REPORT_ID.test(r?.report_id||'')&&r.readable===true&&r.entitlement_status==='active'&&r.delivery_status==='ready'&&
    !r.unavailable_reason&&r.refund_status!=='pending'&&Number.isSafeInteger(r.storage_expires_at??r.expires_at)&&(r.storage_expires_at??r.expires_at)>Date.now();
  const name=r=>String(r?.name||r?.displayName||r?.nickname||r?.title||'未设置昵称').slice(0,100);
  function button(text,fn,cls='button'){const n=node('button',text,cls);n.type='button';if(fn)n.addEventListener('click',fn);return n;}
  function current(ctx,ownerRequired=true){
    if(active!==ctx||ctx.revision!==revision||!ctx.dialog.open)throw error('VIEW_CLOSED');
    const s=state();if(ownerRequired&&(!ctx.owner||!s.authenticated||s.identityKind!=='wechat'||s.accountRef!==ctx.owner))throw error('REPORT_ACCOUNT_CHANGED');
  }
  function close(){const old=active;active=null;revision++;if(old){old.reports=[];old.entries=[];old.body.replaceChildren();if(old.dialog.open)old.dialog.close();old.dialog.remove();old.returnFocus?.focus?.();}}
  function message(ctx,text){if(active===ctx)ctx.notice.textContent=text;}
  function handle(ctx,e){
    if(active!==ctx||e.code==='VIEW_CLOSED')return;
    if(['REPORT_ACCOUNT_CHANGED','AUTH_REQUIRED','WECHAT_AUTHENTICATION_REQUIRED'].includes(e.code)){
      ctx.reports=[];ctx.entries=[];ctx.body.replaceChildren(node('p',MESSAGES[e.code],'managed-note'));ctx.owner='';return;
    }
    if(['SYN_DISABLED','REPORT_SERVICE_UNAVAILABLE'].includes(e.code))ctx.enabled=false;
    message(ctx,MESSAGES[e.code||e.error]||'合盘暂时无法完成，请稍后刷新。');
  }
  async function call(ctx,path,body){current(ctx);const r=await window.zxMember.synastryCall(path,body);current(ctx);return r;}
  function act(ctx,target,fn){target.addEventListener('click',async()=>{
    if(target.disabled||ctx.busy)return;ctx.busy=true;target.disabled=true;
    try{current(ctx);await fn();}catch(e){handle(ctx,e);}finally{ctx.busy=false;if(active===ctx&&target.isConnected)target.disabled=false;}
  });return target;}
  function start(ctx,title){current(ctx,false);ctx.title.textContent=title;ctx.body.replaceChildren();ctx.dialog.scrollTop=0;ctx.notice=node('p','','managed-note');ctx.notice.setAttribute('role','status');ctx.body.append(ctx.notice);}
  async function refreshReports(ctx){
    const items=[],seen=new Set();let before;
    do{current(ctx);const page=await window.zxMember.paidReportList(before?{before}:undefined);current(ctx);
      if(!Array.isArray(page?.items))throw error('REPORT_UNAVAILABLE');items.push(...page.items);before=page.next_before;
      if(before&&(!Number.isSafeInteger(before)||seen.has(before)||seen.size>=200))throw error('REPORT_UNAVAILABLE');if(before)seen.add(before);
    }while(before);
    ctx.reports=items.filter(usable).map(r=>{
      const supplied=ctx.suppliedReports.find(item=>item.report_id===r.report_id);
      return supplied?{...r,name:supplied.name||supplied.displayName||supplied.nickname||r.title}:r;
    });
  }
  function options(ctx){
    const reports=ctx.reports.map(r=>({key:'report:'+r.report_id,report:r,title:name(r),locked:false}));
    const drafts=ctx.entries.filter(e=>!reports.some(r=>r.report.report_id===(e.reportId||e.report_id))).map((e,i)=>({key:'draft:'+(e.id||i),entry:e,title:name(e),locked:true}));
    return [...reports,...drafts];
  }
  function pick(ctx){
    start(ctx,'选择两张图谱合盘');
    ctx.body.append(node('p','从同一账号的两份深度报告，了解两个人的相处方式。合盘保存在当前账号，双方个人报告仍各自保留。','managed-note'));
    const choices=options(ctx),form=node('form'),selects=[],previous=ctx.picks;
    const fallback=choices.map(c=>c.key);
    form.addEventListener('submit',e=>e.preventDefault());
    ['第一张图谱','第二张图谱'].forEach((title,i)=>{
      const label=node('label',title,'managed-field'),select=node('select');select.setAttribute('aria-label',title);
      const empty=node('option','请选择图谱');empty.value='';select.append(empty);
      choices.forEach(c=>{const option=node('option',c.title+(c.locked?' · 待解锁深度报告':' · 已解锁'));option.value=c.key;select.append(option);});
      const prior=previous?.[i];
      const restored=prior&&(choices.find(c=>c.key===prior.key)||choices.find(c=>prior.reportId&&c.report?.report_id===prior.reportId));
      select.value=restored?.key||(prior?.key?'':fallback.find(key=>!selects.some(s=>s.value===key))||'');label.append(select);form.append(label);selects.push(select);
    });
    const consentLabel=node('label',undefined,'managed-check'),consent=node('input');consent.type='checkbox';
    consentLabel.append(consent,node('span','我确认两张资料均有权使用，并同意用于本次合盘。涉及他人时，已得到资料主体的授权。'));
    const detail=node('p','仅当前账号可看；不会创建好友邀请。使用程序生成四章解读，不会将资料发送给第三方 AI。','managed-note');
    const submit=button('生成合盘',undefined,'button primary'),unlock=button('解锁所选图谱'),feedback=node('p','','managed-note');feedback.setAttribute('role','status');
    const selected=()=>selects.map(s=>choices.find(c=>c.key===s.value));
    const update=()=>{
      const pair=selected();
      remember(ctx,selects.map((s,i)=>({key:s.value,reportId:pair[i]?.report?.report_id||(pair[i]?.entry?.accountRef===ctx.selectionOwner?pair[i]?.entry?.reportId:'')||ctx.picks?.find(p=>p.key===s.value)?.reportId||''})));
      const distinct=pair.every(Boolean)&&pair[0].key!==pair[1].key,locked=pair.filter(p=>p?.locked);
      consent.disabled=!distinct||locked.length>0;submit.hidden=locked.length>0;unlock.hidden=!locked.length;
      submit.disabled=!ctx.enabled||!distinct||!consent.checked;unlock.disabled=!distinct||typeof ctx.onUnlock!=='function';
      feedback.textContent=!distinct?'请选择两张不同的图谱。':locked.length?'还需解锁 '+locked.map(c=>c.title).join('、')+' 的深度报告，之后可以生成合盘。':!ctx.enabled?MESSAGES.REPORT_SERVICE_UNAVAILABLE:'两份报告均已交付，确认资料授权后可生成合盘。';
    };
    selects.forEach(s=>s.addEventListener('change',()=>{consent.checked=false;update();}));consent.addEventListener('change',update);
    unlock.addEventListener('click',()=>{if(unlock.disabled||ctx.busy)return;const choice=selected().find(c=>c?.locked),callback=ctx.onUnlock;if(choice&&typeof callback==='function'){const key=choice.key;close();callback(choice.entry,{onPrepared:reportId=>preparedPick(ctx,key,reportId)});}});
    submit.addEventListener('click',async()=>{
      if(submit.disabled||ctx.busy)return;const pair=selected();ctx.busy=true;selects.forEach(s=>s.disabled=true);consent.disabled=true;submit.disabled=true;
      try{
        current(ctx);if(!consent.checked||pair.some(c=>!c||c.locked))throw error('MANAGED_PERMISSION_REQUIRED');
        const result=await call(ctx,'/synastry/managed-pairs',{reportIds:pair.map(c=>c.report.report_id),consent:{confirmed:true,version:VERSION}});
        reading(ctx,result);if(typeof ctx.onChanged==='function')ctx.onChanged();
      }catch(e){handle(ctx,e);}finally{ctx.busy=false;if(active===ctx&&form.isConnected){selects.forEach(s=>s.disabled=false);update();}}
    });
    form.append(consentLabel,detail,feedback,submit,unlock);ctx.body.append(form);
    if(choices.length<2)ctx.body.append(node('p','请先在「我的资料」添加另一张基础图谱，或恢复账号中的另一份深度报告。','managed-note'),button('返回我的资料添加图谱',close));
    if(ctx.owner)ctx.body.append(act(ctx,button('查看本账号的合盘记录'),()=>records(ctx)));
    update();
  }
  function reading(ctx,result){
    if(result?.status!=='ready'||!PAIR_ID.test(result.id||'')||!Array.isArray(result.report?.chapters)||result.report.chapters.length!==4)throw error('PAIR_UNAVAILABLE');
    start(ctx,'本账号的合盘');
    const ids=result.reportIds||[],names=ids.map((id,i)=>name(ctx.reports.find(r=>r.report_id===id)||{title:i?'第二张图谱':'第一张图谱'}));
    const opening=window.ZxSynastryOpening?.create(result.report.opening,{names});
    if(opening)ctx.body.append(opening);
    else ctx.body.append(node('h3',names.join(' × ')));
    ctx.body.append(node('p','此份合盘仅当前账号可看。','managed-note'));
    if(typeof result.report.precisionNotice==='string'&&result.report.precisionNotice.trim())ctx.body.append(node('p',result.report.precisionNotice,'managed-note'));
    const sourceNames={'day-stems':'八字 · 日干关系','day-branches':'八字 · 日支关系','day-elements':'八字 · 日主五行','astro-sun':'星盘 · 太阳夹角','astro-moon':'星盘 · 月亮夹角','astro-asc':'星盘 · 上升夹角'};
    for(const chapter of result.report.chapters){
      const section=node('section',undefined,'managed-chapter');section.append(node('h3',chapter.title),node('p',chapter.scene),node('p',chapter.shared));
      ['person-a','person-b'].forEach((id,i)=>{
        const detail=node('details'),summary=node('summary',names[i]+'的相处提示'),view=chapter.views?.[id];detail.append(summary);
        if(typeof view?.headline==='string'&&view.headline.trim())detail.append(node('h4',view.headline,'managed-reading-headline'));
        detail.append(node('p',view?.advice));
        if(view?.actions&&typeof view.actions==='object'){
          const actions=node('div',undefined,'managed-reading-actions');
          [['own','你可以做什么'],['other','对方可以做什么'],['together','一起试一次']].forEach(([key,title])=>{
            const text=view.actions[key];if(typeof text!=='string'||!text.trim())return;
            const item=node('div',undefined,'managed-reading-action');item.append(node('h4',title),node('p',text));actions.append(item);
          });detail.append(actions);
        }
        if(typeof view?.reminder==='string'&&view.reminder.trim())detail.append(node('p',view.reminder,'managed-note'));
        section.append(detail);
      });
      section.append(node('p',(chapter.sourceIds||[]).map(id=>sourceNames[id]).filter(Boolean).join(' · '),'managed-note'));ctx.body.append(section);
    }
    ctx.body.append(node('p',result.report.disclaimer,'managed-note'));
    if(Number.isSafeInteger(result.expiresAt))ctx.body.append(node('p','可阅读至 '+new Date(result.expiresAt).toLocaleDateString('zh-CN',{timeZone:'Asia/Shanghai'})+'；来源报告更正、失效或被删除后，此份合盘停止阅读。','managed-note'));
    ctx.body.append(act(ctx,button('返回合盘记录'),()=>records(ctx)));
  }
  async function records(ctx){
    start(ctx,'本账号的合盘记录');
    const seen=new Set(),cursors=new Set(),cards=node('div'),empty=node('p','还没有本账号的合盘。','managed-note');
    let cursor=null;
    empty.hidden=true;
    const more=act(ctx,button('加载更多'),()=>load(cursor));more.hidden=true;
    ctx.body.append(button('选择两张图谱合盘',()=>{if(!ctx.busy)pick(ctx);},'button primary'),
      act(ctx,button('刷新'),()=>records(ctx)),cards,empty,more);
    function append(item){
      if(!PAIR_ID.test(item?.id||'')||seen.has(item.id))return;
      seen.add(item.id);
      const card=node('article',undefined,'managed-chapter'),names=(item.reportIds||[]).map((id,i)=>name(ctx.reports.find(r=>r.report_id===id)||{title:i?'第二张图谱':'第一张图谱'}));
      card.append(node('h3',names.join(' × ')),act(ctx,button('阅读合盘'),async()=>reading(ctx,await call(ctx,'/synastry/managed-pairs/'+item.id))));
      const remove=button('移除此份合盘',()=>{
        if(ctx.busy)return;const area=node('div',undefined,'managed-confirm');
        area.append(node('p','只删除此份合盘，保留两张个人图谱和深度报告。','managed-note'),act(ctx,button('确认移除'),async()=>{
          await call(ctx,'/synastry/managed-pairs/'+item.id+'/remove',{confirmed:true});await records(ctx);if(typeof ctx.onChanged==='function')ctx.onChanged();
        }),button('保留',()=>{area.remove();remove.disabled=false;}));card.append(area);remove.disabled=true;
      });card.append(remove);cards.append(card);
    }
    async function load(after){
      const response=await call(ctx,'/synastry/managed-pairs'+(after?'?limit=20&cursor='+encodeURIComponent(after):''));
      if(!cards.isConnected)throw error('VIEW_CLOSED');
      if(!Array.isArray(response?.items))throw error('PAIR_UNAVAILABLE');
      const next=response.nextCursor??null;
      if(next!==null&&(typeof next!=='string'||next.length>512||!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/.test(next)||cursors.has(next)))throw error('CURSOR_INVALID');
      if(response.hasMore!==undefined&&(typeof response.hasMore!=='boolean'||response.hasMore!==!!next))throw error('CURSOR_INVALID');
      response.items.forEach(append);cursor=next;if(next)cursors.add(next);
      more.hidden=!cursor;empty.hidden=seen.size>0||!!cursor;message(ctx,'');
    }
    const busy=ctx.busy;ctx.busy=true;
    try{await load();}finally{ctx.busy=busy;}
  }
  async function open(options={}){
    close();const dialog=node('dialog',undefined,'managed-synastry-dialog'),wrap=node('div',undefined,'dialog-body'),header=node('div',undefined,'section-heading'),title=node('h2','选择两张图谱合盘');
    dialog.setAttribute('style','background-color:#1a2233');
    title.id='managed-synastry-title';dialog.setAttribute('aria-labelledby',title.id);const exit=button('×',close,'close-button');exit.setAttribute('aria-label','关闭合盘');header.append(title,exit);
    const body=node('div');wrap.append(header,body);dialog.append(wrap);document.body.append(dialog);
    const ctx={dialog,title,body,revision:++revision,owner:'',reports:[],suppliedReports:Array.isArray(options.reports)?options.reports.slice():[],entries:Array.isArray(options.entries)?options.entries.slice():[],enabled:false,busy:false,
      onChanged:options.onChanged,onUnlock:options.onUnlock,returnFocus:document.activeElement,selectionOwner:selectionOwner()};ctx.picks=savedPicks(ctx.selectionOwner);active=ctx;
    dialog.addEventListener('close',()=>{if(active===ctx)close();});dialog.showModal();
    if(!window.zxMember?.paidReportServiceAvailable?.()||!window.zxMember?.synastryCall){pick(ctx);message(ctx,MESSAGES.REPORT_SERVICE_UNAVAILABLE);return;}
    start(ctx,'选择两张图谱合盘');message(ctx,'正在核对账号中的图谱…');
    try{
      await window.zxMember.start();current(ctx,false);const s=state();
      if(!s.authenticated||s.identityKind!=='wechat'||!s.accountRef){pick(ctx);message(ctx,MESSAGES.WECHAT_AUTHENTICATION_REQUIRED);return;}
      ctx.owner=s.accountRef;ctx.selectionOwner=s.accountRef;await refreshReports(ctx);current(ctx);ctx.enabled=true;
      if(options.kind==='records')await records(ctx);else pick(ctx);
    }catch(e){handle(ctx,e);}
  }
  ['zx-private-session-cleared','zx-birth-local-cleared','zx-local-data-cleared'].forEach(event=>window.addEventListener(event,()=>{remembered=null;try{sessionStorage.removeItem(PICK_KEY);}catch(_){}close();}));
  window.addEventListener('focus',()=>{if(active?.owner&&(state().accountRef!==active.owner||!state().authenticated))handle(active,error('REPORT_ACCOUNT_CHANGED'));});
  window.ZxManagedSynastry=Object.freeze({open,close});
})();
