// Editable seed values, persisted with every newly published configuration.
const NORMALIZATION_DEFAULTS = Object.freeze({ lateGraceMinutes: 0, earlyLeaveGraceMinutes: 0, onTimeScore: 100, lateScore: 0, absenceScore: 0, guestRatingMinimum: 1, guestRatingMaximum: 5 });
// These are editor defaults, not a historical scoring policy. Sources stay
// unconfigured until an authorized manager explicitly publishes their rubric.
const MONTHLY_SOURCE_DEFAULTS = Object.freeze({
  recognition: { active: false, includedReportTypes: [], levels: [], monthlyCap: null, approvalRequired: true, eligibleJobTitles: [], eligibleStatuses: ['ACTIVE'], branches: ['*'], effectiveFrom: null, effectiveTo: null },
  guestFeedback: { active: false, eligibleTemplates: [], questionCodes: [], ratingMinimum: 1, ratingMaximum: 5, minimumResponses: 1, approvalRequired: true, includeDirectFeedback: true, birthdayAttribution: 'EQUAL', tripStaffWeight: 1, tripLeaderWeight: 1, eligibleJobTitles: [], eligibleStatuses: ['ACTIVE'], branches: ['*'], effectiveFrom: null, effectiveTo: null },
});
function monthlySourceConfig(value) {
  return Object.fromEntries(Object.entries(MONTHLY_SOURCE_DEFAULTS).map(([key, defaults]) => [key, { ...defaults, ...value?.[key] }]));
}
function validateMonthlySources(value, issue) {
  if(value==null)return;
  if(typeof value!=='object'||Array.isArray(value)){issue('monthlyAppraisal.sources','must be an object');return;}
  const config=monthlySourceConfig(value);
  for(const [key,item] of Object.entries(config)) {
    const path='monthlyAppraisal.sources.'+key;
    for(const field of ['branches','eligibleJobTitles','eligibleStatuses',...(key==='recognition'?['includedReportTypes','levels']:['eligibleTemplates','questionCodes'])])if(!Array.isArray(item[field]))issue(path+'.'+field,'must be a list');
    for(const field of ['active','approvalRequired',...(key==='guestFeedback'?['includeDirectFeedback']:[])])if(typeof item[field]!=='boolean')issue(path+'.'+field,'must be true or false');
    const dates=['effectiveFrom','effectiveTo'];for(const field of dates){const parsed=item[field]?new Date(item[field]+'T00:00:00Z'):null;if(item[field]&&(!/^\d{4}-\d{2}-\d{2}$/.test(item[field])||Number.isNaN(parsed.getTime())||parsed.toISOString().slice(0,10)!==item[field]))issue(path+'.'+field,'must be a valid date');}
    if(item.effectiveTo&&item.effectiveFrom&&item.effectiveTo<item.effectiveFrom)issue(path+'.effectiveTo','cannot precede the effective start');
    if(key==='recognition') {
      if(item.monthlyCap!=null&&(!Number.isFinite(Number(item.monthlyCap))||Number(item.monthlyCap)<=0))issue(path+'.monthlyCap','must be greater than zero');
      if(item.active&&(!item.includedReportTypes?.length||!item.levels?.length||item.monthlyCap==null))issue(path,'requires included report types, point levels and a monthly cap before activation');
      const seen=new Set();for(const level of Array.isArray(item.levels)?item.levels:[]){if(!level?.levelCode||seen.has(level?.levelCode)||!Number.isFinite(Number(level?.points))||Number(level?.points)<=0)issue(path+'.levels','requires unique reward codes and positive points');seen.add(level?.levelCode);}
    } else {
      for(const field of ['ratingMinimum','ratingMaximum','tripStaffWeight','tripLeaderWeight'])if(!Number.isFinite(Number(item[field]))||Number(item[field])<0)issue(path+'.'+field,'must be non-negative');
      if(Number(item.ratingMaximum)<=Number(item.ratingMinimum))issue(path+'.ratingMaximum','must exceed the minimum');
      if(!Number.isInteger(item.minimumResponses)||item.minimumResponses<1)issue(path+'.minimumResponses','must be at least one');
      if(!['EQUAL','FULL'].includes(item.birthdayAttribution))issue(path+'.birthdayAttribution','must be EQUAL or FULL');
      if(item.active&&!item.eligibleTemplates?.length&&!item.includeDirectFeedback)issue(path,'requires survey templates or direct feedback');
    }
  }
}
module.exports = { NORMALIZATION_DEFAULTS, MONTHLY_SOURCE_DEFAULTS, monthlySourceConfig, validateMonthlySources };
