/* Report-bound Ask purchases. No local balance or payment-success simulation. */
(function (root) {
  'use strict';
  const KEY = 'zx_profile_ask_purchase_v1';
  const PRODUCTS = Object.freeze({ask_single_v1:{title:'单次问星',amount:290,credits:1},ask_pack_3_v1:{title:'三次问星包',amount:600,credits:3}});
  let active = null, revision = 0;
  const node = (tag, text, className) => { const el=document.createElement(tag);if(text)el.textContent=text;if(className)el.className=className;return el; };
  const err = code => Object.assign(new Error(code), {code});
  const money = amount => '¥'+(amount/100).toFixed(2);
  const owner = () => {const s=root.zxMember?.snapshot()||{};return s.authenticated===true&&s.identityKind==='wechat'&&/^[a-f0-9]{64}$/.test(s.accountRef||'')?s.accountRef:'';};
  const close = () => {const old=active;active=null;revision++;if(old){old.dialog.close();old.dialog.remove();if(typeof old.onChanged==='function')old.onChanged();}};
  function clearSession() {try{sessionStorage.removeItem(KEY);}catch(_){}close();}
  function current(view) {if(active!==view||view.revision!==revision)throw err('VIEW_CLOSED');if(owner()!==view.owner)throw err('REPORT_ACCOUNT_CHANGED');}
  function readPending(account,reportId) {
    try {
      const stored=JSON.parse(sessionStorage.getItem(KEY)||'null');
      if(!stored||stored.owner!==account)return null;
      const item=stored.requests?.[reportId];if(!item)return null;
      if(item.owner!==account||item.reportId!==reportId)throw err('PURCHASE_STORAGE_INVALID');
      if(!Object.hasOwn(PRODUCTS,item.productCode)||!/^[a-f0-9]{32}$/.test(item.key))throw err('PURCHASE_STORAGE_INVALID');
      if(item.orderNo&&!/^[a-f0-9]{32}$/.test(item.orderNo))throw err('PURCHASE_STORAGE_INVALID');
      return item;
    } catch(e) {if(e.code)throw e;throw err('PURCHASE_STORAGE_INVALID');}
  }
  function storePending(item) {
    try{
      const stored=JSON.parse(sessionStorage.getItem(KEY)||'null');
      const data=stored?.owner===item.owner?stored:{owner:item.owner,requests:{}};
      if(!data.requests||typeof data.requests!=='object'||Array.isArray(data.requests))throw new Error();
      data.requests[item.reportId]=item;
      const json=JSON.stringify(data);sessionStorage.setItem(KEY,json);if(sessionStorage.getItem(KEY)!==json)throw new Error();
    }catch(_){throw err('PURCHASE_STORAGE_UNAVAILABLE');}
  }
  function removePending(account,reportId) {
    const stored=JSON.parse(sessionStorage.getItem(KEY)||'null');
    if(stored?.owner!==account)return;
    delete stored.requests[reportId];sessionStorage.setItem(KEY,JSON.stringify(stored));
  }
  function validReport(report,id) {
    const expiry=report&&(report.storage_expires_at||report.expires_at);
    return report&&report.report_id===id&&report.readable===true&&report.entitlement_status==='active'&&report.delivery_status==='ready'&&!report.unavailable_reason&&
      Number.isSafeInteger(expiry)&&expiry>Date.now();
  }
  function offer(catalog,code) {
    const expected=PRODUCTS[code],matches=Array.isArray(catalog?.products)?catalog.products.filter(p=>p.product_code===code):[];
    const value=matches.length===1?matches[0]:null;
    return catalog?.payment_available===true&&value?.payment_available===true&&value.purchase_eligible===true&&value.amount_fen===expected.amount&&value.currency==='CNY'&&value.question_credits===expected.credits?value:null;
  }
  function orderLink(orderNo,reportId,text) {const link=node('a',text,'btn');link.href=root.ZxPaidReports.checkoutUrl(orderNo,reportId);return link;}
  function ordersLink(reportId) {const link=node('a','查看我的订单','btn');const url=new URL(root.ZxPaidReports.loginUrl(reportId));url.hash='order-center';link.href=url.href;return link;}
  function notice(view,text) {view.content.replaceChildren(node('p',text,'profile-recharge-note'));}
  function displayError(view,e) {
    if(active!==view)return;
    if(e.code==='VIEW_CLOSED')return;
    if(e.code==='REPORT_ACCOUNT_CHANGED'||e.code==='WECHAT_AUTHENTICATION_REQUIRED'||e.status===401){clearSession();return;}
    notice(view, e.code==='ASK_REPORT_NOT_READY'?'请先完成这份深度报告的交付，再购买问星次数。':
      /STORAGE/.test(e.code||'')?'浏览器无法可靠保存这次购买请求，请先查看订单并检查浏览器存储设置。':
      '问星购买暂不可用，请稍后重试。已有订单可在我的订单查看。');
    if(root.ZxPaidReports&&view.reportId)view.content.append(ordersLink(view.reportId));
  }
  function render(view,catalog,pending) {
    const available=Object.keys(PRODUCTS).filter(code=>offer(catalog,code));
    if(!available.length){notice(view,'问星购买暂未开放。你的已有问星次数以报告内查询结果为准。');return;}
    view.content.replaceChildren(node('p','购买的次数可用于当前账号的有效深度报告；报告赠次仅用于对应报告。首问和追问各消耗 1 次，不自动续费。','profile-recharge-note'));
    if(pending)view.content.append(node('p','上次购买结果尚未确认。再次提交会继续同一请求；购买其他商品前，请先核对我的订单。','profile-recharge-note'),ordersLink(view.reportId));
    const form=node('form'),choices=node('fieldset',null,'profile-recharge-products');choices.append(node('legend','选择问星次数'));
    let selected='',busy=false;
    const radios=[];
    for(const code of available){
      const product=PRODUCTS[code],label=node('label',null,'profile-recharge-option'),radio=node('input');
      radio.type='radio';radio.name='profile-ask-product';radio.value=code;radio.disabled=!!pending&&pending.productCode!==code;
      const detail=node('span');detail.append(node('strong',product.title+' · '+money(product.amount)),node('small',product.credits+' 次问星'));
      label.append(radio,detail);choices.append(label);radios.push(radio);
      radio.addEventListener('change',()=>{selected=radio.value;policy.checked=false;adult.checked=false;error.textContent='';update();});
    }
    form.append(choices);
    const links=node('p',null,'profile-recharge-note'),config=root.ZX_PUBLIC_CONFIG||{};
    [['用户协议','userAgreementUrl'],['隐私政策','privacyUrl'],['报告服务规则','membershipRulesUrl'],['退款政策','refundUrl'],['AI服务说明','aiDisclosureUrl'],['购买须知','purchaseNoticeUrl']].forEach(([title,key],index)=>{
      const a=node('a',title);a.href=config[key];a.target='_blank';a.rel='noopener noreferrer';if(index)links.append(document.createTextNode(' · '));links.append(a);
    });
    form.append(links);
    const check=(text,id)=>{const label=node('label',null,'profile-recharge-consent'),input=node('input');input.type='checkbox';input.id=id;label.append(input,node('span',text));form.append(label);return input;};
    const policy=check('我已阅读并同意以上六项条款，确认购买所选问星次数。','profileAskPolicy');
    const adult=check('我已满18周岁。','profileAskAdult');
    const error=node('p',null,'profile-recharge-note');error.setAttribute('role','alert');form.append(error);
    const actions=node('div',null,'profile-recharge-actions'),submit=node('button','继续到支付','btn primary');submit.type='submit';submit.disabled=true;actions.append(submit);form.append(actions);
    const update=()=>{submit.disabled=busy||!selected||!policy.checked||!adult.checked;};
    policy.addEventListener('change',update);adult.addEventListener('change',update);
    form.addEventListener('submit',async event=>{
      event.preventDefault();if(busy||!selected||!policy.checked||!adult.checked)return;
      busy=true;update();radios.forEach(r=>{r.disabled=true;});
      try {
        current(view);
        let request=readPending(view.owner,view.reportId);
        if(request&&request.productCode!==selected)throw err('PENDING_ORDER_DIFFERS');
        if(!request){const bytes=new Uint8Array(16);root.crypto.getRandomValues(bytes);request={owner:view.owner,reportId:view.reportId,productCode:selected,key:Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('')};}
        storePending(request);
        const result=await root.zxMember.paidAskCreateOrder(view.reportId,selected,{policyConsent:true,adultConfirmed:true},request.key);
        current(view);
        const order=result?.order,product=PRODUCTS[selected];
        if(!order||!/^[a-f0-9]{32}$/.test(order.order_no||'')||order.paid_report_id!==view.reportId||order.product_code!==selected||order.amount_fen!==product.amount||order.currency!=='CNY')throw err('ORDER_RESPONSE_INVALID');
        request.orderNo=order.order_no;storePending(request);
        root.location.assign(root.ZxPaidReports.checkoutUrl(order.order_no,view.reportId));
      } catch(e) {
        if(active!==view)return;
        if(e.code==='REPORT_ACCOUNT_CHANGED'||e.code==='WECHAT_AUTHENTICATION_REQUIRED'||e.status===401){clearSession();return;}
        policy.checked=false;adult.checked=false;
        error.textContent=/STORAGE/.test(e.code||'')?'无法可靠保存购买请求，本次不会继续下单。请先查看我的订单。':'订单结果尚未确认。请先核对我的订单；再次确认会沿用同一请求。';
        if(!actions.querySelector('a'))actions.append(ordersLink(view.reportId));
        radios.forEach(r=>{r.disabled=r.value!==selected;});
      } finally {busy=false;if(active===view)update();}
    });
    view.content.append(form);
  }
  async function open(options={}) {
    close();
    const dialog=node('dialog',null,'profile-recharge-dialog'),heading=node('h2','购买问星次数');heading.id='profile-recharge-title';dialog.setAttribute('aria-labelledby',heading.id);
    const content=node('div'),closeButton=node('button','关闭','btn');closeButton.type='button';closeButton.addEventListener('click',close);
    const top=node('div',null,'profile-recharge-head');top.append(heading,closeButton);dialog.append(top,content);document.body.append(dialog);
    const view={dialog,content,revision,reportId:options.reportId,owner:'',onChanged:options.onChanged};active=view;
    dialog.addEventListener('cancel',e=>{e.preventDefault();close();});dialog.showModal();
    if(!root.zxMember?.paidReportPurchaseReady()||!root.ZxPaidReports){notice(view,'问星购买暂未开放。开放后，可在这里选择次数并使用微信支付。');return;}
    if(!/^[a-f0-9]{48}$/.test(view.reportId||'')){notice(view,'先解锁并完成一份深度报告，再为它购买问星次数。');return;}
    if(!(root.ZX_TEST_SIMULATION || /MicroMessenger/i.test(root.navigator.userAgent||''))){notice(view,'请在手机微信内打开知星，登录原账号后购买问星次数。');return;}
    if(!root.ZxPrivacyConsent?.has('device_account')){notice(view,'请先登录原微信账号，再查看可购买的问星次数。');content.append(ordersLink(view.reportId));return;}
    notice(view,'正在确认报告与问星商品……');
    try {
      await root.zxMember.start();if(active!==view)return;
      view.owner=owner();if(!view.owner){notice(view,'请先登录原微信账号，再查看可购买的问星次数。');content.append(ordersLink(view.reportId));return;}
      const report=await root.ZxPaidReports.status(view.reportId);current(view);
      if(!validReport(report,view.reportId))throw err('ASK_REPORT_NOT_READY');
      let pending=readPending(view.owner,view.reportId);
      if(pending?.orderNo){
        const result=await root.zxMember.paymentOrder(pending.orderNo);current(view);
        const order=result?.order||result;
        if(order.order_no!==pending.orderNo||order.paid_report_id!==view.reportId||order.product_code!==pending.productCode)throw err('ORDER_RESPONSE_INVALID');
        if(['completed','closed','refunded','expired','cancelled'].includes(order.status)){removePending(view.owner,view.reportId);pending=null;}
        else {notice(view,'你还有一笔问星订单待确认，请先核对该订单，避免重复购买。');content.append(orderLink(order.order_no,view.reportId,'查看这笔订单'));return;}
      }
      const catalog=await root.ZxPaidReports.products(view.reportId,'ask');current(view);render(view,catalog,pending);
    } catch(e){displayError(view,e);}
  }
  root.addEventListener('zx-private-session-cleared',clearSession);
  const checkOwner=()=>{if(active?.owner&&owner()!==active.owner)clearSession();};
  root.addEventListener('focus',checkOwner);document.addEventListener('visibilitychange',()=>{if(!document.hidden)checkOwner();});
  root.ZxProfileRecharge=Object.freeze({open,close});
})(window);
