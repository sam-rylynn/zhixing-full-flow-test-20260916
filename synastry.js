/* Approved synastry experience using the current chart and server-owned invitation state. */
(function(root){
  'use strict';
  const LOCAL=/^[a-f0-9]{32}$/,REPORT=/^[a-f0-9]{48}$/,OWNER=/^[a-f0-9]{64}$/,TOKEN=/^[a-f0-9]{64}$/;
  const PAGES=['home','rank','invite','invite-external','invite-internal','gift','connections'];
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const signedIn=state=>!!(state?.authenticated===true&&state.identityKind==='wechat'&&OWNER.test(state.accountRef||''));
  function selection(search,selected){
    const p=new URLSearchParams(search),hasChart=p.has('chart'),hasReport=p.has('report');
    if(p.getAll('chart').length>1||p.getAll('report').length>1)return {error:'图谱入口重复，请从日主页重新进入合盘。'};
    if(hasChart&&hasReport)return {error:'图谱入口包含两张不同的资料，请从日主页重新进入合盘。'};
    if(hasChart)return LOCAL.test(p.get('chart')||'')?{kind:'local',id:p.get('chart')}:{error:'图谱入口无效，请从日主页重新进入合盘。'};
    if(hasReport)return REPORT.test(p.get('report')||'')?{kind:'report',id:p.get('report')}:{error:'报告入口无效，请从日主页重新进入合盘。'};
    return selected&&((selected.kind==='local'&&LOCAL.test(selected.id||''))||(selected.kind==='report'&&REPORT.test(selected.id||'')&&OWNER.test(selected.accountRef||'')))?{...selected}:null;
  }
  function safeInput(value,ageAllowed){
    if(!value||typeof value.d!=='string'||!ageAllowed(value.d)||typeof value.c!=='string'||!value.c.trim()||value.c.length>160||/[<>\u0000-\u001f]/.test(value.c)||!['','男','女','其他',null].includes(value.g)||(value.t!==null&&typeof value.t!=='string')||(value.t&&!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value.t)))return null;
    return {d:value.d,t:value.t||'',c:value.c,g:value.g||''};
  }
  function reportInput(result,id,ageAllowed,now=Date.now()){
    return result&&REPORT.test(id||'')&&result.report_id===id&&result.readable===true&&result.entitlement_status==='active'&&result.delivery_status==='ready'&&!result.unavailable_reason&&result.refund_status!=='pending'&&Number.isSafeInteger(result.expires_at)&&result.expires_at>now?safeInput(result.snapshot?.input,ageAllowed):null;
  }
  function routeUrl(href,page,pick,hash=''){
    const current=new URL(href),source=/\/web\/synastry\.html$/.test(current.pathname);
    const url=new URL(page==='home'?(source?'./index.html':'./app.html'):'./profile.html',current);
    // This surface always uses the product flow. The marker is removed from production by the SDK.
    if(/^(localhost|127\.0\.0\.1|\[::1\])$/.test(current.hostname)||current.protocol==='file:')url.searchParams.set('private-report','1');
    if(/^(localhost|127\.0\.0\.1|\[::1\])$/.test(current.hostname))for(const key of ['api','deep'])try{const endpoint=new URL(current.searchParams.get(key));if(/^https?:$/.test(endpoint.protocol)&&/^(localhost|127\.0\.0\.1|\[::1\])$/.test(endpoint.hostname)&&!endpoint.username&&!endpoint.password&&!endpoint.search&&!endpoint.hash)url.searchParams.set(key,endpoint.href.replace(/\/$/,''));}catch(_){}
    if(pick?.kind==='local'&&LOCAL.test(pick.id||''))url.searchParams.set('chart',pick.id);
    else if(pick?.kind==='report'&&REPORT.test(pick.id||''))url.searchParams.set('report',pick.id);
    if(hash)url.hash=hash;
    return url.href;
  }
  const helpers={selection,safeInput,reportInput,routeUrl,signedIn,PAGES};
  if(typeof module==='object')module.exports=helpers;
  if(typeof document==='undefined')return;
  const $=id=>document.getElementById(id),app=$('app'),member=()=>root.zxMember,vault=()=>root.ZxChartVault,snapshot=()=>member()?.snapshot?.()||{};
  let active=null,chart=null,displayName='',failure='',busy=true,epoch=0,openedRank='',readyReport=false,owner='',reportExpires=0,privateReturn=null,confirmedInvitation=null;
  let incomingGift=/^#gift=([a-f0-9]{64})$/.exec(location.hash)?.[1]||'';
  if(incomingGift){const url=new URL(location.href);url.hash='gift';history.replaceState(history.state,'',url.href);}
  const route=()=>PAGES.includes(location.hash.slice(1))?location.hash.slice(1):location.hash==='#result'?'connections':'home';
  const back=(page,text)=>`<a class="back-link" href="#${page}"><span aria-hidden="true">←</span>${text}</a>`;
  const asset=name=>'./media/synastry/'+name;
  function profileUrl(){return routeUrl(location.href,'profile',active);}
  function homeUrl(){return routeUrl(location.href,'home',active,'result');}
  function accountUrl(){
    const options={returnTo:'synastry',...(active?.kind==='local'?{chart:active.id}:{}),page:route()};
    if(root.ZxPaidReports?.loginUrl)return root.ZxPaidReports.loginUrl(active?.kind==='report'?active.id:undefined,options);
    const url=new URL(profileUrl());url.searchParams.set('return','synastry');url.searchParams.set('synastry-page',route());url.hash='account-status';return url.href;
  }
  function serviceMessage(){
    if(!member()?.paidReportServiceAvailable?.()||!member()?.synastryCall)return '账号与合盘服务暂未开放。你可以查看合拍类型；真实邀请和共同解读将在服务开放后使用。';
    if(!signedIn(snapshot()))return '登录自己的微信账号后，即可查看邀请与共同解读。';
    return '报告还没备齐也可以先邀请。双方选定自己的有效报告并分别同意后，共同解读免费解锁。';
  }
  function serviceNotice(){return `<p class="synastry-state" role="status">${esc(serviceMessage())}<a class="text-link" href="${esc(accountUrl())}">前往我的资料登录 / 恢复 <span aria-hidden="true">→</span></a></p>`;}
  function identity(){return `<section class="star-account" aria-label="当前图谱昵称"><div class="star-account-person"><span class="star-account-mark" aria-hidden="true">星</span><div><strong class="synastry-account-name">${esc(displayName||'未设置昵称')}</strong><p>当前图谱</p></div></div><div class="star-account-actions"><a class="star-account-help" href="${esc(profileUrl())}">我的资料 <span aria-hidden="true">›</span></a></div></section>`;}
  function empty(){return `<section class="channel-access"><p class="entry-eyebrow">知星 · 合盘</p><h1>${busy?'正在读取<br>当前图谱':'先回到自己的图谱'}</h1><p class="channel-lead">${esc(busy?'稍等一下，正在确认这张图谱。':failure||'从日主页进入，看看谁与你更合拍。')}</p>${busy?'':`<div class="synastry-status-actions"><a class="primary" href="${esc(profileUrl())}">前往我的资料</a><a class="secondary" href="${esc(homeUrl())}">返回日主页</a></div>`}</section>`;}
  function home() {
    const me={type:chart.dayMaster.stem+chart.dayMaster.element+' × 太阳'+chart.astro.sun.sign};
    return `${identity()}<section class="entry-identity" aria-label="你的个人报告"><div><span class="entry-identity-label">你的盘面</span><strong>${esc(me.type)}</strong></div><span class="delivered ${readyReport?'':'waiting'}">深度报告 · ${readyReport?'已交付 ✓':'待解锁'}</span><p>从自己的盘面出发，看看相处中的可能。</p></section>
    <section class="entry-value" aria-labelledby="entry-value-title">
      <div class="entry-value-heading"><p class="entry-eyebrow">从读懂自己，到读懂彼此</p><h1 id="entry-value-title">谁与你<br>更合拍</h1></div>
      <figure class="entry-pair-visual"><img src="./media/synastry/pair-orbit.webp" width="1536" height="1024" alt="两枚星体，在同一片夜空中沿金色轨道靠近" fetchpriority="high"><figcaption>一个人的解读，也可以成为两个人的对话。</figcaption></figure>
      <div class="entry-value-body"><p class="entry-value-lead">有些人，一开口就懂你。<br>有些人，越在意却越容易较劲。<br>看看你容易与哪种人靠近。</p><div class="entry-actions"><a class="primary" href="#rank">查看五种合拍类型 <span aria-hidden="true">→</span></a><a class="secondary" href="#invite">邀请一个人 <span aria-hidden="true">↗</span></a></div><p class="entry-value-note">也可以邀请一个人，一起读懂你们的关系。</p></div>
    </section>
    <div class="entry-lower"><section class="entry-collection" aria-labelledby="entry-collection-title"><div class="section-line"><h2 id="entry-collection-title">我的合盘</h2><a class="text-link" href="#connections">查看全部 <span aria-hidden="true">→</span></a></div><div class="empty-connection"><span class="entry-record-label">共同解读与邀请</span><p>把一个人的解读，变成两个人的对话。</p><a class="text-link" href="#connections">查看我的合盘 <span aria-hidden="true">→</span></a></div></section><aside class="entry-personal" aria-label="个人报告中的现有内容"><p class="entry-eyebrow">回到你自己</p><section class="existing-item"><div class="existing-title"><h3>问星</h3><span>你的问题</span></div><p>把你的问题，放回自己的盘面里看。</p></section><section class="existing-item"><div class="existing-title"><h3>今日卡</h3><span>今天的自己</span></div><p>留一点时间，看看今天的自己。</p></section></aside></div>`;
  }
  function rank() {
    const ranking=root.SynastryEngine.rank(chart);
    return `<section class="rank-intro">
      <p class="rank-context">${esc(displayName||'你的图谱')} · ${esc(chart.dayMaster.stem+chart.dayMaster.element)} × 太阳${esc(chart.astro.sun.sign.replace('座',''))}</p>
      <h1>谁更容易懂你</h1>
      <p class="rank-subtitle">五种类型，五种相处的可能</p>
      <p class="rank-disclosure">从日主与太阳星座，看看相处的可能。</p>
      <button class="rank-about" id="rank-about" aria-haspopup="dialog">怎么看这五种推荐 <span aria-hidden="true">›</span></button>
    </section>
    <ul class="type-list type-list--codenames" aria-label="五种合拍类型推荐">${ranking.rows.map(r=>`<li class="type-row">
      <button class="type-toggle" data-rank="${esc(r.id)}" aria-expanded="${openedRank === r.id}" aria-controls="detail-${esc(r.id)}">
        <span class="stem-seal ${r.stem.endsWith('木') ? 'wood' : r.stem.endsWith('火') ? 'fire' : r.stem.endsWith('水') ? 'water' : ''}" aria-hidden="true">${esc(r.stem[0])}</span>
        <span class="type-copy"><span class="type-name">${esc(r.stem)}<small>· 太阳${esc(r.sun)}</small></span><span class="type-headline">${esc(r.opening?.status==='ready'?r.opening.name+' · '+r.opening.title:'资料待补充')}</span></span>
        <span class="type-affordance" aria-hidden="true"><span class="type-action">${openedRank===r.id?'收起':'查看'}</span><span class="type-arrow">›</span></span>
      </button>
      <div class="type-detail" id="detail-${esc(r.id)}" data-rank-opening="${esc(r.id)}" ${openedRank === r.id ? '' : 'hidden'}></div>
    </li>`).join('')}</ul>
    <details class="rank-basis fine"><summary>类型推荐与解读依据</summary><p>这五种推荐用于探索盘面类型，展示顺序不代表关系的高低。想到一个人时，可以邀请 TA，查看你们的完整合盘。</p><p>以日主关系为主轴、太阳星座为辅证；具体到两个人时，再结合双方的完整资料。</p><p>${esc(ranking.rules)}</p><p>${esc(ranking.tieBreak)}</p></details>
    <section class="rank-dock" aria-label="邀请一个熟悉的人"><div class="rank-dock-inner"><p>想到某个人了吗？<span>TA 不在其中，也值得了解。</span></p><a class="primary full" href="#invite" aria-label="邀请 TA 查看合盘">邀请 TA，看看真实的你们 <span aria-hidden="true">→</span></a></div></section>`;
  }
  function mountRankOpenings(){
    if(!chart||route()!=='rank')return;
    const ranking=root.SynastryEngine.rank(chart);
    for(const row of ranking.rows){
      const container=document.getElementById('detail-'+row.id);
      if(!container)continue;
      const opening=root.ZxSynastryOpening?.create(row.opening,{compact:true});
      if(opening)container.append(opening);
      else {const note=document.createElement('p');note.textContent='这组类型的解读暂时无法打开，请刷新后重试。';container.append(note);}
    }
  }
  const invite=()=>`<section class="invite-channel-page" aria-labelledby="invite-channel-title"><header class="channel-heading"><p class="entry-eyebrow">知星 · 合盘邀请</p><h1 id="invite-channel-title">把这封邀请<br>送到 TA 身边</h1><p>选一种方便你们的方式</p></header><div class="invite-channel-grid"><a class="channel-choice channel-external" href="#invite-external"><span class="channel-mark" aria-hidden="true">↗</span><span class="channel-kicker">站外 · 微信好友</span><h2>微信邀请</h2><p>把邀请链接发给 TA<br>还没用过知星，也能收到</p><span class="channel-choice-action">制作邀请链接 <span aria-hidden="true">→</span></span></a><a class="channel-choice channel-internal" href="#invite-internal"><span class="channel-mark" aria-hidden="true">星</span><span class="channel-kicker">站内 · 已有知星账号</span><h2>站内邀请</h2><p>用知星号找到 TA<br>邀请直接出现在站内消息里</p><span class="channel-choice-action">按知星号邀请 <span aria-hidden="true">→</span></span></a></div><p class="channel-shared-rule">已有知星账号，也可以通过微信链接接受邀请。<br>双方报告交付并同意后，合盘免费解锁。</p></section>`;
  const title=kind=>kind==='gift'?['这份了解','我想送给你']:['如果相遇有伏笔','我想和你一起读'];
  const logoAsset=()=>asset('logo-guanxiang-gold.svg');
  const lockup=()=>`<span class="celestial-lockup"><img src="${logoAsset()}" alt=""><span>知星<small>以易理观己，以星盘为证</small></span></span>`;
  function card({kind='invite',senderName=displayName||'你的朋友'}={}){return `<figure class="celestial-card celestial-b${Array.from(senderName).length>14?' long-signature':''}" aria-label="${kind==='gift'?'礼物':'邀请'}卡片"><img class="celestial-background" src="${asset('celestial-b.png')}" width="1024" height="1536" alt="日月沿细金轨道相连"><figcaption><div class="celestial-card-content">${lockup()}<div class="celestial-card-copy"><p class="celestial-kicker">${kind==='gift'?'一份送给你的个人解读':'一封写给你的合盘邀请'}</p><h2>${title(kind).join('<br>')}</h2><p class="celestial-subtitle">${kind==='gift'?'读懂自己，从这一份了解开始':'读懂自己，也读懂彼此'}</p><p class="celestial-signature"><span>来自</span> ${esc(senderName)}</p></div></div><small class="celestial-card-footer">知星 · 个人发展与文化研究</small></figcaption></figure>`;}
  const externalInvite=()=>`<section class="invite-send-page"><a class="back-link" href="#invite">← 两种邀请方式</a><header class="send-heading"><p class="entry-eyebrow">微信邀请</p><h1>把这份邀请<br>发给微信好友</h1><p>还没用过知星，也可以收到</p></header><div class="send-content"><div>${card()}</div><section class="send-actions" aria-label="发送邀请的方法"><h2>复制链接，发给 TA</h2><p>粘贴到微信聊天窗口，由你选择好友发送。</p><button class="primary full" id="copy-invite-link">复制邀请链接 <span aria-hidden="true">↗</span></button><button class="secondary full" id="open-invite-poster">复制邀请卡片 <span aria-hidden="true">→</span></button><a class="secondary full invite-gift-action" href="#gift">送 TA 一份深度报告 · ¥19.90 <span aria-hidden="true">→</span></a><p class="send-local-note">请先确认邀请用途并生成真实链接，再由你选择好友发送。复制卡片不代表邀请已发送。</p><p class="send-copy-feedback" id="invite-copy-feedback" role="status"></p></section></div><div class="send-next"><p>已有报告直接用<br>双方报告交付并同意后，合盘免费解锁</p></div>${serviceNotice()}</section>`;
  function gift(){
    return `${back('invite','邀请 TA')}<div class="gift-redesign gift-shop">
      <p class="gift-perspective">${esc(displayName||'你')} · 赠送报告</p>
      <div class="gift-shop-grid">
        <section class="gift-letter-side" aria-labelledby="gift-letter-title">
          <p class="gift-eyebrow">送给你想更懂的人</p>
          <h1 id="gift-letter-title">这份了解，<br>我想送给你。</h1>
          <p class="gift-lead">送 TA 一份属于自己的深度报告。<br>也为你们，多留一个读懂彼此的机会。</p>
          <figure class="gift-letter-image"><img src="./media/synastry/gift-letter.webp" width="1536" height="1024" alt="" decoding="async"><figcaption><span>致 · 你想更懂的人</span><span>知星 · 一份了解</span></figcaption></figure>
          <p class="gift-letter-signoff">由你付款，TA 登录后自己确认出生资料并领取。</p>
        </section>
        <section class="gift-order" aria-labelledby="gift-order-title">
          <div class="gift-section-label"><span>赠送清单</span><span>01 份</span></div>
          <h2 id="gift-order-title">知星 · 完整深度报告</h2>
          <p class="gift-order-description">五章解读 · 保存 6 个月 · 可下载<br>随报告赠 1 次本盘问星</p>
          <div class="gift-price-row"><span>赠送一份个人报告</span><strong>¥19.90<small>/ 份</small></strong></div>
          <div class="gift-owner-columns" aria-label="付款人与收礼人的归属">
            <div><span class="gift-owner-role">付款人 · ${esc(displayName||'你')}</span><h3>你得到</h3><p>赠送订单与退款记录。</p></div>
            <div><span class="gift-owner-role">收礼人 · 由 TA 本人确认</span><h3>TA 得到</h3><p>自己的报告与 1 次问星。</p></div>
          </div>
          <p class="gift-privacy-note">TA 领取时同意与你合盘，私人报告仍只属于 TA。</p>
          <p class="expiry">7 天内领取，未领取原路退款。</p>
          <button class="primary full" type="button" id="purchase-gift" ${member()?.giftReportServiceAvailable?.()===true?'':'disabled'}>${member()?.giftReportServiceAvailable?.()===true?'赠送这份了解 · ¥19.90':'赠送服务暂未开放'}</button>
          ${member()?.giftReportServiceAvailable?.()===true?'':'<p class="gift-demo-note">开放后即可购买并发送给 TA。</p>'}
          <details class="source-detail gift-rules"><summary>赠送与领取说明<span aria-hidden="true"></span></summary><ul><li>未领取时可撤回，退款原路退给付款人；发起退款与到账分别展示。</li><li>支付成功后 7 天内领取；到期未领取自动发起原路退款，到账时间以支付渠道为准。</li><li>报告保存期自成功交付起计 6 个月，不从赠送付款时起算。</li><li>领取时明确同意与赠送人合盘；共同阅读截至双方报告较早到期日，解除合盘不会收回个人报告。</li><li>报告已交付后，赠送人不能单方面收回，适用原报告售后规则。</li></ul></details>
        </section>
      </div>
    </div>`;
  }
  function connections(){return `<header class="archive-heading"><div><p class="entry-eyebrow">关系档案</p><h1>我的合盘</h1><p class="archive-reader">当前图谱：${esc(displayName||'未设置昵称')}</p></div><p>那些想读懂的人，<br>也值得一次认真的对话。</p></header><div class="archive-layout"><aside class="archive-index" aria-label="当前合盘状态"><span class="entry-eyebrow">共同解读</span><h2>从这里，继续了解</h2><p class="fine">只共享共同解读，<br>各自的私人内容继续保密。</p></aside><section class="archive-content" aria-label="合盘记录"><article class="archive-record"><div class="archive-record-top"><span class="entry-record-label">共同阅读与邀请</span></div><div class="archive-open-record"><img src="./media/synastry/pair-orbit.webp" width="1536" height="1024" alt="夜空中沿轨道靠近的两枚星体"><div class="archive-state-body"><h2>把一个人的解读，<br>变成两个人的对话。</h2>${serviceNotice()}<div class="synastry-status-actions"><button type="button" class="primary" id="open-connections">查看合盘记录 →</button><button type="button" class="secondary" id="open-invitations">查看邀请记录 →</button></div><a class="text-link" href="#invite">邀请一个人 →</a></div></div></article></section></div>`;}
  function internalInvite(){return `${identity()}<section class="channel-internal-page"><a class="back-link" href="#invite">← 两种邀请方式</a><header class="channel-heading"><p class="entry-eyebrow">站内邀请</p><h1>在知星<br>找到你想邀请的人</h1><p>向 TA 要一个知星号，核对昵称后再邀请</p></header><form class="internal-search" id="internal-search-form"><label for="internal-user-id">对方的知星号</label><div><input id="internal-user-id" name="userId" placeholder="请输入完整知星号" autocomplete="off" spellcheck="false" maxlength="18" pattern="[Zz][Xx][A-Fa-f0-9]{16}" required><button class="primary" type="submit">查找</button></div><p class="fine">仅核对公开昵称与知星号。</p><p class="internal-search-error" id="internal-search-error" role="status"></p></form>${serviceNotice()}<p class="channel-shared-rule">TA 会在「我的合盘 · 收到的邀请」中看到消息。<br>查找时不展示 TA 的盘面、出生资料或购买状态。</p></section>`;}
  function social(options){return root.ZxProfileSocial?.open({...options,senderName:displayName,senderOwner:snapshot().accountRef,reportId:active?.kind==='report'?active.id:'',onInvitationCreated:value=>{if(snapshot().accountRef===value.owner)confirmedInvitation=value;}});}
  let posterDialog=null;
  function closePoster(){if(!posterDialog)return;const dialog=posterDialog;posterDialog=null;root.ZxSynastryPoster?.release(dialog);if(dialog.open)dialog.close();dialog.remove();}
  function openPoster(){
    if(!chart||!root.ZxSynastryPoster)return;
    closePoster();const dialog=document.createElement('dialog');posterDialog=dialog;dialog.id='invite-poster-dialog';dialog.setAttribute('aria-labelledby','invite-poster-title');dialog.innerHTML=root.ZxSynastryPoster.markup();document.body.appendChild(dialog);
    dialog.addEventListener('close',()=>{if(posterDialog===dialog)closePoster();});dialog.addEventListener('cancel',()=>{if(posterDialog===dialog)closePoster();});
    dialog.querySelector('[data-close-dialog]')?.addEventListener('click',closePoster);
    dialog.querySelector('#copy-invite-poster')?.addEventListener('click',()=>root.ZxSynastryPoster.copy(dialog));
    dialog.querySelector('#save-invite-poster')?.addEventListener('click',()=>root.ZxSynastryPoster.save(dialog));
    dialog.showModal();root.ZxSynastryPoster.prepare(dialog,{senderName:confirmedInvitation?.owner===snapshot().accountRef?confirmedInvitation.senderName:displayName||'你的朋友',kind:'invite'});
  }
  function render({scroll=false}={}){
    const page=route();document.body.dataset.route=page==='invite-external'?'invite':page;
    for(const link of document.querySelectorAll('[data-nav]')){const selected=link.dataset.nav===(page.startsWith('invite')||page==='gift'?'invite':page);if(selected)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');}
    $('synastry-home-link').href=homeUrl();$('synastry-profile-link').href=profileUrl();
    const views={home,rank,invite,'invite-external':externalInvite,'invite-internal':internalInvite,gift,connections};
    app.innerHTML=page==='gift'&&incomingGift?gift():busy||!chart?empty():views[page]();app.setAttribute('aria-busy',String(busy));
    document.title='知星 · '+({home:'谁与你更合拍',rank:'五种合拍类型',invite:'邀请 TA','invite-external':'微信邀请','invite-internal':'站内邀请',gift:'送 TA 一份了解',connections:'我的合盘'}[page]);
    mountRankOpenings();
    $('rank-about')?.addEventListener('click',()=>$('rank-dialog').showModal());
    for(const toggle of app.querySelectorAll('[data-rank]'))toggle.addEventListener('click',()=>{openedRank=openedRank===toggle.dataset.rank?'':toggle.dataset.rank;const focusId=toggle.dataset.rank;render();app.querySelector('[data-rank="'+focusId+'"]')?.focus({preventScroll:true});});
    $('copy-invite-link')?.addEventListener('click',()=>social({compose:true,channel:'external'}));
    $('open-invite-poster')?.addEventListener('click',openPoster);
    $('internal-search-form')?.addEventListener('submit',event=>{event.preventDefault();social({compose:true,channel:'internal',lookupCode:$('internal-user-id').value.trim().toUpperCase()});});
    $('purchase-gift')?.addEventListener('click',()=>root.ZxProfileGift?.open({senderReportId:readyReport&&active?.kind==='report'?active.id:null,senderName:displayName}));
    $('open-connections')?.addEventListener('click',()=>social({kind:'records'}));
    $('open-invitations')?.addEventListener('click',()=>social({kind:'invitations'}));
    if(scroll){root.scrollTo({top:0,behavior:'instant'});app.focus({preventScroll:true});}
  }
  async function load(){
    closePoster();confirmedInvitation=null;const version=++epoch;busy=true;chart=null;displayName='';owner='';reportExpires=0;readyReport=false;failure='';
    try{active=selection(location.search,vault()?.selected());}catch(_){active=null;}
    render();
    try{
      if(active?.error)throw new Error(active.error);
      if(!active)throw new Error('请先从日主页选择自己的图谱，再进入合盘。');
      const ageAllowed=date=>!!root.ZxMinimumAge?.evaluateMinimumAge(date).allowed;
      let input;
      if(active.kind==='local'){
        if(!root.ZxPrivacyConsent?.has('birth_local'))throw new Error('本机资料同意已撤回，请到“我的资料”重新确认。');
        const entry=vault()?.get(active.id);
        if(!entry){
          const current=snapshot(),linked=signedIn(current)?vault()?.resolvedPaidLink?.(active.id,current.accountRef):null;
          if(linked){const url=new URL(location.href);url.searchParams.delete('chart');url.searchParams.set('report',linked.reportId);history.replaceState(history.state,'',url.href);return load();}
          throw new Error('这张本机图谱已移除，请从“我的资料”重新进入。');
        }
        input=safeInput(entry.input,ageAllowed);displayName=entry.name||'';
      }else{
        if(!root.ZxPrivacyConsent?.has('device_account')||!member()?.serviceConfigured?.()||!member()?.paidReportServiceAvailable?.())throw new Error('请在“我的资料”登录原微信账号，报告服务开放后即可恢复。');
        await member().start();await member().freshAccessToken();if(version!==epoch)return;
        const current=snapshot();if(!signedIn(current))throw new Error('请先在“我的资料”登录自己的微信账号。');
        if(active.accountRef&&active.accountRef!==current.accountRef)throw new Error('当前账号已改变，请从“我的资料”重新选择自己的报告。');
        const expected=current.accountRef,result=await root.ZxPaidReports.read(active.id);if(version!==epoch)return;
        if(!signedIn(snapshot())||snapshot().accountRef!==expected)throw new Error('账号状态已改变，请从“我的资料”重新进入。');
        input=reportInput(result,active.id,ageAllowed);owner=expected;readyReport=!!input;reportExpires=result?.expires_at||0;
        displayName=vault()?.paidName(active.id,expected)||'';
      }
      if(!input)throw new Error('图谱资料不完整，请到“我的资料”补充后再进入合盘。');
      const [y,m,d]=input.d.split('-').map(Number),[hh,mm]=input.t?input.t.split(':').map(Number):[undefined,undefined];
      chart=root.BaziEngine.computeChart({y,m,d,hh,mm,city:input.c,gender:input.g});root.SynastryEngine.rank(chart);
    }catch(error){if(version!==epoch)return;chart=null;displayName='';readyReport=false;owner='';failure=error.message||'暂时无法读取图谱，请回到“我的资料”重试。';}
    if(version!==epoch)return;busy=false;render();
    if(incomingGift){const token=incomingGift;incomingGift='';await root.ZxProfileGift?.showIncoming(token);}
    if(privateReturn?.inviteToken&&TOKEN.test(privateReturn.inviteToken)){const token=privateReturn.inviteToken;privateReturn=null;await root.ZxProfileSocial?.showIncoming(token);}
  }
  $('social-close')?.addEventListener('click',()=>$('social-detail').close());
  document.querySelectorAll('[data-close-dialog]').forEach(button=>button.addEventListener('click',()=>button.closest('dialog')?.close()));
  root.addEventListener('hashchange',()=>{closePoster();root.ZxProfileSocial?.close();if($('social-detail').open)$('social-detail').close();render({scroll:true});});
  root.addEventListener('popstate',()=>load());
  root.addEventListener('zx-private-session-cleared',()=>{root.ZxProfileSocial?.close();load();});
  root.addEventListener('zx-birth-local-cleared',()=>load());
  root.addEventListener('zx-privacy-consent-cleared',()=>load());
  root.addEventListener('focus',()=>{if(owner&&(!signedIn(snapshot())||snapshot().accountRef!==owner)||reportExpires&&reportExpires<=Date.now())load();});
  vault()?.subscribe?.(()=>load());
  try{privateReturn=root.ZxPaidReports?.consumeSynastryReturn?.()||null;}catch(_){}
  if(privateReturn?.page&&PAGES.includes(privateReturn.page)){const url=new URL(location.href);url.hash=privateReturn.page;history.replaceState(history.state,'',url.href);}
  load();
})(typeof globalThis!=='undefined'?globalThis:this);
