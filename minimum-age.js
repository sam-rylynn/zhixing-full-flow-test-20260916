(function(root, factory){
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.ZxMinimumAge = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function(){
  'use strict';

  const MINIMUM_AGE = 14;
  const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

  function parseDate(value){
    const match = DATE_RE.exec(String(value || ''));
    if (!match) return null;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
    return { year, month, day, value:match[0] };
  }

  function currentDate(timeZone){
    const zone = timeZone || 'Asia/Shanghai';
    try {
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone:zone,
        year:'numeric',
        month:'2-digit',
        day:'2-digit'
      }).formatToParts(new Date());
      const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
      return `${values.year}-${values.month}-${values.day}`;
    } catch (_) {
      const now = new Date();
      return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
    }
  }

  function latestEligibleBirthDate(asOfDate){
    const asOf = parseDate(asOfDate || currentDate());
    if (!asOf) return '';
    return `${String(asOf.year-MINIMUM_AGE).padStart(4,'0')}-${String(asOf.month).padStart(2,'0')}-${String(asOf.day).padStart(2,'0')}`;
  }

  function evaluateMinimumAge(birthDate, asOfDate){
    const birth = parseDate(birthDate);
    const today = parseDate(asOfDate || currentDate());
    if (!birth || !today || birth.value > today.value) return { valid:false, allowed:false, latestEligibleBirthDate:'' };
    const latest = latestEligibleBirthDate(today.value);
    return { valid:true, allowed:birth.value <= latest, latestEligibleBirthDate:latest };
  }

  return { MINIMUM_AGE, currentDate, evaluateMinimumAge, latestEligibleBirthDate, parseDate };
});
