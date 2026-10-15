const { applicableRules, handoverConfig, DEFAULT_HANDOVER } = require('./rotation-distributions');
const { components, coversPosition, assignmentPosition } = require('./rotation-locations');
const minutes = value => Number(String(value).slice(0,2))*60+Number(String(value).slice(3,5));
const time = value => `${String(Math.floor(value/60)).padStart(2,'0')}:${String(value%60).padStart(2,'0')}`;
const overlaps = (a,b) => a.startTime < b.endTime && b.startTime < a.endTime;
const SUPPORT = DEFAULT_HANDOVER.supportPositionCodes;
const available = m=>m.working && m.employee?.active!==false && (!m.liveDay || !m.attendance || ['PRESENT','LATE','EARLY_LEAVE','UNEXPECTED_PRESENT'].includes(m.attendance.status));
function handoverWindow(data) {
 const policy=handoverConfig(data.distributions);if (!policy.enabled) return null;
 const incoming = data.team.filter(m=>available(m)&&m.shiftCode===policy.incomingShift);
 if (!incoming.length) return null;
 const startTime = data.shifts?.[policy.incomingShift]?.startTime || incoming.map(m=>m.expectedStart).filter(Boolean).sort()[0];
 if(!startTime)return null;
 return {startTime,endTime:time(minutes(startTime)+policy.breakMinutes)};
}
function rotatingAM(member, outgoingShift='AM') { return member.shiftCode===outgoingShift && !member.frontAssignment && member.employee?.department!=='CASHIER' && !(member.isShiftLeader??member.employee?.operationsTeamLeader); }
function handoverRules(data, slot, config=data.distributions) {
 const window=handoverWindow({...data,distributions:config});
 return applicableRules(config,data.positions,{workDate:data.date||data.workDate,shift:slot.shiftCode,role:data.role||'',slot}).map(entry=>{
  if(entry.excludedReason)return entry;
  const policy=handoverConfig(config);
  if(window && slot.shiftCode===policy.outgoingShift) {
   if(overlaps(window,slot))return {...entry,excludedReason:'HANDOVER_BREAK'};
   if(slot.startTime>=window.endTime && !policy.supportPositionCodes.includes(entry.position.code))return {...entry,excludedReason:'PM_HANDOVER_SUPPORT_ONLY'};
   if(slot.startTime<window.endTime && entry.rule.handoverOnly)return {...entry,excludedReason:'AFTER_HANDOVER_ONLY'};
  } else if(entry.rule.handoverOnly)return {...entry,excludedReason:'AFTER_HANDOVER_ONLY'};
  return entry;
 });
}
function handoverBreaks(data, shift='') {
 const policy=handoverConfig(data.distributions);
 const existing=(data.breaks||[]).filter(b=>shift && shift!==policy.outgoingShift || b.note!=='AUTO_PM_HANDOVER');
 const window=handoverWindow(data);
 if(!window || shift && shift!==policy.outgoingShift)return existing;
 const result=[...existing];
 for(const member of data.team.filter(m=>available(m)&&rotatingAM(m,policy.outgoingShift))) {
  if(member.expectedStart && window.startTime<member.expectedStart || member.expectedEnd && window.endTime>member.expectedEnd)continue;
  let gaps=[[minutes(window.startTime),minutes(window.endTime)]];
  for(const b of existing.filter(b=>b.employeeId===member.employeeId && b.status!=='CANCELLED')) {
   const start=minutes(b.startTime),end=minutes(b.endTime);
   gaps=gaps.flatMap(([a,z])=>end<=a||start>=z?[[a,z]]:[[a,Math.min(z,start)],[Math.max(a,end),z]].filter(([x,y])=>x<y));
  }
  for(const [start,end] of gaps)result.push({employeeId:member.employeeId,startTime:time(start),endTime:time(end),status:'PLANNED',note:'AUTO_PM_HANDOVER'});
 }
 return result;
}
function dataExitBlocked(data, position, assignments, slot, entries) {
 if(!data.distributions?.coverageBeforeDataExit)return false;
 const pair=data.distributions.coveragePairCodes||['DATA','EXIT'];
 const parts=components(position),other=parts.includes(pair[0])?pair[1]:parts.includes(pair[1])?pair[0]:null;
 if(!other)return false;
 // Include active rules from every overlapping shift. Compound allocations cover
 // their two physical locations; partial-hour coverage must not count as a full hour.
 const rows=assignments.filter(a=>overlaps(a,slot));
 const boundaries=[slot.startTime,...new Set(rows.flatMap(a=>[a.startTime,a.endTime]).filter(t=>t>slot.startTime&&t<slot.endTime))];
 return boundaries.some(t=>{
  const active=rows.filter(a=>a.startTime<=t&&a.endTime>t);
  if(!active.some(a=>components(assignmentPosition(a,data.positions)).includes(other)))return false;
  const shifts=[...new Set(data.team.filter(m=>available(m)&&(!m.expectedStart||m.expectedStart<=t)&&(!m.expectedEnd||m.expectedEnd>t)).map(m=>m.shiftCode))];
  const core=shifts.flatMap(shiftCode=>handoverRules(data,{...slot,shiftCode,startTime:t})).filter(e=>!e.excludedReason && e.position && !pair.some(code=>components(e.position).includes(code)) && e.position.code!=='CASHIER' && components(e.position).length===1 && e.rule.max>0 && Math.max(e.rule.min,e.rule.target)>0);
  return core.some(e=>active.filter(a=>coversPosition(a,e.position,data.positions)).length<Math.max(e.rule.min,e.rule.target));
 });
}
function policyConflicts(data, assignments, breaks, slots) {
 const conflicts=[];
 for(const slot of slots) {
  const entries=handoverRules(data,slot);
  for(const a of assignments.filter(a=>(a.shiftCode||data.team.find(m=>m.employeeId===a.employeeId)?.shiftCode)===slot.shiftCode && overlaps(a,slot))) {
   const member=data.team.find(m=>m.employeeId===a.employeeId),p=assignmentPosition(a,data.positions);
   if(handoverWindow(data) && breaks.some(b=>b.employeeId===a.employeeId && b.status!=='CANCELLED' && overlaps(b,slot)))conflicts.push({code:'HANDOVER_BREAK_CONFLICT',employeeId:a.employeeId,startTime:slot.startTime});
   if(member && rotatingAM(member,handoverConfig(data.distributions).outgoingShift) && handoverWindow(data) && slot.startTime>=handoverWindow(data).endTime && !handoverConfig(data.distributions).supportPositionCodes.includes(p?.code))conflicts.push({code:'HANDOVER_SUPPORT_CONFLICT',employeeId:a.employeeId,startTime:slot.startTime});
   if(dataExitBlocked(data,p,assignments,slot,entries))conflicts.push({code:'DATA_EXIT_COVERAGE_CONFLICT',employeeId:a.employeeId,startTime:slot.startTime});
  }
 }
 return conflicts;
}
module.exports={SUPPORT,handoverWindow,handoverRules,handoverBreaks,rotatingAM,dataExitBlocked,policyConflicts};
