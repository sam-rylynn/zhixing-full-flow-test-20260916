/* Offline export utility. Content is supplied only by the authenticated reader. */
(function(root){
  'use strict';
  const CHAPTERS=['sec-overview','sec-chart','sec-relation','sec-action','sec-phase'];
  const TAGS=new Set('article section div p h2 h3 h4 h5 h6 header span strong b small ul ol li blockquote table caption thead tbody tr th td br em'.split(' '));
  const SVG_TAGS=new Set('svg g circle line path text rect ellipse polygon polyline'.split(' '));
  const CLASSES=new Set(('report-chapter pad chapter-block chapter-source method-reference src-inline src note warn key key-hot structured-list structured-list-keywords identity-keywords report-guide heading-line heading-eyebrow chart-details chart-details-body skeleton-details chart-table chart-table-scroll chart-hidden chart-hidden-item chart-basis chart-repeat-note chart-table-hint basis gz tg bar track fill ten-god-summary astro-block astro-facts astro-approx wheel relation-levels relation-level-panel action-opening action-pair action-tradeoff action-rule action-rhythm rhythm-steps transition-lead time-window time-period time-ganzhi is-current time-stage dy-meta time-focus time-focus-title time-focus-lead time-focus-decade time-period-label time-key-change time-focus-year time-year-heading time-year-number time-reading-label time-year-why time-year-actions time-key-phrase time-focus-basis').split(' '));
  const DROP=new Set('script style link meta base iframe object embed input textarea select option button form img video audio source canvas template noscript'.split(' '));
  const SVG_NUMBERS=/^[\d.\s,+eE-]+$/;
  const SVG_COLOR=/^(?:#[\da-fA-F]{3,8}|rgba?\([\d.,\s]+\)|none|transparent)$/;
  const urls=new Set(),windows=new Set();
  let generation=0;
  const escape=value=>String(value==null?'':value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const CSS=`:root{color-scheme:light;--gold:#806326;--mist:#526070}*{box-sizing:border-box}body{margin:0;background:#f4f1e9;color:#242c3a;font-family:system-ui,-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;line-height:1.9}main{max-width:960px;margin:auto;padding:36px 24px 70px}header.report-heading{text-align:center;padding:20px 0 32px;border-bottom:1px solid #c8b78c}h1,h2,h3,h4,h5,h6{font-family:"Songti SC","SimSun",serif;line-height:1.55;color:var(--gold);break-after:avoid}h1{font-size:32px}h2{font-size:28px;margin:0 0 28px}h3{font-size:23px;margin:30px 0 14px}h4{font-size:21px;margin:24px 0 12px}h5,h6{font-size:18px;margin:18px 0 8px}p{margin:14px 0;overflow-wrap:anywhere}li{margin:9px 0}.identity{font-size:23px}.judgement{font-size:18px}.as-of,.offline-note{color:var(--mist);font-size:13px}.report-chapter{padding:34px 0;border-bottom:1px solid #c8b78c}.chapter-block+.chapter-block{margin-top:30px}.chapter-source,.method-reference,.src,.src-inline,.note{color:var(--mist);font-size:13px}.chapter-source{margin-top:22px}.src-inline{display:block}.heading-line{display:block}.heading-eyebrow{display:block;font-size:16px}.chart-details{padding:18px 22px;margin:24px 0;border:1px solid #c8b78c;border-radius:12px}.chart-details>h3{margin-top:0}.chart-table-scroll{overflow-x:auto}table{width:100%;border-collapse:collapse;margin:22px 0;font-size:14px}caption{text-align:left;font-weight:600}th,td{padding:10px 7px;text-align:center;border:1px solid #c8b78c}.chart-hidden-item{display:block}.bar{display:flex;align-items:center;gap:12px;margin:12px 0}.bar b{min-width:2em}.track{height:8px;flex:1;background:#dcd7ca}.fill{height:100%}.astro-facts,.identity-keywords{display:flex;flex-wrap:wrap;gap:16px;list-style:none;padding:0}.astro-facts li{display:flex;gap:10px}.wheel{display:block;width:340px;max-width:100%;height:auto;margin:20px auto;background:#0e1220;border-radius:50%}.structured-list li>strong,.report-guide strong{display:block}.action-pair{display:grid;grid-template-columns:1fr 1fr;gap:24px}.action-pair>section,.time-focus-year,.time-focus-decade,.relation-level-panel{padding:16px 20px;border:1px solid #c8b78c;border-radius:12px;margin:24px 0}.action-pair>section{margin:0}.action-rule,.key,.key-hot,.time-key-phrase{font-weight:750;color:var(--gold)}.time-year-number{display:block;font-size:30px;font-weight:700}.time-year-number small{margin-left:14px;font-size:16px}.time-year-heading h4{margin-top:6px}.time-period-label{font-weight:700;color:var(--gold)}.time-year-actions h6{font-family:inherit}.time-key-change{border-left:3px solid #bca266;padding-left:16px}.time-window{padding-left:24px}.time-period{display:block;color:var(--gold)}blockquote{border-left:3px solid #bca266;margin:20px 0;padding:8px 18px;background:#ece7da}footer{margin-top:32px;white-space:pre-line;color:var(--mist);font-size:13px}.offline-directory{display:flex;justify-content:center;gap:20px;flex-wrap:wrap;margin:22px 0}.offline-directory a{color:var(--gold)}@media(max-width:600px){main{padding:24px 18px 50px}h1{font-size:28px}h2{font-size:25px}h3{font-size:21px}.action-pair{grid-template-columns:1fr}.chart-details{padding:14px}.time-focus-year,.time-focus-decade{padding:14px}table{font-size:12px}th,td{padding:7px 4px}}@page{size:A4;margin:18mm 16mm}@media print{body{background:white;color:#17202c}main{max-width:none;padding:0}.report-chapter{break-before:page;border:0;padding:0}.report-chapter:first-of-type{break-before:auto}.offline-directory,.offline-note{display:none}h1{font-size:24pt}h2{font-size:20pt}h3{font-size:15pt}h4{font-size:13pt}h5,h6{font-size:11pt}p,li{font-size:10.5pt;line-height:1.8}.chart-table-scroll{overflow:visible}thead{display:table-header-group}tr,.wheel{break-inside:avoid}.action-pair{display:block}.action-pair>section{margin-top:16px}.chapter-source,.method-reference{font-size:9pt}strong{-webkit-print-color-adjust:exact;print-color-adjust:exact}}`;

  function clean(node,target){
    if(node.nodeType===3)return target.createTextNode(node.nodeValue);
    if(node.nodeType!==1)return null;
    const tag=node.localName.toLowerCase();
    if(DROP.has(tag)||node.classList.contains('details-cue')||node.classList.contains('relation-level-buttons'))return null;
    // Only the known, freshly rendered relation panels are expanded from hidden state.
    if(node.hasAttribute('hidden')&&!node.classList.contains('relation-level-panel'))return null;
    const svg=SVG_TAGS.has(tag),allowed=svg||TAGS.has(tag)||tag==='details'||tag==='summary'||tag==='a';
    if(!allowed)return null;
    const out=svg?target.createElementNS('http://www.w3.org/2000/svg',tag):target.createElement(tag==='details'?'section':tag==='summary'?'h3':tag==='a'?'span':tag);
    const classes=[...node.classList].filter(value=>CLASSES.has(value));
    if(classes.length)out.setAttribute('class',classes.join(' '));
    if(svg){
      for(const attr of [...node.attributes]){
        const name=attr.name,value=attr.value;
        if(['viewBox','x','y','x1','y1','x2','y2','cx','cy','r','rx','ry','width','height','stroke-width','stroke-dasharray','font-size','opacity','fill-opacity','stroke-opacity','points'].includes(name)&&SVG_NUMBERS.test(value))out.setAttribute(name,value);
        else if(['fill','stroke'].includes(name)&&SVG_COLOR.test(value))out.setAttribute(name,value);
        else if(name==='d'&&/^[MmZzLlHhVvCcSsQqTtAa\d.\s,+eE-]+$/.test(value))out.setAttribute(name,value);
        else if(name==='transform'&&/^(?:(?:rotate|translate|scale|matrix)\([\d.\s,+eE-]+\)\s*)+$/.test(value))out.setAttribute(name,value);
        else if(name==='text-anchor'&&['start','middle','end'].includes(value))out.setAttribute(name,value);
        else if(name==='dominant-baseline'&&['central','middle'].includes(value))out.setAttribute(name,value);
      }
    }else{
      if(['th','td'].includes(tag)&&/^[1-9]$/.test(node.getAttribute('colspan')||''))out.setAttribute('colspan',node.getAttribute('colspan'));
      if(tag==='th'&&['row','col'].includes(node.getAttribute('scope')))out.setAttribute('scope',node.getAttribute('scope'));
      if(node.classList.contains('fill')){
        const width=node.style.width,color=node.style.backgroundColor;
        if(/^(?:100|\d{1,2})(?:\.\d+)?%$/.test(width))out.style.width=width;
        if(SVG_COLOR.test(color))out.style.backgroundColor=color;
      }
    }
    for(const child of [...node.childNodes]){const result=clean(child,target);if(result)out.append(result);}
    return out;
  }
  function makeDocument({identity,judgement,asOfAt,disclaimer,chaptersHtml}){
    if(typeof chaptersHtml!=='string'||chaptersHtml.length>1500000||typeof disclaimer!=='string'||!disclaimer.trim())throw new Error('REPORT_EXPORT_INVALID');
    // Template contents are inert, including resource elements, while we discard them.
    const parsed=root.document.createElement('template');parsed.innerHTML=chaptersHtml;
    const target=root.document.implementation.createHTMLDocument('');
    const chapters=CHAPTERS.map(id=>{
      const candidates=[...parsed.content.children].filter(node=>node.tagName==='ARTICLE'&&node.id===id);
      if(candidates.length!==1)throw new Error('REPORT_EXPORT_INCOMPLETE');
      const article=clean(candidates[0],target);
      if(!article||!article.querySelector('h2'))throw new Error('REPORT_EXPORT_INCOMPLETE');
      article.id=id;return article.outerHTML;
    }).join('\n');
    const asOf=typeof asOfAt==='string'&&/^\d{4}-\d{2}-\d{2}T/.test(asOfAt)?asOfAt.slice(0,10):'';
    return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src 'none'; script-src 'none'; connect-src 'none'; form-action 'none'; base-uri 'none'"><meta name="referrer" content="no-referrer"><title>知星 · 深度发展报告</title><style>${CSS}</style></head><body><main><header class="report-heading"><p>知星 · 以易理观己，以星盘为证</p><h1>深度发展报告</h1><p class="identity">${escape(identity)}</p><p class="judgement">${escape(judgement)}</p>${asOf?`<p class="as-of">报告时间基准：${escape(asOf)}</p>`:''}<p class="offline-note">完整五章已展开，可离线阅读。需要 PDF 时，请使用浏览器的打印功能并选择“另存为 PDF”。</p></header><nav class="offline-directory" aria-label="报告五章">${CHAPTERS.map((id,index)=>`<a href="#${id}">${['总览','盘面','关系','行动','时间'][index]}</a>`).join('')}</nav>${chapters}<footer>${escape(disclaimer)}</footer></main></body></html>`;
  }
  function clear(){
    ++generation;
    for(const url of urls)root.URL.revokeObjectURL(url);urls.clear();
    for(const popup of windows){try{popup.close();}catch(_){}}windows.clear();
  }
  function save(html,current){
    if(typeof current!=='function'||!current())throw new Error('REPORT_EXPORT_EXPIRED');
    const url=root.URL.createObjectURL(new Blob([html],{type:'text/html;charset=utf-8'}));urls.add(url);
    const a=root.document.createElement('a');a.href=url;a.download='知星-深度发展报告.html';
    try{if(!current())throw new Error('REPORT_EXPORT_EXPIRED');root.document.body.append(a);a.click();}
    finally{a.remove();root.setTimeout(()=>{root.URL.revokeObjectURL(url);urls.delete(url);},30000);}
  }
  async function print(html,current){
    if(typeof current!=='function'||!current())throw new Error('REPORT_EXPORT_EXPIRED');
    const epoch=generation,popup=root.open('about:blank','_blank');
    if(!popup)throw new Error('REPORT_PRINT_BLOCKED');
    windows.add(popup);popup.opener=null;
    try{
      await new Promise((resolve,reject)=>{
        const timer=root.setTimeout(()=>reject(new Error('REPORT_PRINT_TIMEOUT')),10000);
        popup.document.open();
        popup.addEventListener('load',()=>{root.clearTimeout(timer);resolve();},{once:true});
        popup.document.write(html);popup.document.close();
      });
      if(epoch!==generation||!current()||popup.closed)throw new Error('REPORT_EXPORT_EXPIRED');
      popup.focus();popup.print();
    }catch(error){try{popup.close();}catch(_){}windows.delete(popup);throw error;}
  }
  root.addEventListener('pagehide',clear);
  root.ZxReportDownload=Object.freeze({document:makeDocument,save,print,clear});
})(window);
