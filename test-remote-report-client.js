/* Independent test artifact only. Loaded before the simulation network interceptor. */
(()=>{
 'use strict';
 if(!((location.protocol==='https:'&&location.hostname==='sam-rylynn.github.io'&&location.pathname.startsWith('/zhixing-full-flow-test-20260916/'))||(location.protocol==='http:'&&location.hostname==='127.0.0.1')))return;
 const network=window.fetch.bind(window),cache=new Map();
 async function call(body){
  const key=JSON.stringify({...body,consent:true});if(cache.has(key))return cache.get(key);
  const pending=network('https://zhixng.cn/__test_reports_20260916',{method:'POST',headers:{'Content-Type':'application/json'},body:key,cache:'no-store',credentials:'omit',referrerPolicy:'no-referrer',signal:AbortSignal.timeout(20000)}).then(async response=>{
   const data=await response.json();if(!response.ok||data.remoteGenerated!==true)throw Object.assign(new Error('测试报告生成未完成，请检查网络和资料后重试。'),{code:data.error?.code||'TEST_REPORT_FAILED'});return data;
  });
  cache.set(key,pending);if(cache.size>8)cache.delete(cache.keys().next().value);
  try{return await pending;}catch(e){cache.delete(key);throw e;}
 }
 window.ZXTestRemoteReports=Object.freeze({
  mode:"remote",
  validate:input=>call({kind:'validate',input}),
  report:async(input,asOfAt)=>{
   const result=await call({kind:'report',input,asOfAt});
   const normalized=(await call({kind:'validate',input})).input;
   if(['d','t','c','g','cityId'].some(k=>result.snapshot?.input?.[k]!==normalized[k]))throw Object.assign(new Error('报告与本次资料不一致，已停止展示。'),{code:'REPORT_SNAPSHOT_IDENTITY_MISMATCH'});
   return result.snapshot;
  },
  pair:async(inputs,asOfAt)=>(await call({kind:'pair',inputs,asOfAt})).report
 });
})();
