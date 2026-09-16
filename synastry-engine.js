/* Cultural relationship facts and an explicitly experimental type ordering. No compatibility probability. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.SynastryEngine=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const VERSION='synastry-facts-20260912-v3',RANK_VERSION='synastry-type-codenames-20260912-v1',ASSESSMENT_VERSION='synastry-codenames-20260912-v1';
  const STEMS=['甲','乙','丙','丁','戊','己','庚','辛','壬','癸'], ELEMENTS=['木','火','土','金','水'];
  const SIGNS=['白羊','金牛','双子','巨蟹','狮子','处女','天秤','天蝎','射手','摩羯','水瓶','双鱼'];
  const COMBINE=['甲己','乙庚','丙辛','丁壬','戊癸'],BRANCH_COMBINE=['子丑','寅亥','卯戌','辰酉','巳申','午未'],BRANCH_OPPOSE=['子午','丑未','寅申','卯酉','辰戌','巳亥'];
  const paired=(table,a,b)=>table.some(pair=>pair===a+b||pair===b+a);
  const element=stem=>ELEMENTS[Math.floor(STEMS.indexOf(stem)/2)];
  function relation(a,b){const x=ELEMENTS.indexOf(a),y=ELEMENTS.indexOf(b);if(x<0||y<0)throw new Error('INVALID_ELEMENT');return ['同气','我生','我克','克我','生我'][(y-x+5)%5];}
  function angle(a,b){if(!Number.isFinite(a)||!Number.isFinite(b))throw new Error('INVALID_LONGITUDE');const d=((a-b)%360+360)%360;return Math.min(d,360-d);}
  function assertChart(c){if(!c||!c.pillars?.day||!STEMS.includes(c.dayMaster?.stem)||element(c.dayMaster.stem)!==c.dayMaster.element)throw new Error('INVALID_CHART');}
  function precisionOf(chart){
    const source=chart.meta?.inputPrecision;
    const birthTime=source?.birthTime==='minute'?'minute':source?.birthTime==='missing'?'missing':'unverified';
    const provisional=Array.isArray(source?.provisionalPillars)?source.provisionalPillars:[];
    return {birthTime,dayProvisional:birthTime!=='minute'||provisional.some(key=>key==='day'||key==='dayMaster')};
  }
  function facts(participants){
    if(!Array.isArray(participants)||participants.length!==2||participants.some(p=>!p||typeof p.id!=='string'||!p.id)||participants[0].id===participants[1].id)throw new Error('INVALID_PARTICIPANTS');
    const ordered=participants.slice().sort((a,b)=>a.id.localeCompare(b.id));ordered.forEach(p=>assertChart(p.chart));
    const [a,b]=ordered,ca=a.chart,cb=b.chart,items=[];
    const precision=Object.fromEntries(ordered.map(p=>[p.id,precisionOf(p.chart)]));
    const add=(id,system,kind,value,label)=>items.push({id,system,kind,participants:[a.id,b.id],value,label});
    add('day-elements','八字','elements',{[a.id]:ca.dayMaster.element,[b.id]:cb.dayMaster.element,forward:relation(ca.dayMaster.element,cb.dayMaster.element),reverse:relation(cb.dayMaster.element,ca.dayMaster.element)},'日主五行关系');
    add('day-stems','八字','stems',{[a.id]:ca.dayMaster.stem,[b.id]:cb.dayMaster.stem,combine:paired(COMBINE,ca.dayMaster.stem,cb.dayMaster.stem)},'日干五合');
    const ba=ca.pillars.day.branch,bb=cb.pillars.day.branch;
    add('day-branches','八字','branches',{[a.id]:ba,[b.id]:bb,combine:paired(BRANCH_COMBINE,ba,bb),oppose:paired(BRANCH_OPPOSE,ba,bb),same:ba===bb},'日支六合与相冲');
    for(const lum of ['sun','moon','asc']){
      // A noon assumption (or an old chart without precision evidence) is not a known instant.
      if(precision[a.id].birthTime!=='minute'||precision[b.id].birthTime!=='minute')continue;
      const x=ca.astro?.[lum],y=cb.astro?.[lum];
      // Approximate or near-edge Moon and missing ascendant cannot provide precise corroboration.
      if(!x||!y||x.approx||y.approx||x.nearEdge||y.nearEdge)continue;
      // The chart's unrounded sign may differ from its rounded longitude exactly at an ingress.
      if([x,y].some(body=>typeof body.sign==='string'&&body.sign.replace(/座$/,'')!==signAt(body.lon).name))continue;
      if(Number.isFinite(x.lon)&&Number.isFinite(y.lon))add('astro-'+lum,'星盘','angular-separation',{degrees:Math.round(angle(x.lon,y.lon)*100)/100,signs:{[a.id]:signAt(x.lon),[b.id]:signAt(y.lon)}},({sun:'太阳',moon:'月亮',asc:'上升'})[lum]+'黄经最小夹角');
    }
    return {version:VERSION,participants:ordered.map(p=>p.id),precision,items,limits:['五合只记组合，不判合化；六合与相冲不等于关系结局。','当前只覆盖日主、日干、日支及同类光体夹角，不代表完整传统合盘。','星盘夹角仅为位置辅证，不据此计算关系成功率。'],warnings:ordered.flatMap(p=>(p.chart.meta?.warnings||[]).map(w=>({participant:p.id,message:w})))};
  }
  const ASTRO_ELEMENTS=['火','土','风','水'];
  const CODENAMES={
    heming:{name:'和鸣',en:'HARMONY',title:'心有灵犀',tagline:'不必说尽，也能懂得彼此。'},
    yinghe:{name:'应和',en:'RESONANCE',title:'相得益彰',tagline:'各有所长，在一起相互成全。'},
    tiaoxian:{name:'调弦',en:'ATTUNEMENT',title:'和而不同',tagline:'各有自己的节奏，在差异里寻找默契。'}
  };
  const MOTIFS={
    甲:{image:'树',detail:'把方向说清，让共同的期待有一条可以走的路'},
    乙:{image:'藤',detail:'把靠近做得柔和，也把自己的偏好留在商量里'},
    丙:{image:'日光',detail:'把喜欢大方表达，让心意有看得见的回应'},
    丁:{image:'灯火',detail:'记住不显眼的小事，让关照落在恰好的地方'},
    戊:{image:'山',detail:'把答应的事接稳，让一起做的事有可靠的落点'},
    己:{image:'田',detail:'把日常照料做好，让彼此都留有休息的余地'},
    庚:{image:'金铁',detail:'把边界和办法讲明，让犹豫有一个可以开始的动作'},
    辛:{image:'玉',detail:'认真对待分寸与细节，让用心有值得珍惜的质地'},
    壬:{image:'江河',detail:'带来新的去处，也把共同的约定留在行程里'},
    癸:{image:'雨露',detail:'照见细小的感受，再把猜测变成能够回答的问题'}
  };
  const SOLAR_MOTIFS=[
    ['先迈一步','提起一个新鲜想法时，愿不愿意一起试一次'],
    ['慢慢安定','一起吃饭、散步时，能不能照顾彼此舒服的节奏'],
    ['让话题生长','一个新话题出现时，能不能让彼此都说得尽兴'],
    ['把熟悉留住','分享一天的小事时，能不能给彼此安心的回应'],
    ['让心意发亮','表达喜欢时，能不能让彼此的用心被看见'],
    ['把小事做好','一起准备一件事时，能不能把细节谈成共同的约定'],
    ['为彼此留位置','意见不一样时，能不能让两个人都影响最后的安排'],
    ['认真走近','想更了解彼此时，能不能坦白在意而不急着追问'],
    ['一起看远处','谈起想去的地方时，能不能让兴致变成共同的出发'],
    ['给承诺着落','约定下一步时，能不能把愿意落成做到'],
    ['留下新的可能','提出不同想法时，能不能保留各自独立选择的空间'],
    ['接住心里的话','分享感受时，能不能先听完，再问希望怎样陪伴']
  ];
  function signAt(lon){const index=Math.floor(((lon%360+360)%360)/30);return {index,name:SIGNS[index],element:ASTRO_ELEMENTS[index%4]};}
  function validSign(s){return s&&Number.isInteger(s.index)&&s.index>=0&&s.index<12&&s.name===SIGNS[s.index]&&s.element===ASTRO_ELEMENTS[s.index%4];}
  function friendly(a,b){return a===b||(a==='火'&&b==='风')||(a==='风'&&b==='火')||(a==='土'&&b==='水')||(a==='水'&&b==='土');}
  function pairSigns(item,participants){if(!Number.isFinite(item?.value?.degrees)||item.value.degrees<0||item.value.degrees>180)return null;const signs=participants.map(id=>item?.value?.signs?.[id]);return signs.every(validSign)?signs.sort((a,b)=>a.index-b.index):null;}
  function partial(scope='pair'){
    return {version:ASSESSMENT_VERSION,scope,status:'partial',code:null,name:'资料待补充',en:'',title:'先读已知的你们',tagline:'把资料补齐，再看彼此的呼应。',summary:'先从真实的相处开始了解彼此。',east:{title:'先留下东方的线索',identity:'',paragraphs:['补充并确认出生资料后，再展开属于这两张盘的古典意象。'],sourceIds:[]},west:{title:'等星辰的位置清晰',identity:'',paragraphs:['出生时间或星体位置还未确认，暂不判断彼此的呼应。'],sourceIds:[]},ease:'先说一件彼此喜欢的小事，让了解有一个具体的开场。',friction:'有疑问就直接询问，不必替对方猜完答案。',sourceIds:[]};
  }
  function eastCopy(stems,rel,branch,combine){
    const [a,b]=stems,ma=MOTIFS[a],mb=MOTIFS[b],identity=a+element(a)+' × '+b+element(b);
    let title,paragraphs,ease,friction;
    if(rel==='同气'){
      title=ma.image+'与'+mb.image+'，同声相近';
      paragraphs=[identity+'借同一种五行意象，照见相近的出发点。'+ma.image+'与'+mb.image+'可以彼此映照，也仍有各自的形状。','在一起时，可以从'+ma.detail+'开始，再听听另一种做法：'+mb.detail+'。熟悉感之外，仍值得认真问一次对方真正喜欢什么。'];
      ease='从相近的关注点开始聊天，容易找到两个人都愿意参与的一件事。';
      friction='觉得“我们很像”时，也各自说清预算、时间与偏好，不用默契省去确认。';
    }else if(rel==='我生'||rel==='生我'){
      const giver=rel==='我生'?a:b,receiver=rel==='我生'?b:a;
      title=(stems.includes('戊')&&stems.includes('辛'))?'山藏玉，有所托':MOTIFS[giver].image+'有回响，'+MOTIFS[receiver].image+'有所托';
      paragraphs=[(stems.includes('戊')&&stems.includes('辛'))?'一座山，给玉一处安放；一块玉，让山有了值得珍惜的光。':identity+'的相生意象，像把一份力量交到另一种形状里：有了托举，也有了可以回应的去处。',giver+element(giver)+'这一侧，可以试着'+MOTIFS[giver].detail+'；'+receiver+element(receiver)+'这一侧，也可以'+MOTIFS[receiver].detail+'。好相处的地方，在于支持能被接住，回应也能回到彼此身上。'];
      ease='一份主动遇见另一份认真，喜欢可以变成两个人共同参与的安排。';
      friction='别让主动慢慢变成固定分工；轮流提议、准备和收尾，让两个人都能表达需要。';
    }else{
      title=ma.image+'与'+mb.image+'，相异成景';
      paragraphs=[identity+'带来不同的用力方向。'+ma.image+'有'+ma.image+'的形状，'+mb.image+'有'+mb.image+'的质地；这份不同，适合用来认识彼此在意什么。','一方可以'+ma.detail+'，另一方可以'+mb.detail+'。愿意先听懂对方为什么这样选择，差异就有机会变成新的办法。'];
      ease='不同的办法可以替共同生活打开另一个角度，让各自的长处有发挥的位置。';
      friction='提出更好的办法前，先问对方最想保留什么；把共同底线与个人习惯分开商量。';
    }
    if(combine)paragraphs.push('两种日干还带有五合的文化意象，可以把它读成一次愿意靠近的邀请：欣赏彼此的不同，也把需要认真谈清。');
    if(branch?.combine)paragraphs.push('日支的六合线索，为这个开篇添了一层相接的意味。把它放回日常，可以留意：一件共同的小事，是否让两个人都愿意继续参与。');
    if(branch?.oppose)friction='临时改变约定时，先确认给彼此带来的影响，再商量补救；别急着用自己的节奏替对方作决定。';
    return {east:{title,identity,paragraphs,sourceIds:['day-elements','day-stems',...(branch?['day-branches']:[])]},ease,friction};
  }
  function westCopy(suns,moons){
    const [a,b]=suns,same=a.element===b.element,compatible=friendly(a.element,b.element);
    const identity='太阳'+a.name+' × 太阳'+b.name;
    const titles={火:'星火相映，兴致相接',土:'脚步相近，日常有着落',风:'清风相会，话语有回声',水:'水光相照，心事有人听'};
    const pairedTitle=[a.element,b.element].sort().join('')==='火风'?'风助星火，把兴致带远':'水润沃土，让关照生长';
    const title=same?titles[a.element]:compatible?pairedTitle:'星光各有方向，靠近需要听见';
    const first=same?({火:'一句“走，我们去”，容易成为两个人故事的开场。',土:'一起把一件小事做好，也可以是一种踏实的靠近。',风:'从一句有意思的话开始，给彼此留下继续聊下去的兴致。',水:'愿意认真听一句心里话，就给亲近留下了一个入口。'})[a.element]:compatible?'一种节奏带来邀请，另一种节奏让邀请有了新的去处。':'一人先看见的，未必是另一人最在意的；愿意交换视角，是靠近的第一步。';
    const paragraphs=[first,identity+'可以从“'+SOLAR_MOTIFS[a.index][0]+'”与“'+SOLAR_MOTIFS[b.index][0]+'”这两个意象展开。看看'+SOLAR_MOTIFS[a.index][1]+'；也问问'+SOLAR_MOTIFS[b.index][1]+'。'];
    if(moons){const moodFriendly=friendly(moons[0].element,moons[1].element);paragraphs.push('月亮'+moons[0].name+'与月亮'+moons[1].name+'，'+(moodFriendly?'又添了一层可以呼应的感受线索。亲近时，仍要问清此刻想被陪伴，还是想安静一会儿。':'提醒你们把表达感受的方式再多说一步。想要的安慰不同，也可以分别说出，再找到此刻能给的回应。'));}
    return {title,identity,paragraphs,sourceIds:['astro-sun',...(moons?['astro-moon']:[])]};
  }
  function openingFor({scope,stems,rel,branch,combine,suns,moons,code}){
    const {east,ease,friction}=eastCopy(stems,rel,branch,combine),west=westCopy(suns,moons);
    const summary=code==='heming'?'从靠近到回应，有多处值得一起珍惜的默契。':code==='tiaoxian'?'吸引里带着不同，理解要落在每一次具体的商量。':'彼此有回应，也各有自己的节奏。';
    return {version:ASSESSMENT_VERSION,scope,status:'ready',code,...CODENAMES[code],summary,east,west,ease,friction,sourceIds:[...east.sourceIds,...west.sourceIds]};
  }
  function assess(f){
    const ids=f?.participants;
    if(!Array.isArray(ids)||ids.length!==2||new Set(ids).size!==2||!Array.isArray(f.items)||!ids.every(id=>f.precision?.[id]?.birthTime==='minute'&&f.precision[id].dayProvisional===false))return partial();
    const pick=id=>f.items.find(item=>item.id===id),e=pick('day-elements'),s=pick('day-stems'),b=pick('day-branches');
    if(!e||!s||!b||!ids.every(id=>STEMS.includes(s.value?.[id])&&element(s.value[id])===e.value?.[id]&&'子丑寅卯辰巳午未申酉戌亥'.includes(b.value?.[id])&&String(b.value[id]).length===1))return partial();
    const stems=ids.map(id=>s.value[id]).sort((a,b)=>STEMS.indexOf(a)-STEMS.indexOf(b)),rel=relation(element(stems[0]),element(stems[1]));
    const suns=pairSigns(pick('astro-sun'),ids),moons=pairSigns(pick('astro-moon'),ids);
    if(!suns||!moons)return partial();
    // Re-derive cultural relations from their inputs so caller-supplied booleans cannot upgrade a verdict.
    const combine=paired(COMBINE,...stems),branches=ids.map(id=>b.value[id]),branch={combine:paired(BRANCH_COMBINE,...branches),oppose:paired(BRANCH_OPPOSE,...branches)};
    const responsive=['同气','我生','生我'].includes(rel),support=Number(responsive)+Number(combine)+Number(branch.combine);
    const tension=Number(!responsive&&!combine)+2*Number(branch.oppose),corroboration=Number(friendly(suns[0].element,suns[1].element))+Number(friendly(moons[0].element,moons[1].element));
    const code=support>=2&&tension===0&&corroboration===2?'heming':(tension>=2&&corroboration<=1)||(tension>=1&&corroboration===0)?'tiaoxian':'yinghe';
    return openingFor({scope:'pair',stems,rel,branch,combine,suns,moons,code});
  }
  function rank(chart){
    assertChart(chart);const sun=chart.astro?.sun;
    if(!sun||!Number.isFinite(sun.lon))throw new Error('SUN_REQUIRED');
    const own=signAt(sun.lon),p=precisionOf(chart),exact=p.birthTime==='minute'&&!p.dayProvisional&&!sun.approx&&!sun.nearEdge&&(!sun.sign||sun.sign.replace(/座$/,'')===own.name),rows=[];
    for(let s=0;s<STEMS.length;s++)for(let z=0;z<12;z++){
      const stem=STEMS[s],rel=relation(chart.dayMaster.element,element(stem)),combine=paired(COMBINE,chart.dayMaster.stem,stem),other=signAt(z*30+15),compatible=friendly(own.element,other.element),responsive=['同气','我生','生我'].includes(rel);
      // This is explicitly a type-only pattern, with no invented partner date, Moon or day branch.
      const code=(combine&&compatible)||(responsive&&own.element===other.element)?'heming':!responsive&&!combine&&!compatible?'tiaoxian':'yinghe';
      const stems=[chart.dayMaster.stem,stem].sort((a,b)=>STEMS.indexOf(a)-STEMS.indexOf(b)),canonicalRel=relation(element(stems[0]),element(stems[1]));
      const opening=exact?openingFor({scope:'type',stems,rel:canonicalRel,branch:null,combine,suns:[own,other].sort((a,b)=>a.index-b.index),moons:null,code}):partial('type');
      rows.push({id:'type-'+s+'-'+z,stem:stem+element(stem),sun:SIGNS[z],score:0,primary:0,secondary:0,relation:rel,
        sources:['日主五行·'+rel,...(combine?['日干五合']:[]),'太阳星座元素·'+(own.element===other.element?'同类':compatible?'相接':'不同节奏')],
        headline:opening.tagline,ease:[opening.east.paragraphs[0],opening.west.paragraphs[0]],friction:opening.friction,opening});
    }
    const order={heming:0,yinghe:1,tiaoxian:2};
    rows.sort((a,b)=>(order[a.opening.code]??3)-(order[b.opening.code]??3)||a.id.localeCompare(b.id,'en',{numeric:true}));
    const seen=new Set(),suns=new Set(),top=rows.filter(row=>{if(seen.has(row.stem)||suns.has(row.sun))return false;seen.add(row.stem);suns.add(row.sun);return true;}).slice(0,5);
    return {version:RANK_VERSION,space:120,status:exact?'ready':'partial',tieBreak:'同一代号内并列，按天干与黄道顺序稳定展示；从中选出日主与太阳星座均不同的五种类型，不表示精确前五名。',rules:'知星的文化意象分类：日主关系为主、太阳元素为参照。类型没有另一人的日支与月亮；实际双盘另按双方完整的已知资料解读。',rows:top,allRows:rows};
  }
  return Object.freeze({VERSION,RANK_VERSION,ASSESSMENT_VERSION,STEMS,SIGNS,element,relation,angle,facts,assess,rank});
});
