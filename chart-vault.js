/* Local chart slots are not report entitlements. Paid access always comes from the account service. */
(function(root){
  'use strict';
  const KEY='zx_chart_library_v1', SELECTION_KEY='zx_chart_selection_v1', LIMIT=2;
  const LOCAL=/^[a-f0-9]{32}$/, REPORT=/^[a-f0-9]{48}$/, OWNER=/^[a-f0-9]{64}$/;
  const copy=value=>JSON.parse(JSON.stringify(value));
  const fail=(code,message)=>{const error=new Error(message);error.code=code;throw error;};
  const consent=()=>!!root.ZxPrivacyConsent?.has('birth_local');
  const empty=()=>({version:1,entries:[],paidLinks:[]});
  function name(value){
    const result=String(value??'').normalize('NFC').trim();
    const length=typeof Intl.Segmenter==='function'?[...new Intl.Segmenter('zh',{granularity:'grapheme'}).segment(result)].length:Array.from(result).length;
    if(length>20||/[<>{}\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u.test(result))fail('INVALID_NAME','称呼最多 20 个字，不能包含控制符或尖括号。');
    return result;
  }
  function input(value){
    if(!value||typeof value.d!=='string'||!root.ZxMinimumAge?.evaluateMinimumAge(value.d).allowed||
      typeof value.t!=='string'||(value.t&&!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value.t))||
      typeof value.c!=='string'||!value.c.trim()||value.c.length>160||/[<>\u0000-\u001f]/.test(value.c)||!['','男','女','其他'].includes(value.g))fail('INVALID_INPUT','请填写有效的出生资料。');
    return {d:value.d,t:value.t,c:value.c.trim(),g:value.g};
  }
  const identity=value=>{
    const normalized=input(value),city=root.BaziEngine?.resolveCity?.(normalized.c);
    // A short city name and its full administrative path identify the same input.
    if(city?.complete)normalized.c=String(city.id||city.code||city.label||normalized.c);
    return JSON.stringify(normalized);
  };
  function currentOwner(accountRef){
    if(!OWNER.test(accountRef))return false;
    const state=root.zxMember?.snapshot?.();
    return !state||state.authenticated===true&&state.identityKind==='wechat'&&state.accountRef===accountRef;
  }
  function temporaryInput(record){
    try{return record&&identity(record.input||record);}catch(_){return null;}
  }
  function clearTemporaryInput(previous){
    const target=identity(previous);
    for(const [storage,key] of [[root.localStorage,'zx_input'],[root.sessionStorage,'zx_active_input_v1'],[root.sessionStorage,'zx_report_handoff_v1']]){
      try{if(temporaryInput(JSON.parse(storage.getItem(key)||'null'))===target)storage.removeItem(key);}catch(_){}
    }
  }
  function forgetMissingSelection(data){
    try{
      const selection=JSON.parse(root.sessionStorage.getItem(SELECTION_KEY)||'null');
      if(selection?.kind!=='local'||data.entries.some(entry=>entry.id===selection.id))return;
      root.sessionStorage.removeItem(SELECTION_KEY);
      root.sessionStorage.removeItem('zx_active_input_v1');root.sessionStorage.removeItem('zx_report_handoff_v1');root.sessionStorage.removeItem('zx_display_profile_v1');
    }catch(_){}
  }
  function readStore(){
    let value;
    try{value=JSON.parse(root.localStorage.getItem(KEY)||'null');}catch(_){return fail('STORE_UNAVAILABLE','本机图谱暂时无法读取，请检查浏览器存储。');}
    if(value===null)return empty();
    if(value.version!==1||!Array.isArray(value.entries)||!Array.isArray(value.paidLinks))return fail('STORE_INVALID','本机图谱记录异常，原记录已保留，请先导出资料。');
    const ids=new Set();
    for(const entry of value.entries){
      if(!entry||!LOCAL.test(entry.id)||ids.has(entry.id)||!Number.isSafeInteger(entry.createdAt)||!Number.isSafeInteger(entry.updatedAt))return fail('STORE_INVALID','本机图谱记录异常，原记录已保留。');
      ids.add(entry.id);input(entry.input);name(entry.name);
      if((entry.reportId||entry.accountRef)&&(!REPORT.test(entry.reportId)||!OWNER.test(entry.accountRef)))fail('STORE_INVALID','图谱关联记录异常，原记录已保留。');
    }
    for(const link of value.paidLinks){if(!link||!LOCAL.test(link.id)||!REPORT.test(link.reportId)||!OWNER.test(link.accountRef)||Object.hasOwn(link,'input'))fail('STORE_INVALID','报告称呼记录异常，原记录已保留。');name(link.name);}
    return value;
  }
  function announce(){root.dispatchEvent?.(new root.CustomEvent('zx-chart-library-changed'));}
  let queue=Promise.resolve();
  let lockDatabase;
  function legacyLock(run){
    // IndexedDB read-write transactions serialize older WebViews across tabs as well.
    if(!lockDatabase)lockDatabase=new Promise((resolve,reject)=>{
      const request=root.indexedDB.open('zx_test_sim_chart_library_lock_v1',1);
      request.onupgradeneeded=()=>request.result.createObjectStore('locks');
      request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
    });
    return lockDatabase.then(db=>new Promise((resolve,reject)=>{
      const transaction=db.transaction('locks','readwrite'),store=transaction.objectStore('locks');let result,error;
      const request=store.get(KEY);
      request.onsuccess=()=>{try{result=run();store.put(Date.now(),KEY);}catch(caught){error=caught;transaction.abort();}};
      transaction.oncomplete=()=>resolve(result);transaction.onabort=transaction.onerror=()=>reject(error||transaction.error||new Error('本机图谱暂时无法保存，请重试。'));
    }));
  }
  function mutate(operation){
    const run=()=>{
      if(!consent())fail('CONSENT_REQUIRED','请先确认本机图谱的保存方式。');
      const data=readStore(),result=operation(data);
      root.localStorage.setItem(KEY,JSON.stringify(data));announce();return copy(result??null);
    };
    if(root.navigator?.locks?.request)return root.navigator.locks.request(KEY,run);
    if(root.indexedDB?.open)return legacyLock(run);
    const pending=queue.then(run);queue=pending.catch(()=>{});return pending;
  }
  function newId(){if(!root.crypto?.getRandomValues)fail('RANDOM_UNAVAILABLE','浏览器暂不支持安全保存，请更新浏览器。');return Array.from(root.crypto.getRandomValues(new Uint8Array(16)),n=>n.toString(16).padStart(2,'0')).join('');}
  function list(){if(!consent())return [];return copy(readStore().entries);}
  function get(id){return list().find(entry=>entry.id===id)||null;}
  function selected(){
    try{const item=JSON.parse(root.sessionStorage.getItem(SELECTION_KEY)||'null');
      if(item?.kind==='local'&&LOCAL.test(item.id)&&get(item.id))return {kind:'local',id:item.id};
      if(item?.kind==='report'&&REPORT.test(item.id)&&OWNER.test(item.accountRef))return {kind:'report',id:item.id,accountRef:item.accountRef};
    }catch(_){}return null;
  }
  function select(value){
    if(value===null){root.sessionStorage.removeItem(SELECTION_KEY);announce();return null;}
    let selection;
    if(value?.kind==='local'&&LOCAL.test(value.id)&&get(value.id))selection={kind:'local',id:value.id};
    else if(value?.kind==='report'&&REPORT.test(value.id)&&OWNER.test(value.accountRef))selection={kind:'report',id:value.id,accountRef:value.accountRef};
    else return fail('INVALID_SELECTION','这张图谱暂时不可用，请重新选择。');
    root.sessionStorage.setItem(SELECTION_KEY,JSON.stringify(selection));announce();return selection;
  }
  async function save(value){
    const normalized=input(value?.input),display=name(value?.name);
    return mutate(data=>{
      let entry=data.entries.find(item=>identity(item.input)===identity(normalized));
      if(entry){entry.name=display;entry.updatedAt=Date.now();return entry;}
      if(data.entries.length>=LIMIT)fail('CHART_LIMIT','本机已保存 2 张基础图谱。请在“我的资料”主动删除一张后再添加，已有图谱不会被覆盖。');
      entry={id:newId(),name:display,input:normalized,createdAt:Date.now(),updatedAt:Date.now()};data.entries.push(entry);return entry;
    });
  }
  const rename=(id,value)=>mutate(data=>{const entry=data.entries.find(item=>item.id===id);if(!entry)fail('CHART_MISSING','这张图谱已被移除，请重新选择。');entry.name=name(value);entry.updatedAt=Date.now();return entry;});
  const updateInput=(id,value)=>mutate(data=>{
    const entry=data.entries.find(item=>item.id===id);if(!entry)fail('CHART_MISSING','这张图谱已被移除，请重新选择。');
    const normalized=input(value?.input),display=name(value?.name);
    if(data.entries.some(item=>item.id!==id&&identity(item.input)===identity(normalized)))fail('CHART_DUPLICATE','本机已保存相同出生资料的另一张图谱，请直接选择已有图谱。');
    if(identity(entry.input)!==identity(normalized)){clearTemporaryInput(entry.input);delete entry.reportId;delete entry.accountRef;}
    entry.input=normalized;entry.name=display;entry.updatedAt=Date.now();return entry;
  });
  async function remove(id){
    const result=await mutate(data=>{const index=data.entries.findIndex(entry=>entry.id===id);if(index===-1)fail('CHART_MISSING','这张图谱已被移除。');clearTemporaryInput(data.entries[index].input);data.entries.splice(index,1);return true;});
    forgetMissingSelection(readStore());announce();
    return result;
  }
  const bindReport=(id,reportId,accountRef,expectedInput)=>mutate(data=>{
    if(!REPORT.test(reportId)||!OWNER.test(accountRef))fail('INVALID_REPORT','报告关联信息无效。');
    if(!currentOwner(accountRef))fail('ACCOUNT_CHANGED','账号已变化，请重新读取当前账号报告。');
    const entry=data.entries.find(item=>item.id===id);if(!entry)fail('CHART_MISSING','原图谱已移除，报告仍可从账号中恢复。');
    if(expectedInput&&identity(entry.input)!==identity(expectedInput))fail('CHART_CHANGED','这张本机图谱的资料已修改；原报告可从账号恢复，未关联到新资料。');
    entry.reportId=reportId;entry.accountRef=accountRef;entry.updatedAt=Date.now();return entry;
  });
  const usable=(item,now=Date.now())=>!!(item&&REPORT.test(item.report_id)&&item.readable===true&&!item.unavailable_reason&&item.refund_status!=='pending'&&item.entitlement_status==='active'&&item.delivery_status==='ready'&&Number.isSafeInteger(item.expires_at)&&item.expires_at>now);
  async function reconcile(reports,accountRef){
    if(!consent())return [];
    if(!OWNER.test(accountRef)||!Array.isArray(reports))fail('INVALID_OWNER','请重新登录后恢复报告。');
    const valid=new Set(reports.filter(item=>usable(item)).map(item=>item.report_id));
    const migrated=await mutate(data=>{
      const state=root.zxMember?.snapshot?.();
      if(state&&!currentOwner(accountRef))fail('ACCOUNT_CHANGED','账号已变化，请重新读取当前账号报告。');
      const removed=data.entries.filter(entry=>entry.accountRef===accountRef&&valid.has(entry.reportId));
      for(const entry of removed){const alias={id:entry.id,name:entry.name,reportId:entry.reportId,accountRef};const at=data.paidLinks.findIndex(link=>link.reportId===entry.reportId&&link.accountRef===accountRef);if(at<0)data.paidLinks.push(alias);else data.paidLinks[at]=alias;}
      data.entries=data.entries.filter(entry=>!removed.includes(entry));return removed.map(entry=>({id:entry.id,reportId:entry.reportId}));
    });
    try{const current=JSON.parse(root.sessionStorage.getItem(SELECTION_KEY)||'null');const link=migrated.find(item=>current?.kind==='local'&&item.id===current.id);if(link)select({kind:'report',id:link.reportId,accountRef});}catch(_){}
    return migrated;
  }
  function paidName(reportId,accountRef){if(!consent()||!currentOwner(accountRef))return '';return readStore().paidLinks.find(link=>link.reportId===reportId&&link.accountRef===accountRef)?.name||'';}
  function resolvedPaidLink(localId,accountRef){
    if(!consent()||!LOCAL.test(localId)||!currentOwner(accountRef))return null;
    const link=readStore().paidLinks.find(item=>item.id===localId&&item.accountRef===accountRef);
    return link?{id:link.id,name:link.name,reportId:link.reportId,accountRef:link.accountRef}:null;
  }
  const renamePaid=(reportId,accountRef,value)=>mutate(data=>{
    if(!REPORT.test(reportId)||!OWNER.test(accountRef))fail('INVALID_OWNER','请重新登录后恢复报告。');
    if(!currentOwner(accountRef))fail('ACCOUNT_CHANGED','账号已变化，请重新读取当前账号报告。');
    let link=data.paidLinks.find(row=>row.reportId===reportId&&row.accountRef===accountRef);
    if(!link){link={id:newId(),reportId,accountRef,name:''};data.paidLinks.push(link);}link.name=name(value);return link;
  });
  const subscribe=fn=>{root.addEventListener?.('zx-chart-library-changed',fn);return()=>root.removeEventListener?.('zx-chart-library-changed',fn);};
  root.addEventListener?.('storage',event=>{
    if(event.key!==KEY&&event.key!==null)return;
    try{
      const data=readStore(),previous=event.oldValue?JSON.parse(event.oldValue):null;
      for(const entry of previous?.entries||[]){const next=data.entries.find(row=>row.id===entry.id);if(!next||identity(next.input)!==identity(entry.input))clearTemporaryInput(entry.input);}
      forgetMissingSelection(data);
    }catch(_){}
    announce();
  });
  ['zx-birth-local-cleared','zx-local-data-cleared'].forEach(type=>root.addEventListener?.(type,announce));
  const api={KEY,SELECTION_KEY,LIMIT,list,get,selected,select,save,rename,updateInput,remove,bindReport,reconcile,paidName,resolvedPaidLink,renamePaid,hasRoom:()=>list().length<LIMIT,subscribe,usable};
  root.ZxChartVault=api;if(typeof module==='object')module.exports=api;
})(typeof window==='object'?window:globalThis);
