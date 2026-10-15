const {KEY:BASELINE_KEY}=require('./current-employee-qualifications');
const {PREFIX,SHIFTS,validateDistributions,migrateLegacy}=require('./rotation-distributions');
const KEY='OPS_PM_HANDOVER_V1:';

// Explicit setup only: this is never called during login or employee creation.
async function configureHandover(db,{branch='MOT',userId,backupReference}) {
 return db.$transaction(async tx=>{
  const previous=await tx.systemSetting.findUnique({where:{key:KEY+branch}});
  if(previous)return {applied:false,...JSON.parse(previous.value)};
  const baseline=await tx.systemSetting.findUnique({where:{key:BASELINE_KEY}});
  if(!baseline)throw new Error('Existing-employee qualification baseline is required');
  const entrance=await tx.opsOperationalPosition.upsert({where:{code:'ENTRANCE'},create:{code:'ENTRANCE',label:'Entrance',labelAr:'المدخل',active:true,requiresQualification:true,sortOrder:100},update:{}});
  const employees=await tx.employee.findMany({where:{id:{in:JSON.parse(baseline.value).employeeIds},active:true},select:{id:true}});
  for(const employee of employees)await tx.employeeQualification.upsert({where:{employeeId_operationalPositionId:{employeeId:employee.id,operationalPositionId:entrance.id}},create:{employeeId:employee.id,operationalPositionId:entrance.id,status:'QUALIFIED',notes:'Entrance qualification extended from the approved existing-employee baseline.',createdBy:userId},update:{}});
  const positions=await tx.opsOperationalPosition.findMany({include:{staffingRequirements:true}});
  const setting=await tx.systemSetting.findUnique({where:{key:PREFIX+branch}});
  const config=setting?JSON.parse(setting.value):migrateLegacy(positions,branch);
  let rules=config.rules;
  for(const code of ['TOWER','ENTRANCE']){
   const position=positions.find(p=>p.code===code);if(!position)continue;
   const old=rules.find(r=>r.positionId===position.id&&r.shift==='AM');
   const rank=old?.rank>0?old.rank:Math.max(0,...rules.filter(r=>r.shift==='AM').map(r=>r.rank))+1;
   const rule={id:old?.id||`handover:AM:${position.id}`,positionId:position.id,shift:'AM',enabled:true,rank,required:false,min:0,target:1,max:1,roles:[],qualificationRequired:true,effectiveFrom:null,effectiveTo:null,weekdays:[],startTime:null,endTime:null,handoverOnly:true};
   rules=old?rules.map(r=>r.id===old.id?rule:r):[...rules,rule];
  }
  for(const shift of SHIFTS.filter(s=>s!=='AM'))if(!rules.some(r=>r.shift===shift&&r.positionId===entrance.id))rules=[...rules,{id:`handover:${shift}:${entrance.id}`,positionId:entrance.id,shift,enabled:false,rank:0,required:false,min:0,target:1,max:1,roles:[],qualificationRequired:true,effectiveFrom:null,effectiveTo:null,weekdays:[],startTime:null,endTime:null}];
  const normalized=validateDistributions({...config,rules,handover:{enabled:true,breakMinutes:60},coverageBeforeDataExit:true},positions,branch);
  const next={...normalized,revision:Number(config.revision||0)+1,status:'DRAFT',updatedAt:new Date().toISOString(),updatedBy:userId};
  await tx.systemSetting.upsert({where:{key:PREFIX+branch},create:{key:PREFIX+branch,value:JSON.stringify(next),updatedBy:userId},update:{value:JSON.stringify(next),updatedBy:userId}});
  const record={branch,entranceId:entrance.id,employeeIds:employees.map(e=>e.id),configurationRevision:next.revision,backupReference,configuredAt:new Date().toISOString()};
  await tx.systemSetting.create({data:{key:KEY+branch,value:JSON.stringify(record),updatedBy:userId}});
  await tx.auditLog.create({data:{action:'OPS_PM_HANDOVER_CONFIGURED',userId,summary:`Configured one-hour AM handover break and support locations for ${branch}`,metadata:JSON.stringify({...record,existingRostersPreserved:true,newEmployeesRequireQualification:true})}});
  return {applied:true,...record};
 },{timeout:30000});
}
module.exports={KEY,configureHandover};
