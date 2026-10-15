const {migrateLegacy,applicableRules,shiftPolicy,handoverConfig}=require('./rotation-distributions');
const {isCombined,components,physicalConflict,coversPosition,assignmentPosition}=require('./rotation-locations');
const {handoverRules,handoverWindow,dataExitBlocked,policyConflicts}=require('./rotation-handover');
function generateConfiguredRotation(input,helpers){
 const {workDate,team,positions,qualifications=[],breaks=[],slots=[],rules={},fixedAssignments=[],branch='MOT',role=''}=input;
 const {employeeAvailable,onBreak,overlaps,canAssign,seededRank,normalizeRotationRules}=helpers,options=normalizeRotationRules(rules);
 const config=input.distributions||migrateLegacy(positions,branch,options);
 const policyData={...input,distributions:config};
 const assignments=fixedAssignments.map(a=>({employeeId:a.employeeId,operationalPositionId:a.operationalPositionId||a.position?.id,positionCode:a.positionCode||a.position?.code,shiftCode:a.shiftCode||team.find(m=>m.employeeId===a.employeeId)?.shiftCode,startTime:a.startTime,endTime:a.endTime,manualLock:Boolean(a.manualLock),source:a.source||'MANUAL',overrideReason:a.overrideReason||null,preserved:true}));
 const alerts=[],unassigned=[],coverage=[],excluded=[];
 const working=team.filter(m=>m.employee?.active!==false&&employeeAvailable(m,Boolean(m.liveDay)));
 const roleAllowed=(m,r)=>!r.roles.length||r.roles.some(value=>[m.employee?.jobTitle,m.employee?.department].some(actual=>String(actual||'').toLowerCase()===value.toLowerCase()));
 const rotating=m=>(!options.excludeCashiers||!m.frontAssignment&&m.employee?.department!=='CASHIER')&&!(m.isShiftLeader??m.employee?.operationsTeamLeader);
 const occupied=(a,s)=>overlaps(a.startTime,a.endTime,s.startTime,s.endTime);
 const warn=(code,message,extra={})=>alerts.push({code,message,severity:'WARNING',...extra});
 const shiftRank=s=>handoverWindow(policyData)?(s===handoverConfig(config).incomingShift?0:s===handoverConfig(config).outgoingShift?2:1):0;
 const sortedSlots=[...slots].sort((a,b)=>a.startTime.localeCompare(b.startTime)||shiftRank(a.shiftCode)-shiftRank(b.shiftCode)||a.shiftCode.localeCompare(b.shiftCode));
 for(const slot of sortedSlots){
  const applicable=handoverRules(policyData,slot);
  for(const row of applicable.filter(r=>r.excludedReason))if(!excluded.some(e=>e.shift===slot.shiftCode&&e.ruleId===row.rule.id&&e.reason===row.excludedReason))excluded.push({shift:slot.shiftCode,ruleId:row.rule.id,positionCode:row.position?.code,rank:row.rule.rank,reason:row.excludedReason});
  const entries=applicable.filter(r=>!r.excludedReason),pool=working.filter(m=>m.shiftCode===slot.shiftCode&&rotating(m)&&(!role||[m.employee?.jobTitle,m.employee?.department].includes(role)));
  if(!entries.length&&pool.some(m=>!onBreak(breaks,m.employeeId,slot.startTime,slot.endTime)))warn('NO_ENABLED_LOCATIONS',`${slot.shiftCode} ${slot.startTime}: no valid enabled locations; generation is blocked for these employee-hours`,{severity:'CRITICAL',shiftCode:slot.shiftCode,startTime:slot.startTime});
  const count=entry=>entry.position.code==='CASHIER'?working.filter(m=>m.shiftCode===slot.shiftCode&&(m.frontAssignment==='FRONT_CASHIER'||m.employee?.department==='CASHIER')).length:assignments.filter(a=>coversPosition(a,entry.position,positions)&&occupied(a,slot)).length;
  const totalCount=entry=>assignments.filter(a=>coversPosition(a,entry.position,positions)&&occupied(a,slot)).length;
  const physicalAvailable=entry=>!assignments.some(a=>occupied(a,slot)&&physicalConflict(entry.position,assignmentPosition(a,positions)));
  const eligible=entry=>physicalAvailable(entry)&&!dataExitBlocked(policyData,entry.position,assignments,slot,applicable)?pool.filter(m=>roleAllowed(m,entry.rule)&&canAssign({qualifications,employeeId:m.employeeId,position:{...entry.position,requiresQualification:entry.position.requiresQualification||entry.rule.qualificationRequired},workDate,positions})&&!onBreak(breaks,m.employeeId,slot.startTime,slot.endTime)&&!assignments.some(a=>a.employeeId===m.employeeId&&occupied(a,slot))&&( !m.expectedStart||!m.expectedEnd||slot.startTime>=m.expectedStart&&slot.endTime<=m.expectedEnd)):[];
  const preferredEmployees=new Map();
  function fill(entry,target){
   if(entry.position.code==='CASHIER')return;
   while(count(entry)<target&&totalCount(entry)<entry.rule.max){
    const candidate=eligible(entry).sort((a,b)=>{
     const preferred=preferredEmployees.get(entry.rule.id);if(preferred&&(a.employeeId===preferred)!==(b.employeeId===preferred))return a.employeeId===preferred?-1:1;
     const repeats=id=>assignments.some(x=>x.employeeId===id&&x.operationalPositionId===entry.position.id&&x.endTime===slot.startTime);
     if(options.avoidConsecutivePosition&&repeats(a.employeeId)!==repeats(b.employeeId))return repeats(a.employeeId)?1:-1;
     const usage=id=>assignments.filter(x=>x.employeeId===id&&x.operationalPositionId===entry.position.id).length;
     const load=id=>assignments.filter(x=>x.employeeId===id).length;
     return usage(a.employeeId)-usage(b.employeeId)||load(a.employeeId)-load(b.employeeId)||seededRank(`${workDate}:${slot.startTime}:${entry.rule.id}:${a.employeeId}`)-seededRank(`${workDate}:${slot.startTime}:${entry.rule.id}:${b.employeeId}`)||a.employeeId.localeCompare(b.employeeId);
    })[0];
    if(!candidate)break;
    assignments.push({employeeId:candidate.employeeId,operationalPositionId:entry.position.id,positionCode:entry.position.code,shiftCode:slot.shiftCode,startTime:slot.startTime,endTime:slot.endTime,manualLock:false,source:'AUTO',ruleId:entry.rule.id,rank:entry.rule.rank,highlight:(options.highlightedPositionCodes||[]).includes(entry.position.code)});
   }
  }
  const singleEntries=entries.filter(e=>!isCombined(e.position)&&e.position.code!=='CASHIER');
  const freeStaff=pool.filter(m=>!onBreak(breaks,m.employeeId,slot.startTime,slot.endTime)&&!assignments.some(a=>a.employeeId===m.employeeId&&occupied(a,slot))&&(!m.expectedStart||slot.startTime>=m.expectedStart)&&(!m.expectedEnd||slot.endTime<=m.expectedEnd)).length;
  const staffingDemand=singleEntries.reduce((sum,e)=>sum+Math.max(0,Math.max(e.rule.min,e.rule.target)-count(e)),0);
  const preferCombined=shiftPolicy(config,slot.shiftCode).preferCombinedWhenShortStaffed&&freeStaff<staffingDemand;
  if(preferCombined){
   // Seven known pairs: choose a disjoint set, rather than greedily consuming Locker
   // and blocking a better Data-Locker + Play-Drop + Park-Trampoline arrangement.
   const combined=entries.filter(e=>isCombined(e.position)&&e.rule.max>0&&Math.max(e.rule.min,e.rule.target)>0&&eligible(e).length);
   const match=list=>{const picked=new Map(),used=new Set();const search=index=>{if(index===list.length)return true;for(const m of eligible(list[index])){if(used.has(m.employeeId))continue;used.add(m.employeeId);picked.set(list[index].rule.id,m.employeeId);if(search(index+1))return true;used.delete(m.employeeId);picked.delete(list[index].rule.id);}return false;};return search(0)?new Map(picked):null;};
   let best={score:-Infinity,entries:[],employees:new Map()};
   for(let mask=0;mask<(1<<combined.length);mask++){
    const selected=combined.filter((_,index)=>mask&(1<<index));if(selected.length>freeStaff)continue;
    const parts=selected.flatMap(e=>components(e.position));if(new Set(parts).size!==parts.length)continue;
    const employees=match(selected);if(!employees)continue;
    const addedRequired=singleEntries.filter(e=>e.rule.required&&parts.includes(e.position.code)&&count(e)<e.rule.min).length;
    const remainingRequired=singleEntries.filter(e=>e.rule.required&&!parts.includes(e.position.code)).reduce((sum,e)=>sum+Math.max(0,e.rule.min-count(e)),0);
    const addedCoverage=singleEntries.filter(e=>parts.includes(e.position.code)&&count(e)<Math.max(e.rule.min,e.rule.target)).length;
    const remainingCoverage=singleEntries.filter(e=>!parts.includes(e.position.code)).reduce((sum,e)=>sum+Math.max(0,Math.max(e.rule.min,e.rule.target)-count(e)),0);
    const available=freeStaff-selected.length;
    const score=(addedRequired+Math.min(available,remainingRequired))*10000+(addedCoverage+Math.min(available,remainingCoverage))*100-selected.reduce((sum,e)=>sum+e.rule.rank,0)/100;
    if(score>best.score)best={score,entries:selected,employees};
   }
   for(const [ruleId,employeeId] of best.employees)preferredEmployees.set(ruleId,employeeId);
   best.entries.sort((a,b)=>a.rule.rank-b.rule.rank).forEach(entry=>fill(entry,1));
  }
  const required=entries.filter(e=>e.rule.required),optional=entries.filter(e=>!e.rule.required).sort((a,b)=>a.rule.rank-b.rule.rank||Number(isCombined(a.position))-Number(isCombined(b.position)));
  required.forEach(e=>fill(e,e.rule.min));
  const shortages=required.filter(e=>count(e)<e.rule.min&&!dataExitBlocked(policyData,e.position,assignments,slot,applicable));
  required.forEach(e=>fill(e,e.rule.target));
  if(!shortages.length){optional.forEach(e=>fill(e,e.rule.min));optional.forEach(e=>fill(e,e.rule.target));if(options.distributeAvailableEmployees!==false)[...required,...optional].forEach(e=>fill(e,e.rule.max));}
  if(config.coverageBeforeDataExit)[...required,...optional].forEach(e=>fill(e,e.rule.target));
  for(const entry of entries){
   const assigned=count(entry),shortage=Math.max(0,entry.rule.min-assigned);
   coverage.push({shift:slot.shiftCode,startTime:slot.startTime,endTime:slot.endTime,positionCode:entry.position.code,positionId:entry.position.id,rank:entry.rule.rank,required:entry.rule.required,min:entry.rule.min,target:entry.rule.target,max:entry.rule.max,assigned,shortage});
   if(shortage)warn(dataExitBlocked(policyData,entry.position,assignments,slot,applicable)?'COVERAGE_PRIORITY':'POSITION_SHORTAGE',`${slot.shiftCode} ${slot.startTime} ${entry.position.code}: ${shortage} below configured minimum; check available staff, roles, qualifications, breaks and protected cells`,{severity:entry.rule.required&&!dataExitBlocked(policyData,entry.position,assignments,slot,applicable)?'CRITICAL':'WARNING',shiftCode:slot.shiftCode,positionCode:entry.position.code,startTime:slot.startTime,shortage});
   if(totalCount(entry)>entry.rule.max)warn('PROTECTED_MAX_CONFLICT',`${slot.shiftCode} ${slot.startTime} ${entry.position.code}: protected assignments exceed the maximum`,{shiftCode:slot.shiftCode,positionCode:entry.position.code,startTime:slot.startTime});
   const rejected=pool.filter(m=>roleAllowed(m,entry.rule)&&!canAssign({qualifications,employeeId:m.employeeId,position:{...entry.position,requiresQualification:entry.position.requiresQualification||entry.rule.qualificationRequired},workDate,positions}));
   if(rejected.length)warn('QUALIFICATION_CONFLICT',`${slot.shiftCode} ${slot.startTime} ${entry.position.code}: ${rejected.length} employees do not meet qualification requirements`,{shiftCode:slot.shiftCode,positionCode:entry.position.code,startTime:slot.startTime,employeeIds:rejected.map(m=>m.employeeId)});
  }
  for(const member of pool.filter(m=>!assignments.some(a=>a.employeeId===m.employeeId&&occupied(a,slot)))){
   const reason=onBreak(breaks,member.employeeId,slot.startTime,slot.endTime)?'BREAK':shortages.length?'REQUIRED_COVERAGE_BLOCKED':!entries.length?'NO_ENABLED_RULES':'NO_ELIGIBLE_CAPACITY';
   unassigned.push({employeeId:member.employeeId,name:member.employee?.operationalName||member.employee?.name,shift:slot.shiftCode,startTime:slot.startTime,endTime:slot.endTime,reason});
  }
 }
 for(const a of assignments.filter(a=>a.preserved)){
  const active=applicableRules(config,positions,{workDate,shift:a.shiftCode,slot:a}).find(e=>e.position?.id===a.operationalPositionId&&!e.excludedReason);
  if(!active)warn('PROTECTED_EXCLUDED_LOCATION',`${a.positionCode||a.operationalPositionId} ${a.startTime}: protected cell retained at an excluded location; review it manually`,{employeeId:a.employeeId,positionCode:a.positionCode});
 }
 for(let i=0;i<assignments.length;i++)for(let j=i+1;j<assignments.length;j++){
  const a=assignments[i],b=assignments[j];
  if(overlaps(a.startTime,a.endTime,b.startTime,b.endTime)&&physicalConflict(assignmentPosition(a,positions),assignmentPosition(b,positions)))warn('PHYSICAL_LOCATION_CONFLICT','Protected assignments share a component location. Review the locked/manual cells before applying.',{severity:'CRITICAL',employeeIds:[a.employeeId,b.employeeId],positionCode:a.positionCode,startTime:a.startTime});
 }
 if(unassigned.length)warn('UNASSIGNED_EMPLOYEES',`${unassigned.length} employee-hour slots remain unassigned; no excluded location was used as fallback`);
 const blocked=unassigned.filter(row=>row.reason!=='BREAK');
 if(blocked.length)warn('VALID_LOCATION_CAPACITY_BLOCKED',`${blocked.length} employee-hour slots could not be assigned under the enabled shift rules. Only the valid portion was generated; protected cells were retained.`,{severity:'CRITICAL',blockedEmployeeHours:blocked.length});
 for(const conflict of policyConflicts(policyData,assignments,breaks,slots))warn(conflict.code,'Protected assignments conflict with the handover or Data/Exit coverage policy. Review those cells before applying.',{severity:'CRITICAL',...conflict});
 return {assignments,alerts,coverage,unassigned,excluded,availableEmployeeCount:working.filter(rotating).filter(m=>slots.some(s=>s.shiftCode===m.shiftCode)).filter(m=>!role||[m.employee?.jobTitle,m.employee?.department].includes(role)).length,configurationSource:config.source||'UNSAVED_PREVIEW'};
}
module.exports={generateConfiguredRotation};
