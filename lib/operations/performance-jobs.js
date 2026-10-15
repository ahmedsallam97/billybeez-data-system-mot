const {randomUUID}=require('node:crypto');
const {operationsBranch,employeeBranchFilter}=require('./business-access');
const {getEffectivePerformanceSettings}=require('./performance-settings-service');
const {suitabilityInput}=require('./performance-sources');
const {calculateAndStoreSuitability}=require('./operational-report-service');
const {calculateAndStoreAppraisal}=require('./appraisal-calculation');
const {syncMonthlySummaries}=require('./employee-of-month');
const KEY='OPS_PERFORMANCE_JOB:';
function scheduleBucket(schedule,date){
  if(schedule==='DAILY')return date;
  if(schedule==='MONTHLY')return date.slice(0,7);
  if(schedule==='WEEKLY'){const monday=new Date(date+'T00:00:00Z');monday.setUTCDate(monday.getUTCDate()-(monday.getUTCDay()+6)%7);return monday.toISOString().slice(0,10);}
  throw new Error('Scheduled recalculation must use DAILY, WEEKLY, or MONTHLY');
}
async function runPerformanceJobs(db,{user,branch,asOfDate=new Date().toISOString().slice(0,10),now=new Date(),leaseMilliseconds=30*60*1000}={}) {
  const actor=await db.user.findUnique({where:{id:user?.id}});
  if(!actor?.active||!['ADMIN','MANAGER'].includes(actor.role))throw Object.assign(new Error('Authorized management account required'),{status:403});
  branch=await operationsBranch(db,actor,branch);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(asOfDate)||new Date(asOfDate+'T00:00:00Z').toISOString().slice(0,10)!==asOfDate)throw new Error('Invalid job date');
  const leaseKey=KEY+'LEASE:'+branch,owner=randomUUID();
  const acquired=await db.$transaction(async tx=>{
    const row=await tx.systemSetting.findUnique({where:{key:leaseKey}});
    if(row&&Date.parse(JSON.parse(row.value).expiresAt)>now.getTime())return false;
    const value=JSON.stringify({owner,expiresAt:new Date(now.getTime()+leaseMilliseconds).toISOString()});
    if(!row)await tx.systemSetting.create({data:{key:leaseKey,value,updatedBy:actor.id}});
    else if((await tx.systemSetting.updateMany({where:{key:leaseKey,value:row.value},data:{value,updatedBy:actor.id}})).count!==1)return false;
    return true;
  });
  if(!acquired)return {busy:true,branch};
  const report={branch,asOfDate,startedAt:now.toISOString(),suitability:[],appraisals:[],errors:[]};
  try{
    const config=await getEffectivePerformanceSettings(db,{branch,date:asOfDate});
    const employees=await db.employee.findMany({where:{active:true,employmentStatus:'ACTIVE',department:'OPERATION',...await employeeBranchFilter(db,branch)},select:{id:true,operationsTeamLeader:true}});
    for(const employee of employees){
      // A manager may not use a background job to change their own score.
      if(actor.employeeId===employee.id)continue;
      for(const profile of config.value.suitability.filter(item=>item.active&&item.recalculation.trigger!=='MANUAL')){
        if(profile.code.endsWith('TEAM_LEADER')&&!employee.operationsTeamLeader)continue;
        const key=KEY+'SUITABILITY:'+branch+':'+employee.id+':'+profile.code;
        try{
          const input=await suitabilityInput(db,{employeeId:employee.id,branch,profileCode:profile.code,asOfDate});
          const bucket=profile.recalculation.trigger==='SCHEDULED'?scheduleBucket(profile.recalculation.schedule,asOfDate):null;
          const row=await db.systemSetting.findUnique({where:{key}}),previous=row?JSON.parse(row.value):null;
          if(profile.recalculation.trigger==='SCHEDULED'?previous?.bucket===bucket&&previous?.configurationVersion===config.version:previous?.fingerprint===input.fingerprint&&previous?.asOfDate===asOfDate)continue;
          const result=await calculateAndStoreSuitability(db,{user:actor,employeeId:employee.id,branch,profileCode:profile.code,asOfDate,idempotencyKey:key+':'+(bucket||asOfDate)+':'+input.fingerprint,reason:'Automatic recalculation from verified operational evidence'});
          const checkpoint={fingerprint:input.fingerprint,bucket,asOfDate,configurationVersion:config.version,snapshotId:result.snapshot.id,completedAt:new Date().toISOString()};
          await db.systemSetting.upsert({where:{key},create:{key,value:JSON.stringify(checkpoint),updatedBy:actor.id},update:{value:JSON.stringify(checkpoint),updatedBy:actor.id}});
          report.suitability.push(result.snapshot.id);
        }catch(e){report.errors.push({employeeId:employee.id,profile:profile.code,error:e.message});}
      }
      const dates=await db.opsEmployeeDailyEvaluation.findMany({where:{employeeId:employee.id,dailyEvaluationDay:{evaluationDate:{lte:asOfDate}}},select:{dailyEvaluationDay:{select:{evaluationDate:true}}}});
      const previous=await db.opsMonthlyAppraisal.findMany({where:{employeeId:employee.id},select:{year:true,month:true}});
      const periods=[...new Set([...dates.map(item=>item.dailyEvaluationDay.evaluationDate.slice(0,7)),...previous.map(item=>`${item.year}-${String(item.month).padStart(2,'0')}`)])];
      for(const period of periods){try{
        const [year,month]=period.split('-').map(Number);
        const result=await syncMonthlySummaries(db,{user:actor,branch,employeeIds:[employee.id],year,month,reason:'Automatic appraisal recalculation after source changes'});
        report.appraisals.push(...result.changes.map(row=>row.appraisalId).filter(Boolean));
        report.errors.push(...result.errors);
      }catch(e){report.errors.push({employeeId:employee.id,period,error:e.message});}}
    }
    report.completedAt=new Date().toISOString();
    await db.systemSetting.upsert({where:{key:KEY+'LAST:'+branch},create:{key:KEY+'LAST:'+branch,value:JSON.stringify(report),updatedBy:actor.id},update:{value:JSON.stringify(report),updatedBy:actor.id}});
    await db.auditLog.create({data:{action:'OPS_PERFORMANCE_JOBS_COMPLETED',userId:actor.id,summary:'Completed configured performance recalculation',metadata:JSON.stringify(report)}});
    return report;
  }finally{
    const row=await db.systemSetting.findUnique({where:{key:leaseKey}});
    if(row&&JSON.parse(row.value).owner===owner)await db.systemSetting.updateMany({where:{key:leaseKey,value:row.value},data:{value:JSON.stringify({owner:null,expiresAt:new Date(0).toISOString()})}});
  }
}
module.exports={scheduleBucket,runPerformanceJobs};
