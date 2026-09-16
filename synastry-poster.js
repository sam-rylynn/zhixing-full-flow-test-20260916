/* Invitation/gift export with the confirmed 观象 identity and explicit sender name. */
window.ZxSynastryPoster=(()=>{
  const base=new URL('./media/synastry/',document.currentScript.src);
  const visual={selection:()=>({variant:'b',logo:'guanxiang'}),asset:name=>new URL(name,base).href,logoAsset:()=>new URL('logo-guanxiang-gold.svg',base).href,title:kind=>kind==='gift'?['这份了解','我想送给你']:['如果相遇有伏笔','我想和你一起读']};
  const exports=new WeakMap();let version=0;
  const markup=()=>`<section class="invite-poster-panel"><header class="invite-poster-header"><h2 id="invite-poster-title">你的分享卡片</h2><button class="icon-button" data-close-dialog aria-label="关闭分享卡片">×</button></header><div class="invite-poster-view" aria-busy="true"><p class="invite-poster-loading">正在制作卡片…</p><img id="invite-poster-image" width="1080" height="1620" alt="知星分享卡片" hidden></div><div class="invite-poster-actions"><button class="primary" id="copy-invite-poster" disabled>复制图片</button><button class="secondary" id="save-invite-poster" disabled>保存图片</button></div><p class="invite-poster-feedback" id="invite-poster-feedback" role="status"></p><p class="invite-poster-note">这是卡片图片，不代表邀请已创建或发送。<br>邀请服务开放后，请将真实邀请链接与图片一起发给 TA。</p></section>`;
  const load=src=>new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(Error('Artwork unavailable'));img.src=src;});
  async function renderPoster(options={}){
    const o={senderName:'你的朋友',kind:'invite',...options,...visual.selection()};
    if(document.fonts?.ready)await document.fonts.ready;
    const [art,logo]=await Promise.all([load(visual.asset('celestial-b.png')),load(visual.logoAsset())]);
    const canvas=document.createElement('canvas');canvas.width=1080;canvas.height=1620;const ctx=canvas.getContext('2d');if(!ctx)throw Error('Canvas unavailable');ctx.drawImage(art,0,0,1080,1620);
    const serif='"Songti SC", "STSong", serif',sans='"PingFang SC", sans-serif';ctx.textAlign='left';ctx.textBaseline='middle';
    const spacedWidth=(text,spacing)=>Array.from(text).reduce((width,char)=>width+ctx.measureText(char).width+spacing,0);
    const spacedText=(text,x,y,spacing,center=true)=>{if(center)x-=spacedWidth(text,spacing)/2;for(const char of Array.from(text)){ctx.fillText(char,x,y);x+=ctx.measureText(char).width+spacing;}};
    // Coordinates mirror the card's container-width typography in brand-refresh.css.
    const tagline='以易理观己，以星盘为证';ctx.font=`19.98px ${sans}`;const brandWidth=108+23.76+spacedWidth(tagline,2.16),brandLeft=(1080-brandWidth)/2;
    ctx.drawImage(logo,brandLeft,831.84,108,108);const brandTextLeft=brandLeft+131.76;
    ctx.font=`65.88px ${serif}`;ctx.fillStyle='#e4c992';spacedText('知星',brandTextLeft,866.19,16.2,false);
    ctx.font=`19.98px ${sans}`;ctx.fillStyle='#cbc4b3';spacedText(tagline,brandTextLeft,925.5,2.16,false);
    ctx.font=`23.76px ${sans}`;ctx.fillStyle='#cbb683';spacedText(o.kind==='gift'?'一份送给你的个人解读':'一封写给你的合盘邀请',540,994.05,6.48);
    ctx.font=`500 75.6px ${serif}`;ctx.fillStyle='#eee4d1';visual.title(o.kind).forEach((line,i)=>spacedText(line,540,1098.65+i*117.18,6.48));
    ctx.font=`30.24px ${sans}`;ctx.fillStyle='#c1c4c8';spacedText(o.kind==='gift'?'读懂自己，从这一份了解开始':'读懂自己，也读懂彼此',540,1323.24,2.16);
    let size=Array.from(o.senderName).length>14?35.64:44.28;ctx.font=`23.76px ${sans}`;const prefixWidth=ctx.measureText('来自').width,gap=17.28;
    do{ctx.font=`${size}px ${serif}`;if(ctx.measureText(o.senderName).width+prefixWidth+gap<=907.2)break;size--;}while(size>22);
    const nameWidth=ctx.measureText(o.senderName).width,signatureX=(1080-prefixWidth-gap-nameWidth)/2,signatureY=1389.33+size*.75;
    ctx.fillStyle='#dfc38e';ctx.fillText(o.senderName,signatureX+prefixWidth+gap,signatureY);ctx.font=`23.76px ${sans}`;ctx.fillStyle='#929bad';ctx.fillText('来自',signatureX,signatureY);
    ctx.fillStyle='#87909f';ctx.font=`21.6px ${sans}`;spacedText('知星 · 个人发展与文化研究',540,1551.42,4.32);
    return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(Error('Export failed')),'image/png'));
  }
  const feedback=(dialog,text)=>{const el=dialog.querySelector('#invite-poster-feedback');if(el)el.textContent=text;};
  async function prepare(dialog,options={}){const current=++version;const previous=exports.get(dialog);if(previous)URL.revokeObjectURL(previous.url);exports.delete(dialog);try{const blob=await renderPoster(options);if(!dialog.open||current!==version)return;const url=URL.createObjectURL(blob);exports.set(dialog,{blob,url,kind:options.kind||'invite'});const img=dialog.querySelector('#invite-poster-image');img.src=url;img.alt=`知星${options.kind==='gift'?'礼物':'邀请'}卡片，来自${options.senderName||'你的朋友'}`;img.hidden=false;dialog.querySelector('.invite-poster-loading').hidden=true;dialog.querySelector('.invite-poster-view').setAttribute('aria-busy','false');dialog.querySelectorAll('.invite-poster-actions button').forEach(b=>b.disabled=false);}catch{if(current!==version||!dialog.open)return;dialog.querySelector('.invite-poster-loading').textContent='卡片暂时无法生成，请关闭后重试。';dialog.querySelector('.invite-poster-view').setAttribute('aria-busy','false');}}
  function copy(dialog){const data=exports.get(dialog);if(!data)return;if(!navigator.clipboard?.write||typeof ClipboardItem==='undefined'){feedback(dialog,'当前浏览器不支持复制图片，请使用“保存图片”。');return;}try{navigator.clipboard.write([new ClipboardItem({'image/png':data.blob})]).then(()=>feedback(dialog,'卡片已复制，可粘贴到聊天窗口。请同时发送链接。'),()=>feedback(dialog,'浏览器未允许复制图片，请使用“保存图片”。'));}catch{feedback(dialog,'请使用“保存图片”。');}}
  function save(dialog){const data=exports.get(dialog);if(!data)return;const a=document.createElement('a');a.href=data.url;a.download='知星-'+(data.kind==='gift'?'礼物卡':'合盘邀请')+'.png';document.body.appendChild(a);a.click();a.remove();feedback(dialog,'已发起下载。请把卡片与链接一起发送。');}
  function release(dialog){version++;const data=exports.get(dialog);if(data)URL.revokeObjectURL(data.url);exports.delete(dialog);}
  return {markup,prepare,copy,save,renderPoster,release};
})();
