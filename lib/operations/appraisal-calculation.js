const { capturePerformanceSettingsSnapshot } = require('./performance-settings-service');
const { assertBusinessRole } = require('./business-access');
const {previewMonthlyAppraisal,periodDates}=require('./monthly-summary');
async function calculateAndStoreAppraisal(db,{user,branch,employeeId,year,month,reason,automatic=false}) {
  if(!Number.isInteger(year)||year<2020||year>2100||!Number.isInteger(month)||month<1||month>12)throw new Error('Invalid appraisal period');
  if(String(reason||'').trim().length<5)throw new Error('A calculation or recalculation reason is required');
  return db.$transaction(async tx=>{
    const {effective,result,fingerprint,events,previous,summary}=await previewMonthlyAppraisal(tx,{employeeId,branch,year,month});
    const dates=periodDates(year,month);
    const config=effective.value.monthlyAppraisal;
    if(summary.archived){if(automatic)return {appraisal:previous,preserved:true};throw new Error('Archived employees cannot receive a new monthly calculation');}
    assertBusinessRole(user,config.workflow.reviewRoles,employeeId);
    const competition=await require('./employee-of-month').competitionForBranch(tx,{branch,year,month});
    if(competition&&['LOCKED','WINNER_APPROVED'].includes(competition.status)){if(automatic)return {appraisal:previous,preserved:true};throw new Error('Reopen the published Employee of the Month competition before recalculating');}
    if(!config.formulaVersionId)throw new Error('Publish an appraisal formula before calculating scores');
    if(automatic&&(config.recalculation.onSourceChange==='NEVER'||summary.frozen))return {appraisal:previous,preserved:true,sourceChanged:summary.sourceChanged};
    if(automatic&&await tx.opsMonthClose.findFirst({where:{year,month,status:'CLOSED'}}))return {appraisal:previous,preserved:true};
    let priorSources={};try{priorSources=JSON.parse(previous?.sourceSnapshotJson||'{}');}catch{}
    if(automatic&&previous&&priorSources.source==='MANUAL_OVERRIDE')return {appraisal:previous,preserved:true};
    if(previous&&previous.status!=='SUPERSEDED'&&priorSources.fingerprint===fingerprint)return {appraisal:previous,preserved:true,unchanged:true};
    if(!summary.completedDays)throw new Error('No closed, reviewed daily evaluations are available for this period');
    if(!automatic&&previous&&['APPROVED','LOCKED'].includes(previous.status)&&config.recalculation.approvedRecordBehavior==='PRESERVE')return {appraisal:previous,preserved:true,sourceChanged:summary.sourceChanged};
    if(result.status==='INSUFFICIENT_DATA')throw new Error(result.explanation.missingComponents.length?`The formula needs unavailable source components: ${result.explanation.missingComponents.join(', ')}. Configure supported weights or use audited manual entry.`:'Reviewed evaluation coverage is insufficient');
    const appraisal=await tx.opsMonthlyAppraisal.create({data:{employeeId,year,month,version:(previous?.version||0)+1,formulaVersionId:config.formulaVersionId,status:'DRAFT',totalScore:result.totalScore,componentSnapshotJson:JSON.stringify(result.components),sourceSnapshotJson:JSON.stringify({...result.sourceSnapshot,sourceEvents:events,fingerprint,configurationVersion:effective.version,previousAppraisalId:previous?.id||null}),calculationExplanationJson:JSON.stringify({...result.explanation,reason,automatic,coverage:result.coverage,calculationStatus:result.status,band:result.band})}});
    if(previous&&!['APPROVED','LOCKED'].includes(previous.status))await tx.opsMonthlyAppraisal.updateMany({where:{id:previous.id,status:{in:['DRAFT','REVIEWED','REOPENED']}},data:{status:'SUPERSEDED'}});
    await capturePerformanceSettingsSnapshot(tx,{kind:'MONTHLY_APPRAISAL',recordId:appraisal.id,branch,date:dates.start,configOverride:effective});
    await tx.auditLog.create({data:{action:'OPS_APPRAISAL_CALCULATED',userId:user.id,summary:`Calculated appraisal ${year}-${month}`,metadata:JSON.stringify({reason,automatic,appraisalId:appraisal.id,previousAppraisalId:previous?.id||null,configurationVersion:effective.version,fingerprint})}});
    return {appraisal,preserved:false};
  },{timeout:30000});
}
module.exports={periodDates,calculateAndStoreAppraisal};
