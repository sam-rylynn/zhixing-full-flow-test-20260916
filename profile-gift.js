/* Gift reports: server-confirmed payments and recipient-owned report delivery. */
(() => {
  'use strict';
  const ID=/^[a-f0-9]{64}$/,REPORT=/^[a-f0-9]{48}$/,ORDER=/^[a-f0-9]{32}$/,CURSOR=/^[A-Za-z0-9_-]+\.[a-f0-9]{64}$/;
  const PENDING='zx_gift_pending_v1',CLAIM='zx_gift_claim_pending_v1',TTL=30*60*1000;
  const LABELS={created:'待付款',funded:'待领取',claimed:'报告准备中',delivery_failed:'报告待重试',delivered:'已交付',expired:'领取已过期',refund_requested:'退款处理中',refund_pending:'退款处理中',refunded:'已退款',cancelled:'订单已关闭'};
  const MESSAGES={GIFT_DISABLED:'赠送服务暂未开放。',GIFT_SERVICE_UNAVAILABLE:'赠送服务暂未开放。',REPORT_SERVICE_UNAVAILABLE:'账号服务暂未开放。',REPORT_SALES_NOT_APPROVED:'赠送购买暂未开放。',
    GIFT_UNAVAILABLE:'这份礼物已过期或当前不可领取。',GIFT_NOT_FOUND:'这份礼物当前不可查看。',GIFT_ALREADY_CLAIMED:'这份礼物已经领取。',GIFT_SELF_CLAIM:'请把礼物发给朋友，不能领取自己送出的报告。',
    GIFT_USE_EXISTING_REPORT:'这张图谱已有报告或订单，请重新确认需要领取的资料。',PARTICIPANT_INELIGIBLE:'领取人须已满 18 周岁。',
    REPORT_ACCOUNT_CHANGED:'账号已切换，请重新打开自己的记录。',AUTH_REQUIRED:'请重新登录后继续。',WECHAT_AUTHENTICATION_REQUIRED:'请先登录微信账号。',
    PRIVACY_CONSENT_REQUIRED:'请先同意启用账号功能。',WECHAT_BROWSER_REQUIRED:'请在微信中打开后继续。',DISPLAY_NAME_INVALID:'请填写对方看到的署名（1–20字，不含特殊控制字符）。',
    GIFT_REFUND_REQUIRES_REVIEW:'已领取的礼物请通过我的资料联系售后。',GIFT_REFUND_PENDING:'退款正在处理中。',PAYMENT_NOT_VERIFIED:'付款结果尚未确认，请刷新订单。',
    POLICY_UNAVAILABLE:'购买规则暂未载入，请刷新重试。',BIRTH_INPUT_INVALID:'请核对出生日期、时间和出生地点。',BIRTH_LOCATION_REQUIRED:'请从地点建议中确认完整的市州或区县。',
    PAYMENT_CONSENT_REQUIRED:'请确认成年及购买规则。',REPORT_TRANSFER_CONFIRMATION_REQUIRED:'请确认上传并保存本次出生资料。',CONSENT_REQUIRED:'请确认领取报告并同意合盘。',
    ORDER_RESPONSE_INVALID:'订单信息暂时无法确认，请刷新重试。',LOCAL_STORAGE_UNAVAILABLE:'无法保存本次操作，请开启浏览器存储后重试。'};
  let active=null,revision=0;
  const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=String(text??'');if(cls)n.className=cls;return n;};
  const error=code=>Object.assign(new Error(code),{code});
  const member=()=>window.zxMember;
  const state=()=>member()?.snapshot?.()||{};
  const owner=()=>{const s=state();return s.authenticated&&s.identityKind==='wechat'&&ID.test(s.accountRef||'')?s.accountRef:'';};
  const enabled=()=>member()?.giftReportServiceAvailable?.()===true;
  const policy=()=>{const p=window.SynastryPolicy;if(!p?.VERSION||typeof p.dateKey!=='function')throw error('POLICY_UNAVAILABLE');return p;};
  function stored(key){try{const v=JSON.parse(sessionStorage.getItem(key)||'null'),now=Date.now();if(!v||v.owner!==owner()||!Number.isSafeInteger(v.at)||v.at>now||now-v.at>=TTL){sessionStorage.removeItem(key);return null;}return v;}catch(_){return null;}}
  function save(key,value){try{sessionStorage.setItem(key,JSON.stringify({...value,owner:owner(),at:Date.now()}));}catch(_){throw error('LOCAL_STORAGE_UNAVAILABLE');}}
  function drop(key){try{sessionStorage.removeItem(key);}catch(_){}}
  function current(ctx,requireOwner=true){if(active!==ctx||ctx.rev!==revision||!ctx.dialog.open)throw error('VIEW_CLOSED');if(requireOwner&&(!ctx.owner||owner()!==ctx.owner))throw error('REPORT_ACCOUNT_CHANGED');}
  function close(){const old=active;active=null;revision++;if(old){old.token='';old.options={};old.records=null;old.body.replaceChildren();if(old.dialog.open)old.dialog.close();old.dialog.remove();old.focus?.focus?.();}}
  function notify(ctx,text){if(active===ctx)ctx.notice.textContent=text;}
  function handle(ctx,e){if(active!==ctx||e.code==='VIEW_CLOSED')return;if(['REPORT_ACCOUNT_CHANGED','AUTH_REQUIRED','WECHAT_AUTHENTICATION_REQUIRED'].includes(e.code)){ctx.token='';ctx.records=null;ctx.body.replaceChildren(el('p',MESSAGES[e.code]));drop(PENDING);drop(CLAIM);return;}notify(ctx,MESSAGES[e.code]||'结果暂未确认，请重试或刷新记录。');if(e.code==='GIFT_USE_EXISTING_REPORT')existingReport(ctx,e);}
  function button(text,fn,cls='gift-button'){const n=el('button',text,cls);n.type='button';if(fn)n.addEventListener('click',fn);return n;}
  function action(ctx,text,fn,cls){const n=button(text,undefined,cls);n.addEventListener('click',async()=>{if(n.disabled||ctx.busy)return;ctx.busy=true;n.disabled=true;try{current(ctx,false);await fn();}catch(e){handle(ctx,e);}finally{ctx.busy=false;if(n.isConnected)n.disabled=false;}});return n;}
  function start(ctx,title){current(ctx,false);ctx.title.textContent=title;ctx.body.replaceChildren();ctx.body.scrollTop=0;ctx.notice=el('p','','gift-note');ctx.notice.setAttribute('role','status');ctx.body.append(ctx.notice);}
  function check(text){const label=el('label',undefined,'gift-check'),input=el('input');input.type='checkbox';label.append(input,el('span',text));return {label,input};}
  function details(title,text){const n=el('details'),s=el('summary',title);n.append(s,el('p',text,'gift-note'));return n;}
  function profileLink(text='前往我的资料'){const n=el('a',text,'gift-button');n.href=window.ZxPaidReports?.profileUrl?.()||new URL('./profile.html',location.href).href;return n;}
  function rules(){const n=details('赠送说明','付款成功后 7 天内可领取；未领取将原路退款。报告从交付起保存 6 个月，并赠送 1 次问星。领取即同意与赠送人合盘，双方深度报告齐备后解锁共同阅读；个人报告仅归收礼人。');
    const links=el('p',undefined,'gift-policy-links');[['合盘与赠送说明','synastry-rules.html'],['购买须知','purchase-notice.html'],['隐私政策','privacy.html'],['退款规则','refund-policy.html'],['用户协议','terms.html'],['报告规则','membership-rules.html'],['AI 说明','ai-disclosure.html']].forEach(([text,path])=>{const a=el('a',text);a.href=new URL('./'+path,location.href).href;a.target='_blank';a.rel='noopener';links.append(a);});n.append(links);return n;}
  function make(mode,options={}){close();const dialog=el('dialog',undefined,'profile-gift-dialog'),heading=el('header'),title=el('h2','赠送深度报告'),exit=button('×',close,'gift-close');exit.setAttribute('aria-label','关闭赠送');title.id='profile-gift-title';dialog.setAttribute('aria-labelledby',title.id);heading.append(title,exit);const body=el('div');dialog.append(heading,body);document.body.append(dialog);
    const ctx={dialog,title,body,mode,options,rev:++revision,owner:owner(),busy:false,token:options.token||'',focus:document.activeElement};active=ctx;dialog.addEventListener('close',()=>{if(active===ctx)close();});dialog.showModal();start(ctx,'赠送深度报告');return ctx;}
  async function call(ctx,path,body,anonymous=false){current(ctx,!anonymous||!!ctx.owner);if(!enabled())throw error('GIFT_SERVICE_UNAVAILABLE');try{const result=await member().giftCall(path,body,anonymous?{anonymous:true}:undefined);current(ctx,!anonymous||!!ctx.owner);return result;}catch(e){current(ctx,!anonymous||!!ctx.owner);throw e;}}
  function login(ctx){start(ctx,'登录后继续');const c=check('我同意启用账号功能，用于登录和保存我的报告。'),needed=!window.ZxPrivacyConsent?.has?.('device_account');if(needed)ctx.body.append(c.label);
    ctx.body.append(action(ctx,'微信登录',async()=>{if(needed&&!c.input.checked)throw error('PRIVACY_CONSENT_REQUIRED');if(needed)window.ZxPrivacyConsent.grant('device_account');
      if(!window.ZxPaidReports?.startGiftLogin)throw error('GIFT_SERVICE_UNAVAILABLE');await window.ZxPaidReports.startGiftLogin({mode:ctx.mode,...ctx.options},()=>current(ctx,!!ctx.owner));}));}
  async function identity(ctx){if(!enabled())throw error('GIFT_SERVICE_UNAVAILABLE');if(!window.ZxPrivacyConsent?.has?.('device_account')){login(ctx);return false;}await member().start();current(ctx,!!ctx.owner);ctx.owner=owner();if(!ctx.owner){login(ctx);return false;}return true;}
  function randomKey(){const bytes=new Uint8Array(16);window.crypto.getRandomValues(bytes);return Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');}
  function readGift(value,id){if(!value||!ID.test(value.id||'')||id&&value.id!==id||!Object.hasOwn(LABELS,value.status))throw error('ORDER_RESPONSE_INVALID');return value;}
  function checkedOrder(value,id){const g=readGift(value?.gift,id),o=value?.order;if(!o||!ORDER.test(o.order_no||'')||g.orderId!==o.order_no||o.product_code!=='gift_report_v1'||o.amount_fen!==1990||o.currency!=='CNY'||o.paid_report_id!=null)throw error('ORDER_RESPONSE_INVALID');return {gift:g,order:o,checkout:value.checkout};}
  function giftUrl(token){const source=/\/(web|v1)\/[^/]*$/.test(location.pathname),url=new URL(source?'../web/synastry.html':'./synastry.html',location.href);url.search='';if(/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname)&&window.ZxPaidReports?.isPrivate?.())url.searchParams.set('private-report','1');url.hash='gift='+token;return url.href;}
  function existingReport(ctx,e){const id=e.data?.reportId,code=e.data?.senderCode;if(!REPORT.test(id||''))return;ctx.existingLink?.remove();
    if(/^ZX[A-F0-9]{16}$/.test(code||'')&&typeof window.ZxProfileSocial?.open==='function')ctx.existingLink=action(ctx,'使用已有报告发起合盘',()=>{current(ctx);close();return window.ZxProfileSocial.open({compose:true,channel:'internal',lookupCode:code,reportId:id});});
    else{const url=new URL(giftUrl(''));url.hash='home';url.searchParams.set('report',id);ctx.existingLink=el('a','使用已有报告进入合盘','gift-button');ctx.existingLink.href=url.href;}
    ctx.body.append(ctx.existingLink);
  }
  async function loadGift(ctx,id,refreshOrder=false){const result=refreshOrder?await call(ctx,'/synastry/gifts/'+id+'/order'):await call(ctx,'/synastry/gifts/'+id);const gift=refreshOrder?checkedOrder(result,id).gift:readGift(result,id);showGift(ctx,gift,refreshOrder?result:null);}
  function showGift(ctx,value,payment){const gift=readGift(value);ctx.giftId=gift.id;start(ctx,LABELS[gift.status]);
    const payer=ctx.mode==='purchase'||ORDER.test(gift.orderId||'');if(gift.status!=='created'){const pending=stored(PENDING);if(pending?.giftId===gift.id)drop(PENDING);}if(gift.status==='delivered')drop(CLAIM);
    const line={created:'赠送深度报告 · ¥19.90',funded:'礼物已备好，发给你想了解的人。',claimed:'领取已确认，正在准备报告。',delivery_failed:'领取已确认，报告暂未生成成功。',delivered:payer?'朋友的报告已交付。':'你的深度报告已准备好。',expired:'领取时间已过，未领取的付款将原路退回。',refund_requested:'退款申请已提交。',refund_pending:'正在原路退款。',refunded:'退款已完成。',cancelled:'这笔订单已关闭。'}[gift.status];ctx.body.append(el('p',line,'gift-lead'));
    if(payer&&gift.senderName)ctx.body.append(el('p','赠送署名：'+gift.senderName,'gift-note'));
    if(gift.status==='created'&&payer){
      const waiting=stored(PENDING);
      if(waiting?.giftId===gift.id&&waiting.submittedAt&&Date.now()-waiting.submittedAt<60000)notify(ctx,'正在确认付款，请稍后刷新订单。');
      else if(!payment?.order||payment.order.status==='created')ctx.body.append(action(ctx,'微信支付 ¥19.90',async()=>{
        const fresh=checkedOrder(await call(ctx,'/synastry/gifts/'+gift.id+'/order'),gift.id),o=fresh.order;
        if(o.order_no!==gift.orderId)throw error('ORDER_RESPONSE_INVALID');
        if(o.status!=='created'||fresh.gift.status!=='created'){showGift(ctx,fresh.gift,fresh);return;}
        const pending=stored(PENDING);if(pending?.giftId===gift.id&&pending.submittedAt&&Date.now()-pending.submittedAt<60000){notify(ctx,'正在确认付款，请稍后刷新订单。');return;}
        if(!member().paidReportPurchaseReady?.()||!Number.isSafeInteger(o.expires_at)||o.expires_at<=Date.now()||!window.ZxPaidAsk?.validateJsapiCheckout?.(fresh.checkout))throw error('ORDER_RESPONSE_INVALID');
        current(ctx);save(PENDING,{...(pending||{}),giftId:gift.id,submittedAt:Date.now()});
        const outcome=await window.ZxPaidAsk.invokeReportJsapi(fresh.checkout);current(ctx);
        if(outcome?.outcome==='cancelled'){save(PENDING,{...(stored(PENDING)||{}),giftId:gift.id,submittedAt:null});notify(ctx,'已取消支付，可刷新订单后继续。');}
        else notify(ctx,'正在确认付款，请刷新订单。');
        await loadGift(ctx,gift.id,true);
      },'gift-button primary'));
      if(payment?.order&&payment.order.status!=='created')notify(ctx,'正在核对付款，请刷新订单。');
    }
    if(payer&&gift.status==='funded'){
      if(Number.isSafeInteger(gift.expiresAt))ctx.body.append(el('p','请于 '+new Date(gift.expiresAt).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'})+' 前领取','gift-note'));
      const shareBox=el('div');
      const share=async native=>{const response=await call(ctx,'/synastry/gifts/'+gift.id+'/share',{});if(!ID.test(response?.token||''))throw error('ORDER_RESPONSE_INVALID');const url=giftUrl(response.token),text=String(response.senderName||'朋友')+'送你一份知星深度报告';
        if(native&&navigator.share){try{await navigator.share({title:'一封写给你的信',text,url});current(ctx);notify(ctx,'领取链接已分享。');return;}catch(e){current(ctx);if(e.name==='AbortError')return;}}
        if(navigator.clipboard?.writeText){try{await navigator.clipboard.writeText(text+' '+url);current(ctx);notify(ctx,'领取链接已复制。');return;}catch(_){current(ctx);}}
        const input=el('textarea');input.value=text+' '+url;input.readOnly=true;input.setAttribute('aria-label','领取链接');shareBox.replaceChildren(input);notify(ctx,'长按复制领取链接。');};
      ctx.body.append(action(ctx,'发送给朋友',()=>share(true),'gift-button primary'),action(ctx,'复制领取链接',()=>share(false)),shareBox);
    }
    if(!payer&&gift.status==='delivered'&&REPORT.test(gift.reportId||'')){const link=el('a','查看我的深度报告','gift-button primary');link.href=window.ZxPaidReports.reportUrl(gift.reportId);ctx.body.append(link);}
    if(!payer&&['claimed','delivery_failed'].includes(gift.status))ctx.body.append(action(ctx,gift.status==='claimed'?'查看生成结果':'重试生成',async()=>showGift(ctx,readGift(await call(ctx,'/synastry/gifts/'+gift.id+'/retry',{}),gift.id))));
    if(payer&&['funded','expired'].includes(gift.status))ctx.body.append(action(ctx,'申请退款',async()=>{const box=el('div',undefined,'gift-confirm');box.append(el('p','确认收回未领取的礼物并原路退款？'),action(ctx,'确认退款',async()=>showGift(ctx,readGift(await call(ctx,'/synastry/gifts/'+gift.id+'/refund',{confirmed:true}),gift.id))),button('保留礼物',()=>box.remove()));ctx.body.append(box);}));
    if(gift.supportRequired)ctx.body.append(profileLink('前往我的资料联系售后'));
    if(gift.pairStatus==='waiting_reports')ctx.body.append(el('p','双方深度报告齐备后即可看合盘。','gift-note'));
    ctx.body.append(action(ctx,'刷新状态',()=>loadGift(ctx,gift.id,payer)),rules());
    if(ctx.options.fromRecords)ctx.body.append(action(ctx,'返回赠送记录',openRecords));
  }
  function purchase(ctx){start(ctx,'送一份深度报告');ctx.body.append(el('p','一份写给 TA 的自我探索。','gift-lead'),el('p','¥19.90 · 深度报告 + 1 次问星','gift-price'));
    const prior=stored(PENDING),locked=prior&&prior.senderReportId===(ctx.options.senderReportId||null)&&ORDER.test(prior.key||'');
    const label=el('label','对方看到的署名','gift-field'),signature=el('input');signature.type='text';signature.maxLength=160;signature.setAttribute('aria-label','对方看到的署名');
    signature.value=locked?prior.senderName:ctx.options.senderName||'';signature.readOnly=!!locked;label.append(signature);ctx.body.append(label,el('p',locked?'正在恢复上次赠送，署名已固定，重试不会重复建单。':'只用于这次赠送，不会修改图谱昵称。','gift-note'));

    const adult=check('我已满 18 周岁'),agree=check('我已阅读并同意购买与合盘规则');ctx.body.append(adult.label,agree.label,rules());
    ctx.body.append(action(ctx,'确认赠送 ¥19.90',async()=>{if(!adult.input.checked||!agree.input.checked)throw error('PAYMENT_CONSENT_REQUIRED');if(!member().paidReportPurchaseReady?.())throw error('REPORT_SALES_NOT_APPROVED');
      const senderName=signature.value.normalize('NFC').trim();
      if(!senderName||(typeof Intl.Segmenter==='function'?[...new Intl.Segmenter('zh',{granularity:'grapheme'}).segment(senderName)].length:Array.from(senderName).length)>20||/[<>{}\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u.test(senderName)){signature.focus();throw error('DISPLAY_NAME_INVALID');}
      const versions=member().giftPaymentVersions(),p=policy(),senderReportId=ctx.options.senderReportId||null;
      ctx.options.senderName=senderName;signature.readOnly=true;
      let pending=stored(PENDING);if(!pending||pending.senderReportId!==senderReportId||pending.senderName!==senderName||!ORDER.test(pending.key||''))pending={key:randomKey(),senderReportId,senderName};
      save(PENDING,pending);const response=await call(ctx,'/synastry/gifts/orders',{senderReportId,senderName,idempotencyKey:pending.key,consent:true,adultConfirmed:true,...versions,synastryConsent:{confirmed:true,version:p.VERSION}});
      const result=checkedOrder(response);save(PENDING,{...pending,giftId:result.gift.id});showGift(ctx,result.gift,response);
    },'gift-button primary'));
  }
  function birth(ctx,preview){start(ctx,'领取你的深度报告');ctx.body.append(el('p','请确认你自己的出生资料。','gift-lead'));
    const form=el('form');form.addEventListener('submit',e=>e.preventDefault());const field=(text,type)=>{const label=el('label',text,'gift-field'),input=el('input');input.type=type;input.setAttribute('aria-label',text);label.append(input);form.append(label);return input;};
    const d=field('出生日期','date'),t=field('出生时间（不知道可留空）','time'),c=field('出生地点','text'),label=el('label','性别','gift-field'),g=el('select');g.setAttribute('aria-label','性别');[['','请选择'],['男','男'],['女','女'],['其他','其他']].forEach(([value,text])=>{const option=el('option',text);option.value=value;g.append(option);});label.append(g);form.append(label);c.setAttribute('data-birth-location','');
    const transfer=check('我确认这是本人的资料，同意传至独立测试服务生成报告，处理后服务端不保存；测试记录仅保存在当前浏览器。'),claim=check('领取报告并同意合盘');form.append(transfer.label,claim.label,rules());
    const inputs=[d,t,c,g,transfer.input,claim.input];let prepared=null,claimStarted=false;
    const submit=action(ctx,'领取报告并同意合盘',async()=>{
      if(!transfer.input.checked)throw error('REPORT_TRANSFER_CONFIRMATION_REQUIRED');if(!claim.input.checked)throw error('CONSENT_REQUIRED');
      const p=policy(),input={d:d.value,t:t.value,c:c.value.trim(),g:g.value};
      if(!prepared){
        if(!/^\d{4}-\d{2}-\d{2}$/.test(input.d)||input.t&&!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(input.t)||!['男','女','其他'].includes(input.g))throw error('BIRTH_INPUT_INVALID');
        const [y,m,day]=input.d.split('-').map(Number),date=new Date(Date.UTC(y,m-1,day)),today=p.dateKey(Date.now());
        if(y<1900||date.getUTCFullYear()!==y||date.getUTCMonth()!==m-1||date.getUTCDate()!==day)throw error('BIRTH_INPUT_INVALID');
        if(input.d>String(Number(today.slice(0,4))-18)+today.slice(4))throw error('PARTICIPANT_INELIGIBLE');
        const engine=window.BaziEngine;if(!engine?.computeChart||!window.ZxBirthLocationPicker?.attach)throw error('BIRTH_INPUT_INVALID');
        if(!engine.resolveCity?.(input.c)?.complete)throw error('BIRTH_LOCATION_REQUIRED');
        const [hh,mm]=input.t?input.t.split(':').map(Number):[];engine.computeChart({y,m,d:day,hh,mm,city:input.c,gender:input.g});
        const response=await call(ctx,'/synastry/gift-claims/prepare',{token:ctx.token,input,transfer_confirmed:true,storage_confirmed:true,subject_is_self:true});
        if(!REPORT.test(response?.report_id||''))throw error('ORDER_RESPONSE_INVALID');prepared=response.report_id;
      }
      save(CLAIM,{giftId:preview.id,reportId:prepared});inputs.forEach(n=>n.disabled=true);claimStarted=true;
      let gift;try{gift=readGift(await call(ctx,'/synastry/gift-claims',{token:ctx.token,reportId:prepared,consent:{confirmed:true,version:p.VERSION}}),preview.id);}
      catch(e){if(['GIFT_USE_EXISTING_REPORT','PARTICIPANT_INELIGIBLE'].includes(e.code)){prepared=null;claimStarted=false;inputs.forEach(n=>n.disabled=false);drop(CLAIM);}throw e;}
      if(gift.reportId!==prepared)throw error('ORDER_RESPONSE_INVALID');ctx.token='';showGift(ctx,gift);
    },'gift-button primary');form.append(submit);ctx.body.append(form);window.ZxBirthLocationPicker?.attach?.(c);
    inputs.forEach(n=>['input','change'].forEach(event=>n.addEventListener(event,()=>{if(!claimStarted)prepared=null;})));
    const old=stored(CLAIM);if(old?.giftId===preview.id&&REPORT.test(old.reportId||'')){
      ctx.body.append(action(ctx,'恢复上次领取',async()=>{if(!claim.input.checked)throw error('CONSENT_REQUIRED');if(!transfer.input.checked)throw error('REPORT_TRANSFER_CONFIRMATION_REQUIRED');const gift=readGift(await call(ctx,'/synastry/gift-claims',{token:ctx.token,reportId:old.reportId,consent:{confirmed:true,version:p.VERSION}}),preview.id);if(gift.reportId!==old.reportId)throw error('ORDER_RESPONSE_INVALID');ctx.token='';showGift(ctx,gift);}));
    }
  }
  async function incoming(ctx){start(ctx,'一封写给你的信');if(!enabled())throw error('GIFT_SERVICE_UNAVAILABLE');const preview=readGift(await call(ctx,'/synastry/gifts/inspect',{token:ctx.token},true));ctx.giftId=preview.id;
    ctx.body.append(el('p',String(preview.senderName||'朋友')+'送你一份深度报告。','gift-lead'),rules());
    if(preview.status!=='funded'){ctx.body.append(el('p',LABELS[preview.status],'gift-note'));ctx.body.append(action(ctx,'查看领取记录',async()=>{if(await identity(ctx))await loadGift(ctx,preview.id);}));return;}
    ctx.body.append(action(ctx,'领取礼物',async()=>{if(!await identity(ctx))return;const checked=readGift(await call(ctx,'/synastry/gifts/inspect',{token:ctx.token}));if(checked.self)throw error('GIFT_SELF_CLAIM');if(checked.status!=='funded'){await loadGift(ctx,checked.id);return;}birth(ctx,checked);} ,'gift-button primary'));
  }
  async function open(options={}){const ctx=make('purchase',{senderReportId:options.senderReportId||null,senderName:options.senderName||''});try{if(ctx.options.senderReportId&&!REPORT.test(ctx.options.senderReportId))throw error('ORDER_RESPONSE_INVALID');if(!await identity(ctx))return;
      const pending=stored(PENDING);if(pending?.giftId&&ID.test(pending.giftId)&&pending.senderReportId===ctx.options.senderReportId){await loadGift(ctx,pending.giftId,true);return;}purchase(ctx);
    }catch(e){handle(ctx,e);}}
  async function showIncoming(token){const ctx=make('incoming',{token});try{if(!ID.test(token||''))throw error('GIFT_NOT_FOUND');await incoming(ctx);}catch(e){handle(ctx,e);}}
  async function openGift(id,options={}){const ctx=make('gift',{giftId:id,fromRecords:options.fromRecords===true});try{if(!ID.test(id||''))throw error('GIFT_NOT_FOUND');if(!await identity(ctx))return;await loadGift(ctx,id);}catch(e){handle(ctx,e);}}
  function renderRecords(ctx){start(ctx,'赠送记录');const records=ctx.records;
    if(!records.items.length&&!records.hasMore)ctx.body.append(el('p','暂无赠送记录','gift-note'));
    const list=el('div',undefined,'gift-records');for(const gift of records.items){const row=el('article',undefined,'gift-record'),copy=el('div'),sent=ORDER.test(gift.orderId||'');
      copy.append(el('p',sent?'我送出的报告':String(gift.senderName||'朋友')+'送来的报告','gift-record-title'),el('p',LABELS[gift.status],'gift-note'));row.append(copy,action(ctx,'查看',()=>openGift(gift.id,{fromRecords:true})));list.append(row);}
    ctx.body.append(list,action(ctx,'刷新',()=>loadRecords(ctx,true)));if(records.hasMore)ctx.body.append(action(ctx,'加载更多',()=>loadRecords(ctx,false)));
  }
  async function loadRecords(ctx,refresh){const before=ctx.records,cursor=refresh?null:before.cursor;
    const result=await call(ctx,'/synastry/gifts?limit=20'+(cursor?'&cursor='+encodeURIComponent(cursor):''));
    if(!result||!Array.isArray(result.items)||result.items.length>20||typeof result.hasMore!=='boolean'||result.hasMore&&(!CURSOR.test(result.nextCursor||'')||result.nextCursor.length>512||result.nextCursor===cursor||!refresh&&before.seen.has(result.nextCursor))||!result.hasMore&&result.nextCursor!=null)throw error('ORDER_RESPONSE_INVALID');
    const incoming=result.items.map(value=>readGift(value)),items=refresh?[]:before.items.slice(),ids=new Set(items.map(value=>value.id));for(const gift of incoming){if(ids.has(gift.id))continue;ids.add(gift.id);items.push(gift);}
    const seen=refresh?new Set():new Set(before.seen);if(result.nextCursor)seen.add(result.nextCursor);ctx.records={items,hasMore:result.hasMore,cursor:result.nextCursor||null,seen};renderRecords(ctx);
  }
  async function openRecords(){const ctx=make('records');try{if(!await identity(ctx))return;ctx.records={items:[],hasMore:false,cursor:null,seen:new Set()};renderRecords(ctx);ctx.busy=true;await loadRecords(ctx,true);}catch(e){handle(ctx,e);}finally{ctx.busy=false;}}
  async function openOrder(orderNo){const ctx=make('gift');try{if(!ORDER.test(orderNo||''))throw error('ORDER_RESPONSE_INVALID');const bytes=await window.crypto.subtle.digest('SHA-256',new TextEncoder().encode('gift-order:'+orderNo));current(ctx,!!ctx.owner);await openGift(Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join(''));}catch(e){handle(ctx,e);}}
  async function resume(){if(!window.ZxPaidReports?.hasGiftReturn?.())return;try{if(!enabled())return;await member().start();const context=window.ZxPaidReports.consumeGiftReturn();if(!context)return;if(context.mode==='incoming')await showIncoming(context.token);else if(context.mode==='gift')await openGift(context.giftId);else if(context.mode==='records')await openRecords();else await open(context);}catch(_){}}
  function init(){const entry=document.getElementById?.('gift-records-action');if(entry){entry.hidden=!enabled();entry.addEventListener('click',()=>openRecords());}resume();}
  ['zx-private-session-cleared','zx-account-consent-revoked','zx-local-data-cleared'].forEach(event=>window.addEventListener(event,()=>{drop(PENDING);drop(CLAIM);close();}));
  window.addEventListener('focus',()=>{if(active?.owner&&active.owner!==owner()){drop(PENDING);drop(CLAIM);close();}});
  window.ZxProfileGift=Object.freeze({open,showIncoming,openGift,openOrder,openRecords,close,resume});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
