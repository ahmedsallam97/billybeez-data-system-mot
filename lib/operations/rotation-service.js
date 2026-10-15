const {generateRotation,normalizeRotationRules}=require('./live-daily');
const {protectedAssignments,assertCanApply}=require('./rotation-distributions');
const {handoverBreaks}=require('./rotation-handover');
const {createHash}=require('node:crypto');
const fingerprint=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
function hourlySlots(shifts,team=[],limit=8){
 const minutes=time=>Number(time.slice(0,2))*60+Number(time.slice(3));const time=value=>String(Math.floor(value/60)).padStart(2,'0')+':'+String(value%60).padStart(2,'0');
 return ['AM','PM','BW'].flatMap(shiftCode=>{const shift=shifts[shiftCode];if(!shift?.startTime||!shift?.endTime||!team.some(m=>m.working&&m.shiftCode===shiftCode))return [];const start=minutes(shift.startTime),end=minutes(shift.endTime);if(end<=start)return [];return Array.from({length:Math.min(Math.ceil((end-start)/60),Math.max(1,Number(limit)||8))},(_,index)=>({shiftCode,startTime:time(start+index*60),endTime:time(Math.min(end,start+(index+1)*60))}));});
}
function rotationPreview(data,{distributions=data.distributions,shift='',role='',replaceManual=false,rules=data.rotationRules||{}}={}){
 if(replaceManual)throw Object.assign(new Error('Manual and locked assignments are protected. Edit those cells explicitly; generation cannot replace them.'),{status:422});
 const options=normalizeRotationRules(rules);
 const selected=m=>(!shift||m.shiftCode===shift)&&(!role||[m.employee?.jobTitle,m.employee?.department].includes(role));
 const untouched=(data.assignments||[]).filter(a=>!selected(data.team.find(m=>m.employeeId===a.employeeId)||{}));
 const fixed=[...untouched,...protectedAssignments((data.assignments||[]).filter(a=>!untouched.includes(a)),data.team,{replaceManual})].map(a=>({...a,shiftCode:a.shiftCode||data.team.find(m=>m.employeeId===a.employeeId)?.shiftCode}));
 const slots=hourlySlots(data.shifts,data.team,options.slotsPerShift).filter(s=>!shift||s.shiftCode===shift);
 const breaks=handoverBreaks({...data,distributions},shift);
 const generated=generateRotation({workDate:data.date,branch:data.branch,shifts:data.shifts,team:data.team,positions:data.positions,qualifications:data.qualifications,breaks,slots,rules:options,distributions,fixedAssignments:fixed,role});
 const inputs={date:data.date,branch:data.branch,shift,role,replaceManual,distributions,options,team:data.team,qualifications:data.qualifications,positions:data.positions,breaks:data.breaks,assignments:data.assignments,schedule:data.schedule?{id:data.schedule.id,version:data.schedule.version,status:data.schedule.status}:null,day:data.day?{id:data.day.id,status:data.day.status,version:data.day.version}:null,plan:data.plan?{id:data.plan.id,version:data.plan.version,status:data.plan.status}:null};
 const sourceFingerprint=fingerprint({...inputs,shifts:data.shifts});
 return {...generated,breaks,sourceFingerprint,date:data.date,branch:data.branch,shift,role,replaceManual,slots,distributions,protectedCount:fixed.length,canApply:Boolean(data.schedule)&&(!data.day||['OPEN','REOPENED'].includes(data.day.status))&&(!data.plan||['ACTIVE','DRAFT'].includes(data.plan.status)),schedule:data.schedule?{id:data.schedule.id,version:data.schedule.version,status:data.schedule.status}:null,employees:data.team.map(m=>({id:m.employeeId,name:m.employee?.operationalName||m.employee?.name,shift:m.shiftCode,role:m.employee?.jobTitle})),locations:data.positions.map(p=>({id:p.id,code:p.code,label:p.label,labelAr:p.labelAr,color:p.color}))};
}
async function applyRotation(db,{user,date,branch,shift='',role='',replaceManual=false,confirmed,previewFingerprint,reason,loadDaily}){
 return db.$transaction(async tx=>{
  const data=await loadDaily(date,branch,tx),preview=rotationPreview(data,{shift,role,replaceManual});
  assertCanApply({day:data.day,plan:data.plan,confirmed,previewFingerprint,currentFingerprint:preview.sourceFingerprint,reason});
  if(!data.schedule)throw new Error('Published monthly schedule required');
  if(preview.alerts.some(a=>a.code==='PHYSICAL_LOCATION_CONFLICT'))throw Object.assign(new Error('Protected assignments share a physical location. Resolve the conflict before applying / تكليفات محمية تشترك في نفس المكان؛ عالج التعارض أولًا'),{status:422});
  if(preview.alerts.some(a=>['HANDOVER_BREAK_CONFLICT','HANDOVER_SUPPORT_CONFLICT','DATA_EXIT_COVERAGE_CONFLICT'].includes(a.code)))throw Object.assign(new Error('Protected assignments conflict with the handover or Data/Exit policy. Review and explicitly edit the protected cells before generating.'),{status:422});
  if(!preview.assignments.some(a=>a.source==='AUTO'&&!a.preserved))throw Object.assign(new Error('No automatic assignments are possible. Review staffing conflicts; the previous roster is preserved / لا توجد تكليفات آلية ممكنة؛ راجع تعارضات التغطية'),{status:422});
  const day=data.day||await tx.opsOperationsDay.create({data:{workDate:date,branch}});
  const previous=data.day?.rotationPlans?.[0],version=(previous?.version||0)+1;
  await tx.opsRotationPlan.updateMany({where:{operationsDayId:day.id,status:{in:['DRAFT','ACTIVE']}},data:{status:'SUPERSEDED'}});
  const plan=await tx.opsRotationPlan.create({data:{operationsDayId:day.id,branch,version,status:'ACTIVE',generatedBy:user.id,generatedAt:new Date(),generationSnapshotJson:JSON.stringify({schemaVersion:1,sourceFingerprint:preview.sourceFingerprint,distributions:preview.distributions,alerts:preview.alerts,coverage:preview.coverage,unassigned:preview.unassigned,excluded:preview.excluded,slots:preview.slots,breaks:preview.breaks,reason,shift,role,replaceManual,previousPlanId:data.plan?.id,protectedCount:preview.protectedCount}),breaks:{create:preview.breaks.map(b=>({employeeId:b.employeeId,startTime:b.startTime,endTime:b.endTime,status:b.status,note:b.note,createdBy:b.createdBy,updatedBy:user.id}))},assignments:{create:preview.assignments.map(a=>({employeeId:a.employeeId,operationalPositionId:a.operationalPositionId,startTime:a.startTime,endTime:a.endTime,source:a.source==='MANUAL'?'MANUAL':'AUTO',manualLock:Boolean(a.manualLock),overrideReason:a.overrideReason||null,createdBy:user.id,updatedBy:user.id}))}},include:{assignments:true}});
  await tx.auditLog.create({data:{action:'OPS_ROTATION_GENERATED',userId:user.id,summary:`Confirmed rotation ${branch} ${date} version ${version}`,metadata:JSON.stringify({branch,date,oldPlanId:data.plan?.id,newPlanId:plan.id,previewFingerprint,configurationRevision:preview.distributions.revision,protectedCount:preview.protectedCount,assignmentCount:plan.assignments.length,alerts:preview.alerts,replaceManual,reason,monthlyScheduleUnchanged:true})}});
  return {plan,alerts:preview.alerts,preview,day};
 });
}
module.exports={hourlySlots,rotationPreview,applyRotation};

