(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.SynastryPolicy=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const VERSION='synastry-policy-20260912-v1';
  const AI_CONSENT_VERSION='synastry-ai-consent-candidate-20260910-v1';
  const DAY=86400000;
  const dateKey=at=>new Date(at+8*3600000).toISOString().slice(0,10);
  function addMonths(at,months){
    const d=new Date(at+8*3600000),day=d.getUTCDate();
    d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()+months);
    const last=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate();
    d.setUTCDate(Math.min(day,last));return d.getTime()-8*3600000;
  }
  function validateDraft(draft,engine,at=Date.now()){
    const d=draft||{},date=String(d.date||''),parsed=new Date(date+'T00:00:00Z');
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(parsed.getTime())||parsed.toISOString().slice(0,10)!==date||date<'1940-01-01'||date>dateKey(at))return '请填写 1940 年起的有效出生日期。';
    const today=dateKey(at),adult=String(Number(today.slice(0,4))-18)+today.slice(4);
    if(date>adult)return '当前报告与合盘仅向已满 18 周岁的本人开放。';
    if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(String(d.time||'')))return '请填写准确的出生时间。';
    if(!['female','male'].includes(d.gender))return '请选择出生性别，用于时间解读。';
    const city=String(d.city||'').normalize('NFKC').trim();
    if(!city||city.length>60||/[\u0000-\u001f\u007f]/.test(city))return '请选择出生地，支持城市、自治州和区县；无需填写详细地址。';
    const hit=engine&&engine.resolveCity(city);
    if(!hit||hit.complete!==true||!['city','district'].includes(hit.src))return '请选择一个明确的出生城市或区县；同名地点请补充省市，省名不能代替出生地。';
    return '';
  }
  function input(draft){const [y,m,d]=draft.date.split('-').map(Number),[hh,mm]=draft.time.split(':').map(Number);return {y,m,d,hh,mm,city:draft.city,gender:draft.gender==='female'?'女':'男'};}
  return Object.freeze({VERSION,AI_CONSENT_VERSION,DAY,dateKey,addMonths,validateDraft,input,giftClaimDays:7,invitationDays:7,readingExpiry:(a,b)=>Math.min(a,b)});
});
