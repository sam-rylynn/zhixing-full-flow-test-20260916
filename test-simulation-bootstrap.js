/* Included only by build-test-simulation.mjs in the independent test artifact. */
(() => {
  'use strict';
  const BUILD='zhixing-full-flow-20260916';
  const baseUrl=new URL('./',location.href).href;
  const prefix='zx_sim_20260916:'+new URL(baseUrl).pathname+':';
  const proto=Storage.prototype;
  const raw={get:proto.getItem,set:proto.setItem,remove:proto.removeItem,key:proto.key,length:Object.getOwnPropertyDescriptor(proto,'length').get};
  const roleKey=prefix+'current-role';
  const role=()=>raw.get.call(sessionStorage,roleKey)==='B'?'B':'A';
  const mapped=key=>prefix+(String(key).startsWith('zx_test_')?'shared:':role()+':')+String(key);
  const ownKeys=storage=>Array.from({length:raw.length.call(storage)},(_,i)=>raw.key.call(storage,i)).filter(key=>key?.startsWith(prefix));
  proto.getItem=function(key){return raw.get.call(this,mapped(key));};
  proto.setItem=function(key,value){raw.set.call(this,mapped(key),String(value));};
  proto.removeItem=function(key){raw.remove.call(this,mapped(key));};
  proto.clear=function(){for(const key of ownKeys(this).filter(key=>key.startsWith(prefix+role()+':')))raw.remove.call(this,key);};
  proto.key=function(index){const selected=ownKeys(this).filter(key=>key.startsWith(prefix+role()+':'));return selected[index]?.slice((prefix+role()+':').length)??null;};
  Object.defineProperty(proto,'length',{configurable:true,get(){return ownKeys(this).filter(key=>key.startsWith(prefix+role()+':')).length;}});
  const resetStorage=()=>{for(const storage of [localStorage,sessionStorage])for(const key of ownKeys(storage))raw.remove.call(storage,key);};
  window.ZX_TEST_SIMULATION=true;
  window.ZX_TEST_SIMULATION_BUILD=BUILD;
  window.ZX_TEST_SIMULATION_BUILD_ID='zhixing-online-simulation-20260916-v1';
  window.ZX_PRIVATE_REPORT_BUILD=true;
  window.ZXTestBootstrap=Object.freeze({build:BUILD,baseUrl,apiBase:baseUrl+'__test_api__',role,setRole(value){if(value==='A'||value==='B')raw.set.call(sessionStorage,roleKey,value);},resetStorage});
  // A test page may never send a request to an actual account, model or payment service.
  const originalFetch=window.fetch.bind(window);
  window.fetch=function(input,init){const url=new URL(typeof input==='string'||input instanceof URL?input:input.url,location.href);if(url.origin!==location.origin)return Promise.reject(new TypeError('测试站不连接外部业务服务'));return originalFetch(input,init);};
  const originalOpen=window.open.bind(window);
  window.open=function(url,target,features){const mappedUrl=mapUrl(url);return originalOpen(mappedUrl,target,features);};
  function mapUrl(value){
    if(!value)return value;
    let url;try{url=new URL(value,location.href);}catch(_){return value;}
    if(['zhixng.cn','www.zhixng.cn'].includes(url.hostname)){
      const file=url.pathname.split('/').pop()||'app.html';
      if(/^(?:index|app|profile|account|report|synastry|checkout|privacy|terms|refund-policy|membership-rules|purchase-notice|ai-disclosure|synastry-rules)\.html$/.test(file))return new URL((file==='index.html'?'app.html':file)+url.search+url.hash,baseUrl).href;
    }
    return url.href;
  }
  document.addEventListener('click',event=>{const link=event.target.closest?.('a[href]');if(link){const mapped=mapUrl(link.href);if(mapped!==link.href)link.href=mapped;}},true);
  window.ZXTestMapUrl=mapUrl;
})();
