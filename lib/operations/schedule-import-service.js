const {randomUUID,createHash}=require('node:crypto');
const {writeEmployeeFile,readEmployeeFile,deleteEmployeeFile}=require('../employee-file-storage');
const {ScheduleInputError}=require('./schedule-input');
const {configuredCodes,parseWorkbook,planImport}=require('./schedule-import');
const {assertScheduleBranch,scheduleEmployees,fingerprint,writeScheduleState}=require('./schedule-state');
const hash=value=>createHash('sha256').update(value).digest('hex');
const importKey=id=>`OPS_SCHEDULE_IMPORT:${id}`;
const snapshotKey=id=>`OPS_SCHEDULE_SNAPSHOT:${id}`;
async function audit(tx,user,action,metadata){await tx.auditLog.create({data:{action,userId:user.id,summary:action.replaceAll('_',' '),metadata:JSON.stringify(metadata)}});}
async function inputs(db,id,branch){
  const schedule=await db.opsSchedule.findUnique({where:{id},include:{assignments:true}});
  if(!schedule)throw new ScheduleInputError('Schedule not found',404);
  if(schedule.status!=='DRAFT')throw new ScheduleInputError('Only a draft can be imported or restored',409);
  const previous=await assertScheduleBranch(db,schedule,branch);
  const [employees,codes]=await Promise.all([scheduleEmployees(db,branch),configuredCodes(db)]);
  return {schedule,previous,employees,codes,branch};
}
async function dryRun(db,user,{scheduleId,branch,buffer,fileName,mode,overwriteLocked}){
  const input=await inputs(db,scheduleId,branch);
  if(overwriteLocked && !['ADMIN','MANAGER'].includes(user.role))throw new ScheduleInputError('Locked-cell replacement permission denied',403);
  let sheets;try{sheets=await parseWorkbook(buffer);}catch(error){throw new ScheduleInputError(error.message);}
  const plan=planImport({...input,sheets,mode,overwriteLocked});
  const id=randomUUID(),storageKey=`schedule-imports/${id}.xlsx`;
  await writeEmployeeFile(storageKey,buffer,'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  try{
    const record={id,scheduleId,branch,ownerId:user.id,storageKey,fileName:String(fileName).slice(0,180),sizeBytes:buffer.length,sha256:hash(buffer),createdAt:new Date().toISOString(),expiresAt:new Date(Date.now()+60*60*1000).toISOString(),status:'PREVIEW',fingerprint:fingerprint(input.schedule,input.previous.state),plan};
    await db.$transaction(async tx=>{
      await tx.systemSetting.create({data:{key:importKey(id),value:JSON.stringify(record),updatedBy:user.id}});
      await audit(tx,user,'OPS_SCHEDULE_IMPORT_PREVIEWED',{id,scheduleId,branch,fileName:record.fileName,sha256:record.sha256,counts:plan.counts,errors:plan.errors});
    });
    return {...plan,importId:id,fileName:record.fileName};
  }catch(error){await deleteEmployeeFile(storageKey).catch(()=>{});throw error;}
}
async function importRecord(db,id){
  const row=await db.systemSetting.findUnique({where:{key:importKey(id)}});
  if(!row)throw new ScheduleInputError('Import preview not found',404);
  return {row,record:JSON.parse(row.value)};
}
async function applyImport(db,user,{importId,branch,confirmReplace,confirmLocked}){
  const {record}=await importRecord(db,importId);
  if(record.ownerId!==user.id||record.branch!==branch)throw new ScheduleInputError('Import preview access denied',403);
  if(!record.plan.valid)throw new ScheduleInputError('Fix workbook validation errors before importing');
  if(record.status!=='PREVIEW'||record.expiresAt<new Date().toISOString())throw new ScheduleInputError('Import preview expired or already applied. Upload again.',409);
  if(record.plan.mode==='replace'&&confirmReplace!==true)throw new ScheduleInputError('Explicit replacement confirmation required');
  if(record.plan.overwriteLocked&&(!['ADMIN','MANAGER'].includes(user.role)||confirmLocked!==true))throw new ScheduleInputError('Explicit locked-cell replacement permission and confirmation required',403);
  const buffer=await readEmployeeFile(record.storageKey);
  if(hash(buffer)!==record.sha256)throw new ScheduleInputError('Stored source file verification failed',409);
  const sheets=await parseWorkbook(buffer);
  return db.$transaction(async tx=>{
    const latest=await importRecord(tx,importId);
    if(latest.record.status!=='PREVIEW')throw new ScheduleInputError('Import already applied',409);
    const input=await inputs(tx,record.scheduleId,branch);
    if(fingerprint(input.schedule,input.previous.state)!==record.fingerprint)throw new ScheduleInputError('Schedule changed after preview. Upload again to review current changes.',409);
    const plan=planImport({...input,sheets,mode:record.plan.mode,overwriteLocked:record.plan.overwriteLocked});
    if(!plan.valid||hash(JSON.stringify(plan))!==hash(JSON.stringify(record.plan)))throw new ScheduleInputError('Employees or codes changed after preview. Upload again.',409);
    const snapshotId=randomUUID();
    await tx.systemSetting.create({data:{key:snapshotKey(snapshotId),value:JSON.stringify({id:snapshotId,scheduleId:input.schedule.id,branch,createdAt:new Date().toISOString(),createdBy:user.id,importId,assignments:input.schedule.assignments,state:input.previous.state}),updatedBy:user.id}});
    for(const change of plan.changes.filter(item=>['created','updated'].includes(item.action))){
      const where={scheduleId_employeeId_workDate:{scheduleId:input.schedule.id,employeeId:change.employeeId,workDate:change.workDate}};
      if(!change.data)await tx.opsScheduleAssignment.deleteMany({where:where.scheduleId_employeeId_workDate});
      else await tx.opsScheduleAssignment.upsert({where,create:{...where.scheduleId_employeeId_workDate,...change.data,manualLock:change.locked,source:'IMPORT'},update:{...change.data,source:'IMPORT'}});
    }
    const state=await writeScheduleState(tx,input.schedule.id,input.previous,input.previous.state,user.id);
    const applied={...latest.record,status:'APPLIED',appliedAt:new Date().toISOString(),snapshotId};
    const result=await tx.systemSetting.updateMany({where:{key:latest.row.key,value:latest.row.value},data:{value:JSON.stringify(applied),updatedBy:user.id}});
    if(result.count!==1)throw new ScheduleInputError('Import changed while applying',409);
    await audit(tx,user,'OPS_SCHEDULE_IMPORTED',{importId,snapshotId,scheduleId:input.schedule.id,branch,mode:plan.mode,overwriteLocked:plan.overwriteLocked,counts:plan.counts,fileName:record.fileName,sha256:record.sha256});
    return {...plan,importId,snapshotId,state};
  },{timeout:60000});
}
async function restoreSnapshot(db,user,{snapshotId,scheduleId,branch,expectedRevision,confirmed}){
  if(confirmed!==true)throw new ScheduleInputError('Explicit snapshot restoration confirmation required');
  return db.$transaction(async tx=>{
    const input=await inputs(tx,scheduleId,branch);
    if(expectedRevision!==input.previous.state.revision)throw new ScheduleInputError('Schedule changed. Reload before restoring.',409);
    const row=await tx.systemSetting.findUnique({where:{key:snapshotKey(snapshotId)}});
    const snapshot=row?JSON.parse(row.value):null;
    if(!snapshot||snapshot.scheduleId!==scheduleId||snapshot.branch!==branch)throw new ScheduleInputError('Snapshot not found in this draft',404);
    const undoId=randomUUID();await tx.systemSetting.create({data:{key:snapshotKey(undoId),value:JSON.stringify({id:undoId,scheduleId,branch,createdAt:new Date().toISOString(),createdBy:user.id,assignments:input.schedule.assignments,state:input.previous.state}),updatedBy:user.id}});
    await tx.opsScheduleAssignment.deleteMany({where:{scheduleId}});
    if(snapshot.assignments.length)await tx.opsScheduleAssignment.createMany({data:snapshot.assignments.map(({sourceId,...assignment})=>assignment)});
    const state=await writeScheduleState(tx,scheduleId,input.previous,{...snapshot.state,revision:input.previous.state.revision},user.id);
    await audit(tx,user,'OPS_SCHEDULE_IMPORT_RESTORED',{scheduleId,snapshotId,undoId,branch});return {state,undoId};
  },{timeout:60000});
}
module.exports={dryRun,applyImport,restoreSnapshot,importRecord,inputs};
