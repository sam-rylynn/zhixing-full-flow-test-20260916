/* Shared display of a server/engine supplied opening. This layer never grades a pair. */
(function(root){
  'use strict';
  const sourceNames={
    'day-stems':'八字 · 日干关系','day-branches':'八字 · 日支关系','day-elements':'八字 · 日主五行',
    'astro-sun':'星盘 · 太阳','astro-moon':'星盘 · 月亮','astro-asc':'星盘 · 上升'
  };
  const codes=new Set(['heming','yinghe','tiaoxian']);
  const text=value=>typeof value==='string'?value.trim():'';
  const paragraphs=value=>Array.isArray(value)?value.filter(item=>text(item)):[];
  function create(opening,options={}){
    if(!root.document||!opening||typeof opening!=='object'||!['ready','partial'].includes(opening.status))return null;
    if(opening.status==='ready'&&(!codes.has(opening.code)||!text(opening.name)||!text(opening.title)))return null;
    const el=(tag,value,cls)=>{const node=root.document.createElement(tag);if(value!==undefined)node.textContent=text(value);if(cls)node.className=cls;return node;};
    const ready=opening.status==='ready',compact=options.compact===true;
    const section=el('section',undefined,'synastry-opening'+(compact?' synastry-opening--compact':''));
    section.setAttribute('data-opening-code',ready?opening.code:'partial');
    section.setAttribute('aria-label',ready?'合拍代号 · '+opening.name:'合盘资料待补充');
    const hero=el('div',undefined,'synastry-opening__hero');
    const names=Array.isArray(options.names)?options.names.filter(item=>text(item)).slice(0,2):[];
    if(names.length===2)hero.append(el('p',names.join(' × '),'synastry-opening__names'));
    const badge=el('div',undefined,'synastry-opening__badge');
    badge.append(el('span',ready?'合拍代号':'盘面资料'),el('strong',ready?opening.name:'待补充'));
    hero.append(badge);
    if(ready&&text(opening.en))hero.append(el('p',opening.en,'synastry-opening__english'));
    hero.append(el(compact?'h3':'h2',text(opening.title)||'先读已知的你们','synastry-opening__title'));
    if(text(opening.tagline))hero.append(el('p',opening.tagline,'synastry-opening__tagline'));
    if(text(opening.summary))hero.append(el('p',opening.summary,'synastry-opening__summary'));
    section.append(hero);
    const reasons=el('div',undefined,'synastry-opening__reasons');
    for(const [key,label]of [['east','东方 · 易理主轴'],['west','西方 · 星盘辅证']]){
      const reason=opening[key];
      if(!reason||typeof reason!=='object'||(!text(reason.title)&&!paragraphs(reason.paragraphs).length))continue;
      const article=el('article',undefined,'synastry-opening__reason');
      article.append(el('p',label,'synastry-opening__eyebrow'));
      if(text(reason.title))article.append(el(compact?'h4':'h3',reason.title,'synastry-opening__reason-title'));
      if(text(reason.identity))article.append(el('p',reason.identity,'synastry-opening__identity'));
      for(const [index,paragraph]of paragraphs(reason.paragraphs).entries())article.append(el('p',paragraph,index===0?'synastry-opening__lead':'synastry-opening__paragraph'));
      reasons.append(article);
    }
    if(reasons.children.length)section.append(reasons);
    const balance=el('div',undefined,'synastry-opening__balance');
    for(const [key,label]of [['ease','最值得靠近的地方'],['friction','最需要商量的地方']]){
      if(!text(opening[key]))continue;
      const item=el('div');item.append(el(compact?'h4':'h3',label),el('p',opening[key]));balance.append(item);
    }
    if(balance.children.length)section.append(balance);
    const sourceIds=[...(Array.isArray(opening.sourceIds)?opening.sourceIds:[]),...(Array.isArray(opening.east?.sourceIds)?opening.east.sourceIds:[]),...(Array.isArray(opening.west?.sourceIds)?opening.west.sourceIds:[])];
    const sources=[...new Set(sourceIds.map(id=>sourceNames[id]).filter(Boolean))];
    if(sources.length){
      const basis=el('details',undefined,'synastry-opening__basis');
      basis.append(el('summary','解读依据'),el('p',sources.join(' · ')),el('p','和鸣、应和、调弦是知星的文化解读代号，描述盘面的呼应与磨合。'));
      section.append(basis);
    }
    return section;
  }
  root.ZxSynastryOpening=Object.freeze({create});
})(typeof window==='object'?window:globalThis);
