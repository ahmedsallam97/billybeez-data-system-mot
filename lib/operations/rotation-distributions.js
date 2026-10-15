const PREFIX='OPS_SHIFT_DISTRIBUTIONS:';
const SHIFTS=['AM','PM','BW'];
const DEFAULT_HANDOVER={enabled:false,outgoingShift:'AM',incomingShift:'PM',breakMinutes:60,supportPositionCodes:['TOWER','ENTRANCE','EXIT']};
function handoverConfig(config){return {...DEFAULT_HANDOVER,...config?.handover};}
function shiftPolicy(config,shift){return {preferCombinedWhenShortStaffed:config?.shiftPolicies?.[shift]?.preferCombinedWhenShortStaffed??(shift==='PM'&&config?.preferCombinedWhenShortStaffed!==false)};}
function locationExclusion(position,positions=[]){
 if(!position||position.active===false)return 'ARCHIVED';
 // An explicitly zeroed catalog location is excluded even if an older saved
 // shift draft still has a positive rank for it.
 if(position.sortOrder!=null&&Number(position.sortOrder)<=0)return 'PRIORITY_ZERO';
 const {components,isCombined}=require('./rotation-locations');
 if(isCombined(position))for(const code of components(position)){
  const part=positions.find(row=>row.code===code);
  if(!part||part.active===false)return 'COMPONENT_ARCHIVED';
  if(part.sortOrder!=null&&Number(part.sortOrder)<=0)return 'COMPONENT_PRIORITY_ZERO';
 }
 return null;
}
const validDate=value=>!value||/^\d{4}-\d{2}-\d{2}$/.test(value)&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
function migrateLegacy(positions,branch,legacy={}) {
 const ordered=[...positions].sort((a,b)=>Number(a.sortOrder)-Number(b.sortOrder)||a.code.localeCompare(b.code));
 const rules=SHIFTS.flatMap(shift=>{let rank=0;return ordered.map(position=>{
  const requirement=[...(position.staffingRequirements||[])].filter(r=>r.shiftCode===shift).sort((a,b)=>b.effectiveFrom.localeCompare(a.effectiveFrom))[0];
  const enabled=!locationExclusion(position,positions)&&Boolean(requirement);
  const min=Number(requirement?.minEmployees||0);
  return {id:`legacy:${shift}:${position.id}`,positionId:position.id,shift,enabled,rank:enabled?++rank:0,required:Boolean(position.critical||(legacy.mandatoryPositionCodes||[]).includes(position.code)),min,target:Math.max(min,1),max:Math.max(min,1),roles:[],qualificationRequired:position.requiresQualification!==false,effectiveFrom:requirement?.effectiveFrom==='2000-01-01'?null:requirement?.effectiveFrom||null,effectiveTo:requirement?.effectiveTo||null,weekdays:[],startTime:requirement?.startTime||null,endTime:requirement?.endTime||null,legacyPriority:position.sortOrder};
 });});
 return {schemaVersion:1,branch,revision:0,status:'DRAFT',allowDisabledManualAssignments:false,rules,source:'LEGACY_PREVIEW',migration:{order:'Ascending positive legacy priority; ties by code. Priority zero is disabled. CASHIER remains a fixed front assignment.',priorities:ordered.map(p=>({code:p.code,priority:p.sortOrder})),baselineDatesRemoved:true}};
}
function validateDistributions(value,positions,branch){
 if(!value||typeof value!=='object'||value.branch!==branch||value.schemaVersion!==1||!Array.isArray(value.rules)||value.rules.length>300)throw new Error('Invalid shift distribution configuration / إعداد توزيعات غير صالح');
 const ids=new Set(),locations=new Set(),positionsById=new Map(positions.map(p=>[p.id,p]));
 const rules=value.rules.map(raw=>{
  if(!raw.id||ids.has(raw.id)||!positionsById.has(raw.positionId)||!SHIFTS.includes(raw.shift))throw new Error('Invalid or duplicate distribution / توزيع مكرر أو غير صالح');ids.add(raw.id);
  const location=raw.shift+':'+raw.positionId;if(locations.has(location))throw new Error('Use one distribution per location and shift; select its allowed roles / استخدم توزيعًا واحدًا لكل موقع وشيفت');locations.add(location);
  for(const key of ['rank','min','target','max'])if(!Number.isInteger(Number(raw[key]))||Number(raw[key])<0||Number(raw[key])>1000)throw new Error('Coverage and rank must be non-negative whole numbers / التغطية والترتيب أرقام صحيحة');
  if(raw.min>raw.target||raw.target>raw.max)throw new Error('Minimum ≤ target ≤ maximum is required / الحد الأدنى ≤ المستهدف ≤ الحد الأقصى');
  if(require('./rotation-locations').isCombined(positionsById.get(raw.positionId))&&Number(raw.max)>1)throw new Error('A combined location has one employee maximum / التوزيع المركّب لموظف واحد كحد أقصى');
  if(!validDate(raw.effectiveFrom)||!validDate(raw.effectiveTo)||raw.effectiveFrom&&raw.effectiveTo&&raw.effectiveFrom>raw.effectiveTo)throw new Error('Invalid effective date range / فترة سريان غير صالحة');
  if(!Array.isArray(raw.roles)||raw.roles.some(r=>typeof r!=='string'||!r.trim()||r.length>120)||!Array.isArray(raw.weekdays)||raw.weekdays.some(d=>!Number.isInteger(d)||d<0||d>6))throw new Error('Invalid roles or weekdays / الوظائف أو أيام الأسبوع غير صالحة');
  if((raw.startTime||raw.endTime)&&(!/^([01]\d|2[0-3]):[0-5]\d$/.test(raw.startTime)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(raw.endTime)||raw.startTime>=raw.endTime))throw new Error('Invalid distribution time window');
  return {id:String(raw.id),positionId:raw.positionId,shift:raw.shift,enabled:raw.enabled===true&&Number(raw.rank)>0,rank:Number(raw.rank),required:raw.required===true,min:Number(raw.min),target:Number(raw.target),max:Number(raw.max),roles:[...new Set(raw.roles.map(r=>r.trim()))],qualificationRequired:raw.qualificationRequired===true,effectiveFrom:raw.effectiveFrom||null,effectiveTo:raw.effectiveTo||null,weekdays:[...new Set(raw.weekdays)],startTime:raw.startTime||null,endTime:raw.endTime||null,handoverOnly:raw.handoverOnly===true,...(raw.legacyPriority!=null?{legacyPriority:raw.legacyPriority}:{})};
 });
 const handover={...handoverConfig(value),supportPositionCodes:value.handover?.supportPositionCodes||DEFAULT_HANDOVER.supportPositionCodes.filter(code=>positions.some(p=>p.code===code))};
 if(!SHIFTS.includes(handover.outgoingShift)||!SHIFTS.includes(handover.incomingShift)||handover.outgoingShift===handover.incomingShift||!Number.isInteger(handover.breakMinutes)||handover.breakMinutes<1||handover.breakMinutes>180||!Array.isArray(handover.supportPositionCodes)||handover.supportPositionCodes.some(code=>!positions.some(p=>p.code===code)))throw new Error('Invalid handover shifts, break duration or support locations');
 const coveragePairCodes=value.coveragePairCodes||['DATA','EXIT'];
 if(!Array.isArray(coveragePairCodes)||coveragePairCodes.length!==2||new Set(coveragePairCodes).size!==2||coveragePairCodes.some(code=>typeof code!=='string')||value.coverageBeforeDataExit===true&&coveragePairCodes.some(code=>!positions.some(p=>p.code===code)))throw new Error('Select two distinct locations for the coverage restriction');
 return {schemaVersion:1,branch,allowDisabledManualAssignments:value.allowDisabledManualAssignments===true,preferCombinedWhenShortStaffed:value.preferCombinedWhenShortStaffed!==false,shiftPolicies:Object.fromEntries(SHIFTS.map(shift=>[shift,shiftPolicy(value,shift)])),handover:{...handover,enabled:handover.enabled===true},coverageBeforeDataExit:value.coverageBeforeDataExit===true,coveragePairCodes,rules,migration:value.migration||null};
}
async function loadDistributions(db,{branch,positions,legacy={},defaultBranch='MOT'}){
 const row=await db.systemSetting.findUnique({where:{key:PREFIX+branch}});
 if(row){let value;try{value=JSON.parse(row.value);}catch{throw new Error('Stored distribution configuration is invalid');}return {...validateDistributions(value,positions,branch),revision:Number(value.revision),status:'DRAFT',source:'SAVED_DRAFT',updatedAt:value.updatedAt};}
 return branch===defaultBranch?migrateLegacy(positions,branch,legacy):{schemaVersion:1,branch,revision:0,status:'DRAFT',source:'NO_BRANCH_RULES',allowDisabledManualAssignments:false,rules:[]};
}
async function saveDistributions(db,{user,branch,positions,value,expectedRevision}){
 const normalized=validateDistributions(value,positions,branch);
 return db.$transaction(async tx=>{
  const key=PREFIX+branch,row=await tx.systemSetting.findUnique({where:{key}}),previous=row?JSON.parse(row.value):null;
  if(Number(expectedRevision)!==Number(previous?.revision||0))throw Object.assign(new Error('Distribution settings changed. Reload before saving / الإعدادات تغيرت؛ أعد التحميل قبل الحفظ'),{status:409});
  const next={...normalized,revision:Number(previous?.revision||0)+1,status:'DRAFT',updatedAt:new Date().toISOString(),updatedBy:user.id};
  if(row){const changed=await tx.systemSetting.updateMany({where:{key,value:row.value},data:{value:JSON.stringify(next),updatedBy:user.id}});if(changed.count!==1)throw Object.assign(new Error('Concurrent configuration change'),{status:409});}
  else await tx.systemSetting.create({data:{key,value:JSON.stringify(next),updatedBy:user.id}});
  await tx.auditLog.create({data:{action:'OPS_SHIFT_DISTRIBUTIONS_SAVED',userId:user.id,summary:`Saved ${branch} shift distribution draft revision ${next.revision}`,metadata:JSON.stringify({branch,before:previous,after:next,doesNotChangeExistingRosters:true})}});
  return {...next,source:'SAVED_DRAFT'};
 });
}
function applicableRules(config,positions,{workDate,shift,role='',slot=null}){
 const weekday=new Date(workDate+'T00:00:00Z').getUTCDay(),map=new Map(positions.map(p=>[p.id,p]));
 return (config.rules||[]).filter(r=>r.shift===shift).map(rule=>{
  const position=map.get(rule.positionId);let excludedReason=null;
  if(locationExclusion(position,positions))excludedReason=locationExclusion(position,positions);
  else if(!rule.enabled||rule.rank<=0)excludedReason='DISABLED';
  else if(rule.effectiveFrom&&workDate<rule.effectiveFrom||rule.effectiveTo&&workDate>rule.effectiveTo)excludedReason='OUTSIDE_DATES';
  else if(rule.weekdays.length&&!rule.weekdays.includes(weekday))excludedReason='WEEKDAY';
  else if(role&&rule.roles.length&&!rule.roles.includes(role))excludedReason='ROLE';
  else if(slot&&rule.startTime&&(slot.startTime<rule.startTime||slot.endTime>rule.endTime))excludedReason='TIME_WINDOW';
  return {rule,position,excludedReason};
 }).sort((a,b)=>a.rule.rank-b.rule.rank||a.rule.id.localeCompare(b.rule.id));
}
function protectedAssignments(assignments,team){
 const shifts=new Map(team.map(m=>[m.employeeId,m.shiftCode]));
 return assignments.filter(a=>a.manualLock||a.source==='MANUAL').map(a=>({...a,shiftCode:a.shiftCode||shifts.get(a.employeeId)}));
}
function assertCanApply({day,plan,confirmed,previewFingerprint,currentFingerprint,reason}){
 if(!confirmed||!previewFingerprint)throw Object.assign(new Error('Preview and explicit confirmation are required / المعاينة والتأكيد مطلوبان'),{status:409});
 if(previewFingerprint!==currentFingerprint)throw Object.assign(new Error('Roster inputs changed after preview. Preview again / تغيرت بيانات الروستر؛ أعد المعاينة'),{status:409});
 if(day&&!['OPEN','REOPENED'].includes(day.status)||plan&&!['DRAFT','ACTIVE'].includes(plan.status))throw Object.assign(new Error('Historical or closed roster cannot be regenerated / الروستر التاريخي أو المغلق محمي'),{status:409});
 if(String(reason||'').trim().length<5)throw new Error('A documented regeneration reason is required / سبب موثق لإعادة التوليد مطلوب');
}
module.exports={PREFIX,SHIFTS,DEFAULT_HANDOVER,handoverConfig,shiftPolicy,locationExclusion,migrateLegacy,validateDistributions,loadDistributions,saveDistributions,applicableRules,protectedAssignments,assertCanApply};
