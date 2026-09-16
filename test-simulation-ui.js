/* Test-only controls. They never invoke the real WeChat bridge. */
(() => {
  'use strict';
  if(!window.ZX_TEST_SIMULATION)return;
  const boot=window.ZXTestBootstrap,base=boot.baseUrl;
  const el=(tag,text,className)=>{const node=document.createElement(tag);if(text)node.textContent=text;if(className)node.className=className;return node;};
  const sim=()=>window.ZXTestSim;
  const notice=text=>{const box=el('div',text,'sim-notice');box.setAttribute('role','status');document.body.append(box);setTimeout(()=>box.remove(),5500);};
  function dialog(title){const modal=el('dialog',null,'sim-dialog');modal.setAttribute('aria-label',title);modal.append(el('h2',title));const exit=el('button','关闭','sim-close');exit.onclick=()=>modal.close();modal.prepend(exit);modal.addEventListener('close',()=>modal.remove());document.body.append(modal);modal.showModal();return modal;}
  function button(modal,title,action,primary=false){const node=el('button',title,primary?'sim-primary':'');node.type='button';node.onclick=async()=>{node.disabled=true;try{await action();}catch(error){notice(error.message||'请刷新后重试');}finally{node.disabled=false;}};modal.append(node);return node;}
  async function seed(role){
    const fixtures=window.ZXTestFixtures,entry=(fixtures?.reports||[])[role==='B'?1:0];
    if(!entry)throw new Error('示例资料尚未加载，请刷新重试。');
    const input=entry.input||entry.snapshot?.input;
    const now=Date.now(),id=(role==='B'?'b':'a').repeat(32);
    const choices={version:'privacy-2026.09.09-report-v1',updatedAt:now,scopes:{birth_local:{grantedAt:now,noticeVersion:'birth-local-2026.09.11-library-v1'},device_account:{grantedAt:now},ai_deep:{grantedAt:now}}};
    localStorage.setItem('zx_privacy_choices_v1',JSON.stringify(choices));
    const store=JSON.parse(localStorage.getItem('zx_chart_library_v1')||'{"version":1,"entries":[],"paidLinks":[]}');
    const existing=store.entries.find(item=>JSON.stringify(item.input)===JSON.stringify(input));
    const paid=store.paidLinks.find(item=>item.id===id);
    if(!existing&&!paid&&store.entries.length<2)store.entries.push({id,input,name:entry.label||('测试用户 '+role),createdAt:now,updatedAt:now});
    localStorage.setItem('zx_chart_library_v1',JSON.stringify(store));
    if(existing||store.entries.some(item=>item.id===id))return {chart:existing?.id||id};
    if(paid)return {report:paid.reportId};
    return {};
  }
  async function enter(role,withSeed=true,target='app.html'){
    boot.setRole(role);await sim().login(role);
    const selection=withSeed?await seed(role):{};
    const url=new URL(target,base);for(const [key,value] of Object.entries(selection))url.searchParams.set(key,value);
    location.assign(url.href);
  }
  async function switchRole(role,target){boot.setRole(role);await sim().login(role);location.assign(new URL(target||'profile.html',base));}
  function menu(){
    const modal=dialog('测试工具');
    modal.append(el('p',(window.ZXTestRemoteReports||window.ZXTestLocalReports)?'付款为模拟，不会扣款。报告与合盘按已保存资料生成；问星仍为预置回答。':'所有操作均为模拟，不会扣款。记录只保存在当前浏览器；报告与问星使用固定示例内容。'));
    const row=el('div',null,'sim-row');modal.append(row);
    button(row,'身份 A · 赠送方',()=>switchRole('A'));
    button(row,'身份 B · 领取方',()=>switchRole('B'));
    const data=sim().getState(),role=data.role||boot.role();
    const gift=Object.values(data.gifts||{}).find(item=>item.sender!==role&&item.status==='funded');
    const invite=Object.values(data.invitations||{}).find(item=>item.sender!==role&&item.status==='active'&&(!item.target||item.target===role));
    if(gift)button(modal,'打开收到的礼物',()=>location.assign(new URL('synastry.html#gift='+gift.token,base)),true);
    if(invite)button(modal,'打开收到的合盘邀请',()=>location.assign(new URL('profile.html#invite='+invite.token,base)),true);
    button(modal,'回到测试入口',()=>location.assign(base));
    button(modal,'退出测试账号',async()=>{await sim().logout();location.assign(new URL('profile.html',base));});
    button(modal,'清空本次测试，重新开始',async()=>{const confirm=dialog('重新开始测试');confirm.append(el('p','会清除这个测试站在本机保存的图谱和模拟订单。'));button(confirm,'确认清空测试记录',()=>{boot.resetStorage();location.assign(base);},true);});
    modal.append(el('hr'),el('small','先用 A 创建邀请或赠送，再切换为 B。在这里可以直接打开收到的链接。不同设备的记录互不相通。'));
  }
  function payment(params,done){
    const matched=sim()?.orderForCheckout?.(params);
    const orderNo=new URLSearchParams(location.search).get('order')||matched?.order_no||matched||String(params.package||'').replace(/^prepay_id=(?:sim_|simulation_)?/,'');
    const modal=dialog('模拟微信支付');
    modal.append(el('p','这里只验证付款后的页面与交付流程，不会唤起微信支付，也不会实际扣款。'));
    let completed=false;
    modal.addEventListener('close',()=>{if(!completed)done({err_msg:'get_brand_wcpay_request:cancel'});});
    button(modal,'确认模拟支付 · ¥0 实扣',async()=>{await sim().confirmPayment(orderNo,{confirmed:true});completed=true;modal.close();done({err_msg:'get_brand_wcpay_request:ok'});},true);
    button(modal,'模拟取消支付',()=>modal.close());
  }
  const fakeBridge={invoke(name,params,done){if(name==='getBrandWCPayRequest')payment(params,done);else done?.({err_msg:name+':fail test unsupported'});}};
  try{Object.defineProperty(window,'WeixinJSBridge',{value:fakeBridge,writable:false,configurable:false});}catch(_){}
  const invokePayment=params=>new Promise((resolve,reject)=>{try{payment(params,result=>resolve({outcome:result.err_msg==='get_brand_wcpay_request:ok'?'submitted':'cancelled'}));}catch(error){reject(error);}});
  window.ZXTestUI=Object.freeze({enter,switchRole,seed,menu,notice,invokePayment});
  document.addEventListener('DOMContentLoaded',()=>{
    window.addEventListener('hashchange',()=>setTimeout(()=>{
      const invite=/^#invite=([a-f0-9]{64})$/.exec(location.hash)?.[1];
      const gift=/^#gift=([a-f0-9]{64})$/.exec(location.hash)?.[1];
      if(invite&&location.pathname.endsWith('/profile.html'))window.ZxProfileSocial?.showIncoming(invite);
      if(gift&&location.pathname.endsWith('/synastry.html')){history.replaceState(history.state,'',location.pathname+location.search+'#gift');window.ZxProfileGift?.showIncoming(gift);}
    },0));
    const bar=el('aside',null,'sim-bar');bar.setAttribute('aria-label','模拟测试状态');
    const label=el('strong','测试站 · 不实际扣款');const nav=el('nav');const role=el('span','身份 '+boot.role(),'sim-desktop');const toggle=el('button','测试工具');toggle.id='simTools';toggle.onclick=menu;nav.append(role,toggle);bar.append(label,nav);document.body.prepend(bar);
    const poster=document.getElementById('posterLayer');
    if(poster){
      const syncPoster=()=>{const open=!poster.hidden;nav.inert=open;if(open)nav.setAttribute('aria-hidden','true');else nav.removeAttribute('aria-hidden');};
      new MutationObserver(syncPoster).observe(poster,{attributes:true,attributeFilter:['hidden']});syncPoster();
    }
    for(const node of document.querySelectorAll('[data-sim-enter]'))node.onclick=()=>enter(node.dataset.simEnter);
    for(const node of document.querySelectorAll('[data-sim-start]'))node.onclick=()=>enter(node.dataset.simStart,false);
    for(const node of document.querySelectorAll('[data-sim-login]'))node.onclick=async()=>{
      const incoming=[];
      if(!sim().getState().role)for(const key of ['zx_private_gift_return_v1','zx_private_profile_return_v1']){
        try{const value=JSON.parse(sessionStorage.getItem(key)||'null'),age=Date.now()-value?.createdAt;
          if(age>=0&&age<1800000&&((key==='zx_private_gift_return_v1'&&value.mode==='incoming'&&!value.owner&&/^[a-f0-9]{64}$/.test(value.token||''))||(key==='zx_private_profile_return_v1'&&/^[a-f0-9]{64}$/.test(value.inviteToken||''))))incoming.push([key,value]);
        }catch(_){}
      }
      const role=node.dataset.simLogin;boot.setRole(role);await sim().login(role);
      for(const [key,value] of incoming)sessionStorage.setItem(key,JSON.stringify(value));
      // Explicit test-login action grants the fake account scope only.
      const choices=JSON.parse(localStorage.getItem('zx_privacy_choices_v1')||'{"version":"privacy-2026.09.09-report-v1","scopes":{}}');choices.scopes.device_account={grantedAt:Date.now()};localStorage.setItem('zx_privacy_choices_v1',JSON.stringify(choices));
      const raw=new URLSearchParams(location.search).get('return');let target=new URL('profile.html',base);try{const candidate=new URL(raw);if(candidate.origin===location.origin&&candidate.pathname.startsWith(new URL(base).pathname)&&/\/(?:app|profile|report|synastry|checkout|account)\.html$/.test(candidate.pathname))target=candidate;}catch(_){}
      target.searchParams.set('wechat_bind','success');location.replace(target.href);
    };
    if(location.pathname.endsWith('/report.html')){const info=el('div',(window.ZXTestRemoteReports||window.ZXTestLocalReports)?'模拟测试 · 报告按本次资料生成，问星仍为预置回答':'报告示例 · 仅支持对应的预置资料','sim-sample-note');info.style.cssText='max-width:960px;margin:70px auto 12px;padding:0 20px;color:#c9b477;font:13px/1.6 system-ui';bar.after(info);}
  });
})();
