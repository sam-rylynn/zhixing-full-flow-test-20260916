/* Generated public annual openings. Legacy filename retained for deployment compatibility. */
(function(root,factory){'use strict';const node=typeof module==='object'&&module.exports;const engine=node?require('./bazi-engine.js'):null;const api=factory(()=>engine||(root&&root.BaziEngine),function annualPreviewFactory(getEngine,copy){
    function clockOf(options){
      if(options.referenceDate==null&&options.referenceYear!=null&&Number.isInteger(Number(options.referenceYear)))return {year:Number(options.referenceYear),ms:null};
      let value=options.referenceDate;
      if(typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value))value+='T12:00:00+08:00';
      else if(typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/.test(value))value+='+08:00';
      const ms=value==null?Date.now():new Date(value).getTime();
      if(!Number.isFinite(ms))throw new RangeError('referenceDate 必须是有效日期或时间');
      return {year:new Date(ms+8*3600000).getUTCFullYear(),ms};
    }
    function yearPillar(engine,year){return {stem:engine.STEMS[((year-4)%10+10)%10],branch:engine.BRANCHES[((year-4)%12+12)%12]};}
    function text(p){return p.stem+p.branch;}
    function validPillar(engine,p){return p&&engine.STEMS.includes(p.stem)&&engine.HIDDEN[p.branch];}
    function validStep(engine,stem,step){return validPillar(engine,step)&&Number.isInteger(step.yearFrom)&&Number.isInteger(step.yearTo)&&step.yearTo-step.yearFrom===9&&step.god===engine.tenGod(stem,step.stem);}
    function context(chart,options){
      options=options||{};
      const engine=getEngine(),input=chart&&chart.input,precision=chart&&chart.meta&&chart.meta.inputPrecision;
      const luck=chart&&chart.daYun,stem=chart&&chart.dayMaster&&chart.dayMaster.stem;
      if(!engine||!chart||chart.meta&&chart.meta.requiresBirthTime||!input||!Number.isInteger(input.hh)||input.hh<0||input.hh>23
        ||!['男','女'].includes(input.gender)||precision&&precision.birthTime==='missing'||!luck||luck.gender!==input.gender
        ||typeof luck.forward!=='boolean'||!Array.isArray(luck.steps)||!luck.startText||!engine.STEMS.includes(stem)
        ||!chart.pillars||['year','month','day','hour'].some(pos=>!validPillar(engine,chart.pillars[pos]))||chart.pillars.day.stem!==stem
        ||!chart.fiveElements||!chart.fiveElements.dayMasterStrength||!Array.isArray(chart.fiveElements.dayMasterStrength.basis)
        ||!['偏弱','中和','偏强'].includes(chart.fiveElements.dayMasterStrength.label))return null;
      const clock=clockOf(options),index=luck.steps.findIndex(step=>clock.year>=step.yearFrom&&clock.year<=step.yearTo);
      const current=luck.steps[index],next=luck.steps[index+1],following=luck.steps.find(step=>clock.year+1>=step.yearFrom&&clock.year+1<=step.yearTo);
      if(index<0||![current,next,following].every(step=>validStep(engine,stem,step)))return null;
      if(Array.isArray(options.steps)){
        const supplied=options.steps.filter(step=>step&&step.stem&&step.branch&&Number.isFinite(Number(step.yearFrom))&&Number.isFinite(Number(step.yearTo)));
        const i=supplied.findIndex(step=>clock.year>=Number(step.yearFrom)&&clock.year<=Number(step.yearTo));
        if(i<0||[current,next].some((step,j)=>!supplied[i+j]||['stem','branch','god'].some(key=>String(supplied[i+j][key]||'').trim()!==String(step[key]))
          ||['yearFrom','yearTo'].some(key=>Number(supplied[i+j][key])!==step[key])))return null;
      }
      const actualYear=clock.ms!=null&&clock.ms<engine.jieTime(clock.year,engine.JIE[0])?clock.year-1:clock.year;
      const actual=yearPillar(engine,actualYear),supplied=options.annualPillar;
      if(supplied){
        const candidate=typeof supplied==='string'?{stem:supplied[0],branch:supplied[1]}:supplied;
        if(validPillar(engine,candidate)&&text(candidate)!==text(actual))return null;
      }
      const gods=[...new Set([engine.tenGod(stem,actual.stem),...engine.HIDDEN[actual.branch].map(s=>engine.tenGod(stem,s))])].sort();
      if(options.annualGods&&(!Array.isArray(options.annualGods)||[...new Set(options.annualGods)].sort().join('、')!==gods.join('、')))return null;
      return {clock,current};
    }
    function readYear(chart,year,beforeLiChun){
      const engine=getEngine(),p=yearPillar(engine,year),stem=chart.dayMaster.stem,role=copy.roles[engine.tenGod(stem,p.stem)];
      const main=engine.HIDDEN[p.branch][0],step=chart.daYun.steps.find(step=>year>=step.yearFrom&&year<=step.yearTo);
      if(!role||!step)return null;
      const targets=['year','month','day','hour'].map(pos=>({label:'本命'+copy.positions[pos],pillar:chart.pillars[pos]})).concat([{label:'当前大运',pillar:step}]);
      const relation=[];
      targets.forEach((target,index)=>{
        const q=target.pillar,exact=text(p)===text(q),clash=copy.clashes.find(pair=>pair.includes(p.branch)&&pair.includes(q.branch)&&p.branch!==q.branch);
        const combine=copy.combines.find(pair=>pair.includes(p.branch)&&pair.includes(q.branch)&&p.branch!==q.branch);
        if(exact)relation.push({score:30+(target.label==='当前大运'?5:0),index,body:'与'+target.label+text(q)+'同柱'+(target.label==='当前大运'?'，叫岁运并临':'，这里按伏吟读取')+'。'});
        else if(clash)relation.push({score:20+(target.label==='当前大运'?3:target.label==='本命日柱'?2:0),index,body:'与'+target.label+'形成'+clash+'冲，两种要求难以兼顾的地方，要重新作选择。'});
        else if(combine)relation.push({score:10,index,body:'与'+target.label+'形成'+combine+'六合，亲近或共同投入时，也要保留各自的意愿。'});
      });
      relation.sort((a,b)=>b.score-a.score||a.index-b.index);
      const prefix=beforeLiChun?'这份年度重点从立春后使用。':'';
      const why=prefix+year+' '+text(p)+'，'+p.stem+'为'+engine.tenGod(stem,p.stem)+'，'+p.branch+'中主气'+main+'为'+engine.tenGod(stem,main)+'。'
        +(relation[0]?relation[0].body:'')+'放在'+text(step)+'运，'+role.why+'。'+role.bold+'。';
      return {year,pillar:text(p),tagline:copy.titles[engine.tenGod(stem,p.stem)],why,bold:role.bold};
    }
    function build(chart,options){const ctx=context(chart,options);return ctx?readYear(chart,ctx.clock.year,ctx.clock.ms!=null&&ctx.clock.ms<getEngine().jieTime(ctx.clock.year,getEngine().JIE[0])):null;}
    return Object.freeze({build,readYear});
  },{"annual":{"roles":{"比肩":{"why":"比肩谈的是自我与同辈。意见越多，越要分清自己想做什么，哪些选择只是为了不输给别人","bold":"先选自己愿意过的生活，再考虑别人怎样评价"},"劫财":{"why":"劫财把同辈关系与共同用钱放在一起读。为朋友买单、陪人消费、替人承诺，都要先问自己是否真愿意","bold":"不能拒绝的买单，正在把人情变成负担"},"食神":{"why":"食神关乎表达、制作与生活滋味。忙碌不能一直挤掉吃饭、休息和喜欢的事；这些需要在日常里有位置","bold":"别把所有好日子，都留给忙完以后"},"伤官":{"why":"伤官谈表达与质疑。看出问题之后，最有用的是说清哪里不合适、自己想怎样改变；反复讽刺只会把对话推远","bold":"你要表达的是立场，不是让对方认输"},"偏财":{"why":"偏财关乎外部机会和资源流动。新项目、新物件、新体验都能吸引注意，真正要辨认的是哪一项值得持续花时间和钱","bold":"把已经做成的事做好，再决定要不要另开一摊"},"正财":{"why":"正财看持续投入与真实代价。长期储蓄、共同生活、稳定做一件事，都要从普通的一天看起，不能只凭开头的热情","bold":"承诺能不能兑现，要看日常里有没有行动"},"七杀":{"why":"七杀把外部压力推到眼前。面对催促、竞争和强势的人，要分清眼下必须处理的事，与自己因害怕否定而硬接的事","bold":"不必用透支，证明自己什么都扛得住"},"正官":{"why":"正官谈规则、身份和认可。把合格当成唯一标准，就容易连选工作、谈感情和休息，都先猜别人会怎样打分","bold":"别人满意，不等于这个选择适合你"},"偏印":{"why":"偏印谈深入理解与独立思考。分析能看清细节，也会拖住行动；接触一个人、一项兴趣，不必在开始前就给它下完结论","bold":"别让越来越高的标准，拦住一次真实的尝试"},"正印":{"why":"正印看学习、照顾与安全感。有人支持是一份帮助；每遇到选择都等别人替自己决定，就会把安心过成依赖","bold":"可以向别人求助，决定仍要由自己来做"}},"titles":{"比肩":"这一年，把自己的意愿放回首位","劫财":"别拿自己的委屈，维持表面的合群","食神":"把日子过得有滋味，别只剩完成任务","伤官":"少一点憋着，再一次把话说清","偏财":"先看真正留下多少，再谈做得多大","正财":"把承诺放进日常，再看值不值得继续","七杀":"先停掉硬撑，再处理眼前的难题","正官":"守住该守的，也放下对满分的执着","偏印":"把想了很久的事，亲自试一次","正印":"给自己支撑，也给自己选择的权利"},"positions":{"year":"年柱","month":"月柱","day":"日柱","hour":"时柱"},"clashes":["子午","丑未","寅申","卯酉","辰戌","巳亥"],"combines":["子丑","寅亥","卯戌","辰酉","巳申","午未"]},"reviewed":{"2026":{"index":0,"year":2026,"pillar":"丙午","tagline":"把利润留下，别把自己耗光","why":"2026 丙午，与你的本命月柱完全相同，叫月柱伏吟。原盘生在午月，丙火偏财已经透出，甲木食神又生财；这一年再叠丙午，做出成绩、得到回报、证明能力的主题被重复强调。我的判断是：今年先把最熟悉的那条路做扎实，别急着再开一摊。","bold":"今年先把最熟悉的那条路做扎实，别急着再开一摊。"},"2027":{"index":1,"year":2027,"pillar":"丁未","tagline":"喜欢之后，还要看能不能好好相处","why":"丁正财合壬，午未相合，未又与日支戌有相刑关系。这里要同时读吸引与摩擦：想靠近一个人，也要看靠近以后，你还能不能自然地做自己。让你不敢表达不满的关系，亲密里已经掺进了压抑。","bold":"让你不敢表达不满的关系，亲密里已经掺进了压抑。"}}});if(node)module.exports=api;if(root)root.ZhixingHomeDecadePreview=api;})(typeof globalThis!=='undefined'?globalThis:this,function createHomeAnnualPreview(getEngine, annualFactory, data){
  'use strict';
  const publicAnnual=annualFactory(getEngine,data.annual);
  const STEMS='甲乙丙丁戊己庚辛壬癸',BRANCHES='子丑寅卯辰巳午未申酉戌亥';
  const GODS=['比肩','劫财','食神','伤官','偏财','正财','正官','七杀','正印','偏印'];
  function clock(options){
    if(options.referenceDate==null&&options.referenceYear!=null&&Number.isInteger(Number(options.referenceYear)))return {year:Number(options.referenceYear),ms:null};
    let value=options.referenceDate;
    if(typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value))value+='T12:00:00+08:00';
    else if(typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/.test(value))value+='+08:00';
    const ms=value==null?Date.now():new Date(value).getTime();
    if(!Number.isFinite(ms))throw new RangeError('referenceDate 必须是有效日期或时间');
    return {year:new Date(ms+8*3600000).getUTCFullYear(),ms};
  }
  function pillar(value){return !!value&&STEMS.includes(value.stem)&&value.stem.length===1&&BRANCHES.includes(value.branch)&&value.branch.length===1;}
  function validStep(value){return pillar(value)&&GODS.includes(value.god)&&Number.isInteger(value.yearFrom)&&Number.isInteger(value.yearTo)&&value.yearTo-value.yearFrom===9;}
  function same(a,b){return validStep(a)&&validStep(b)&&['stem','branch','god','yearFrom','yearTo'].every(key=>a[key]===b[key]);}
  function isReviewed(chart,time,steps,options,engine){
    const expected={year:'壬申',month:'丙午',day:'壬戌',hour:'甲辰'},pillars=chart.pillars||{};
    if(Object.keys(expected).some(key=>!pillars[key]||pillars[key].stem+pillars[key].branch!==expected[key]))return false;
    if(chart.dayMaster?.stem!=='壬'||chart.dayMaster.element!=='水'||chart.fiveElements?.dayMasterStrength?.label!=='偏弱')return false;
    const astro=chart.astro||{};
    if([['sun','双子座'],['moon','射手座'],['asc','巨蟹座']].some(([key,sign])=>!astro[key]||astro[key].sign!==sign||astro[key].approx||astro[key].nearEdge))return false;
    if(chart.daYun.forward!==true||String(chart.daYun.startText||'').trim().replace(/\s|起运/g,'')!=='7岁3个月')return false;
    if(time.year!==2026&&time.year!==2027)return false;
    const annualYear=time.ms==null||time.ms>=engine.jieTime(time.year,engine.JIE[0])?time.year:time.year-1;
    if(annualYear!==2026&&annualYear!==2027)return false;
    const annualPillar=annualYear===2026?'丙午':'丁未';
    if(options.annualPillar!=null){
      const supplied=typeof options.annualPillar==='string'?options.annualPillar:String(options.annualPillar.stem||'').trim()+String(options.annualPillar.branch||'').trim();
      if(supplied!==annualPillar)return false;
    }
    if(options.annualGods!=null){
      const gods=[...new Set([annualPillar[0],...engine.HIDDEN[annualPillar[1]]].map(stem=>engine.tenGod('壬',stem)))].sort();
      if(!Array.isArray(options.annualGods)||[...new Set(options.annualGods)].sort().join('、')!==gods.join('、'))return false;
    }
    function matchingPeriods(list){
      const index=list.findIndex(step=>time.year>=step.yearFrom&&time.year<=step.yearTo);
      const normalized=step=>step&&({...step,yearFrom:Number(step.yearFrom),yearTo:Number(step.yearTo)});
      return same(normalized(list[index]),{stem:'己',branch:'酉',god:'正官',yearFrom:2019,yearTo:2028})
        &&same(normalized(list[index+1]),{stem:'庚',branch:'戌',god:'偏印',yearFrom:2029,yearTo:2038});
    }
    return matchingPeriods(steps)&&(options.steps==null||(Array.isArray(options.steps)&&matchingPeriods(options.steps)));
  }
  function selection(item,prefix,index){
    if(!item||!Number.isInteger(item.year)||typeof item.why!=='string'||!/[。！？][”」』]?$/.test(item.why)
      ||typeof item.tagline!=='string'||!item.tagline.trim()||typeof item.bold!=='string'||!item.bold||!item.why.includes(item.bold))return null;
    const label=item.year+' · '+item.pillar+'流年';
    const emphasis=item.bold;
    const context=item.why.replace(emphasis,'').trim().replace(/(?:我的判断是|重点是|今年要记住的是)[：:]?$/,'').trim();
    return {kind:'annual',chapter:'时间',chapterId:'phase',year:item.year,pillar:item.pillar,label,stage:label,title:item.tagline,body:item.why,
      source:item.year+' 流年·'+item.pillar,bold:emphasis,emphasis,context,
      excerptField:prefix+'phase.focusYears['+index+'].why',
      excerptTitleField:prefix+'phase.focusYears['+index+'].tagline',parts:[item.why]};
  }
  function buildTeaser(chart,options){
    options=options||{};
    const engine=getEngine(),input=chart&&chart.input,precision=chart&&chart.meta&&chart.meta.inputPrecision,luck=chart&&chart.daYun;
    if(!engine||!chart||chart.meta?.requiresBirthTime||!input||!Number.isInteger(input.hh)||input.hh<0||input.hh>23
      ||!['男','女'].includes(input.gender)||precision?.birthTime==='missing'||!luck||luck.gender!==input.gender
      ||typeof luck.forward!=='boolean'||!Array.isArray(luck.steps)||!luck.steps.length)return null;
    const time=clock(options);
    if(isReviewed(chart,time,luck.steps,options,engine)){
      const selected=data.reviewed[String(time.year)];
      return selected?selection(selected,'reviewed.',selected.index):null;
    }
    return selection(publicAnnual.build(chart,options),'',0);
  }
  return Object.freeze({SCHEMA_VERSION:'home-annual-preview-v1',buildTeaser});
});
