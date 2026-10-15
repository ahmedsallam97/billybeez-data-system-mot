const {periodSummaries,periodDates,parse}=require('./monthly-summary');
const {calculateAndStoreAppraisal}=require('./appraisal-calculation');
const {hash}=require('./performance-sources');
const {employeeBranchFilter,assertBusinessRole}=require('./business-access');
const CACHE='OPS_MONTHLY_SUMMARY:',SCOPE='OPS_EOTM_SCOPE:';
const DEFAULT_RULES={minimumDailyEvaluations:0,minimumScore:0,activeEmployeesOnly:false,requireMonthlyApproval:true,tieBreakers:['FINAL_SCORE','EMPLOYEE_NAME','EMPLOYEE_ID']};
function rulesFor(effective,formula){const rules={...DEFAULT_RULES,minimumScore:Number(parse(formula?.configJson).minimumAppraisalScore||0),requireMonthlyApproval:effective.value.monthlyAppraisal.workflow.approvalRequired,...effective.value.monthlyAppraisal.employeeOfMonth};if(effective.source==='DEFAULT')rules.minimumScore=Number(parse(formula?.configJson).minimumAppraisalScore||0);return rules;}
function classify(preview,rules){
 const s=preview.summary,reasons=[];
 const manual=parse(preview.previous?.sourceSnapshotJson).source==='MANUAL_OVERRIDE';
 if(!s.completedDays&&!manual)reasons.push(s.state==='NO_DAILY'?'NO_DAILY':s.state);
 if(s.missingComponents.length&&!manual)reasons.push('MISSING_COMPONENTS');
 if(s.completedDays<rules.minimumDailyEvaluations)reasons.push('MINIMUM_DAYS');
 if(!preview.result.coverage.met&&!preview.effective.value.monthlyAppraisal.workflow.provisionalAllowed&&!manual)reasons.push('INSUFFICIENT_COVERAGE');
 if(rules.activeEmployeesOnly&&(!s.employee.active||s.employee.employmentStatus!=='ACTIVE'))reasons.push('INACTIVE_EMPLOYEE');
 if(s.archived)reasons.push('ARCHIVED_EMPLOYEE');
 const stored=preview.previous&&preview.previous.status!=='SUPERSEDED';
 const score=stored?preview.previous.totalScore:s.finalResult;
 if(s.appraisalStatus==='SUPERSEDED'||s.sourceChanged&&!s.frozen&&!manual)reasons.push('STALE_MONTHLY_RESULT');
 if(score!=null&&score<rules.minimumScore)reasons.push('MINIMUM_SCORE');
 if(rules.requireMonthlyApproval&&s.appraisalStatus!=='APPROVED')reasons.push('AWAITING_MONTHLY_APPROVAL');
 if(s.sourceChanged&&s.frozen&&!manual)reasons.push('SOURCE_CHANGED');
 return {...s,eligibilityRules:rules,manual,sourceChanged:s.sourceChanged&&!manual,finalResult:score,monthlyResult:manual?score:s.monthlyResult,eligible:reasons.length===0,exclusionReasons:[...new Set(reasons)],rank:null};
}
function rankRows(rows,rules){
 const tie=rules.tieBreakers||DEFAULT_RULES.tieBreakers;
 const value=(row,key)=>key==='FINAL_SCORE'?(row.frozen?row.snapshotScore:row.finalResult):key==='COMPLETED_DAYS'?row.completedDays:key==='ATTENDANCE_SCORE'?row.components.componentScores.attendanceReliability:key==='EMPLOYEE_NAME'?row.employee.name:row.employee.id;
 const result=[...rows].sort((a,b)=>{
  if(a.eligible!==b.eligible)return a.eligible?-1:1;
  for(const key of tie){const left=value(a,key),right=value(b,key);const delta=['EMPLOYEE_NAME','EMPLOYEE_ID'].includes(key)?String(left).localeCompare(String(right),'en'):Number(right??-Infinity)-Number(left??-Infinity);if(delta!==0&&!Number.isNaN(delta))return delta;}
  return a.employee.id.localeCompare(b.employee.id);
 });
 let rank=0;return result.map(row=>({...row,rank:row.eligible?++rank:null}));
}
async function availablePeriods(db,branch){
 const rows=await db.opsEmployeeDailyEvaluation.findMany({where:{employee:await employeeBranchFilter(db,branch)},select:{employeeId:true,status:true,version:true,dailyEvaluationDay:{select:{evaluationDate:true,status:true,version:true}}}});
 const days=new Map();for(const row of rows){const key=row.employeeId+':'+row.dailyEvaluationDay.evaluationDate,old=days.get(key);if(!old||row.dailyEvaluationDay.version>old.dailyEvaluationDay.version||row.dailyEvaluationDay.version===old.dailyEvaluationDay.version&&row.version>old.version)days.set(key,row);}
 const map=new Map();for(const row of days.values()){const period=row.dailyEvaluationDay.evaluationDate.slice(0,7),entry=map.get(period)||{period,recordedEmployeeDays:0,completedEmployeeDays:0,employees:new Set()};entry.recordedEmployeeDays++;entry.employees.add(row.employeeId);if(row.dailyEvaluationDay.status==='CLOSED'&&['REVIEWED','EXCEPTION','MODIFIED','CLOSED'].includes(row.status))entry.completedEmployeeDays++;map.set(period,entry);}
 return [...map.values()].map(row=>({...row,employees:row.employees.size})).sort((a,b)=>b.period.localeCompare(a.period));
}
async function competitionForBranch(db,{branch,year,month}){
 const rows=await db.opsEotmCompetition.findMany({where:{year,month},include:{candidates:{include:{employee:{select:{id:true,name:true,branch:true,jobTitle:true}}},orderBy:{rank:'asc'}},winner:{select:{id:true,name:true,nameAr:true,nameEn:true,operationalName:true,documents:{where:{documentType:'EMPLOYEE_PHOTO',status:'ACTIVE'},orderBy:{uploadedAt:'desc'},take:1}}},formulaVersion:true},orderBy:{version:'desc'}});
 const allowed=new Set((await db.employee.findMany({where:await employeeBranchFilter(db,branch),select:{id:true}})).map(row=>row.id));
 for(const row of rows){const meta=parse((await db.systemSetting.findUnique({where:{key:SCOPE+row.id}}))?.value);if(meta.branch?meta.branch===branch:row.candidates.length&&row.candidates.every(c=>allowed.has(c.employeeId))){return {...row,metadata:meta,winnerEmployeeId:allowed.has(row.winnerEmployeeId)?row.winnerEmployeeId:null,winner:row.winner&&allowed.has(row.winner.id)?{...row.winner,documents:undefined,photoUrl:row.winner.documents[0]?`/api/operations/employees/${row.winner.id}/documents/${row.winner.documents[0].id}`:null}:null};}}
 return null;
}
async function loadEmployeeOfMonth(db,{branch,year,month}){
 const {effective,previews}=await periodSummaries(db,{branch,year,month});const dates=periodDates(year,month);
 const [competition,formula,periods]=await Promise.all([competitionForBranch(db,{branch,year,month}),db.opsEotmFormulaVersion.findFirst({where:{active:true,effectiveFrom:{lte:dates.start},OR:[{effectiveTo:null},{effectiveTo:{gte:dates.start}}]},orderBy:{createdAt:'desc'}}),availablePeriods(db,branch)]);
 const rules=rulesFor(effective,formula);
 const rows=rankRows(previews.filter(row=>row.summary.dailyDetails.length||row.summary.expectedDays||row.summary.appraisalId).map(row=>classify(row,rules)),rules);
 const sourceFingerprint=hash({branch,year,month,rules,formulaId:formula?.id,rows:rows.map(row=>({employeeId:row.employee.id,fingerprint:row.sourceFingerprint,appraisalId:row.appraisalId,status:row.appraisalStatus,eligible:row.eligible,active:row.employee.active}))});
 const dailyRows=rows.filter(row=>row.dailyDetails.length);
 const frozen=competition&&['LOCKED','WINNER_APPROVED'].includes(competition.status);
 const sourceChanged=Boolean(competition&&(competition.metadata.fingerprint?competition.metadata.fingerprint!==sourceFingerprint:competition.candidates.some(c=>{const s=parse(c.sourceSnapshotJson);const current=rows.find(row=>row.employee.id===c.employeeId);return current?.appraisalId!==s.appraisalId||current?.sourceChanged;})));
 const state=rows.some(row=>row.eligible)?'READY':!dailyRows.length?(rows.some(row=>row.appraisalId)?'MONTHLY_ONLY':'NO_DAILY'):!dailyRows.some(row=>row.completedDays)?(dailyRows.some(row=>row.awaitingCloseDays)?'AWAITING_CLOSE':'INCOMPLETE'):dailyRows.some(row=>row.missingComponents.length)?'MISSING_COMPONENTS':!rows.some(row=>row.eligible)?'NONE_ELIGIBLE':'READY';
 const visibleRows=frozen?competition.candidates.map(c=>{const recorded=parse(c.sourceSnapshotJson).monthlySummary;return {...(recorded||rows.find(row=>row.employee.id===c.employeeId)),employee:c.employee,rank:c.rank,eligible:c.eligible,finalResult:c.finalScore,frozen:true,snapshotScore:c.finalScore,sourceChanged,exclusionReasons:c.eligible?[]:[c.eligibilityReason||'EXCLUDED']};}):rows;
 return {year,month,branch,rows:visibleRows,liveRows:rows,competition,sourceChanged,frozen:Boolean(frozen),sourceFingerprint,rules,state,periods,configurationVersion:effective.version,formula:effective.value.monthlyAppraisal,stats:{evaluatedEmployees:dailyRows.filter(row=>row.completedDays).length,eligibleCandidates:visibleRows.filter(row=>row.eligible).length,needsReview:rows.filter(row=>!row.eligible).length,completedEmployeeDays:dailyRows.reduce((sum,row)=>sum+row.completedDays,0)}};
}
async function syncMonthlySummaries(db,{user,branch,year,month,employeeIds,explicit=false,reason='Automatic monthly draft refresh from daily sources'}){
 const {effective,previews}=await periodSummaries(db,{branch,year,month,employeeIds}),changes=[],errors=[],preserved=[];
 const competition=await competitionForBranch(db,{branch,year,month});
 if(competition&&['LOCKED','WINNER_APPROVED'].includes(competition.status)){if(explicit)throw new Error('Reopen the published competition before recalculating');return {changes,errors,preserved:['Published competition snapshot preserved']};}
 for(const preview of previews){const s=preview.summary;if(employeeIds&&!employeeIds.includes(s.employee.id))continue;
  const key=`${CACHE}${branch}:${year}-${String(month).padStart(2,'0')}:${s.employee.id}`,existing=await db.systemSetting.findUnique({where:{key}}),old=parse(existing?.value);
  if(s.frozen&&!explicit){if(old.fingerprint!==s.sourceFingerprint)preserved.push({employeeId:s.employee.id,reason:'Published/manual result preserved; explicit authorized recalculation required'});continue;}
  if(!s.dailyDetails.length&&!s.appraisalId&&!existing)continue;
  if(old.fingerprint===s.sourceFingerprint&&!explicit&&old.summary?.appraisalId===s.appraisalId&&old.summary?.appraisalStatus===s.appraisalStatus)continue;
  if(explicit||effective.value.monthlyAppraisal.recalculation.onSourceChange!=='NEVER'){
   let appraisal=null;
   if(!s.frozen&&preview.previous&&(preview.result.status==='INSUFFICIENT_DATA'||!s.completedDays)){await db.opsMonthlyAppraisal.updateMany({where:{id:preview.previous.id,status:{in:['DRAFT','REVIEWED','REOPENED']}},data:{status:'SUPERSEDED'}});s.appraisalStatus='SUPERSEDED';}
   if(s.completedDays&&preview.result.status!=='INSUFFICIENT_DATA'&&s.employee.id!==user.employeeId){try{const result=await calculateAndStoreAppraisal(db,{user,branch,employeeId:s.employee.id,year,month,automatic:!explicit,reason});appraisal=result.appraisal;}catch(e){errors.push({employeeId:s.employee.id,error:e.message});}}
   const value={fingerprint:s.sourceFingerprint,summary:{...s,appraisalId:appraisal?.id||s.appraisalId,appraisalStatus:appraisal?.status||s.appraisalStatus},calculatedAt:new Date().toISOString(),source:'DAILY_EVALUATIONS',state:s.state};
   const changed=await db.$transaction(async tx=>{const current=await tx.systemSetting.findUnique({where:{key}});if(parse(current?.value).fingerprint===s.sourceFingerprint)return false;await tx.systemSetting.upsert({where:{key},create:{key,value:JSON.stringify(value),updatedBy:user.id},update:{value:JSON.stringify(value),updatedBy:user.id}});await tx.auditLog.create({data:{action:'OPS_MONTHLY_SUMMARY_REFRESHED',userId:user.id,summary:`Refreshed ${branch} ${year}-${month} daily-derived summary`,metadata:JSON.stringify({employeeId:s.employee.id,year,month,branch,fingerprint:s.sourceFingerprint,completedDays:s.completedDays,state:s.state,missingComponents:s.missingComponents,reason})}});return true;});
   if(changed)changes.push({employeeId:s.employee.id,completedDays:s.completedDays,state:s.state,appraisalId:appraisal?.id||null});
  }
 }
 return {changes,errors,preserved};
}
async function refreshAfterSourceChange(db,{user,branch,date,employeeIds}){
 try{const [year,month]=date.slice(0,7).split('-').map(Number);return await syncMonthlySummaries(db,{user,branch,year,month,employeeIds});}catch(e){await db.auditLog.create({data:{action:'OPS_MONTHLY_REFRESH_FAILED',userId:user.id,summary:'Daily source saved; monthly refresh requires attention',metadata:JSON.stringify({branch,date,error:e.message})}});return {errors:[{error:e.message}]};}
}
async function createCompetition(db,{user,branch,year,month,expectedFingerprint}){
 return db.$transaction(async tx=>{
  const view=await loadEmployeeOfMonth(tx,{branch,year,month});assertBusinessRole(user,view.formula.workflow.approvalRoles);
  if(expectedFingerprint&&expectedFingerprint!==view.sourceFingerprint)throw Object.assign(new Error('Source results changed; refresh and review again'),{status:409});
  if(view.frozen)throw new Error('Reopen the published competition explicitly before recalculating');
  if(view.competition?.metadata.fingerprint===view.sourceFingerprint)return {competition:view.competition,unchanged:true};
  const eligible=view.rows.filter(row=>row.eligible);if(!eligible.length)throw new Error('No eligible candidates. Review the displayed exclusion reasons.');
  if(eligible.some(row=>row.employee.id===user.employeeId))throw new Error('You cannot approve or adjust your own score');
  const formula=await tx.opsEotmFormulaVersion.findFirst({where:{active:true,effectiveFrom:{lte:periodDates(year,month).start},OR:[{effectiveTo:null},{effectiveTo:{gte:periodDates(year,month).start}}]},orderBy:{createdAt:'desc'}});if(!formula)throw new Error('An active EOTM formula is required');
  const latest=await tx.opsEotmCompetition.findFirst({where:{year,month},orderBy:{version:'desc'}});
  const competition=await tx.opsEotmCompetition.create({data:{year,month,version:(latest?.version||0)+1,status:'CALCULATED',formulaVersionId:formula.id}});
  await tx.opsEotmCandidate.createMany({data:eligible.map(row=>({competitionId:competition.id,employeeId:row.employee.id,eligible:true,finalScore:row.frozen?row.snapshotScore:row.finalResult,rank:row.rank,componentSnapshotJson:JSON.stringify(row.components),sourceSnapshotJson:JSON.stringify({appraisalId:row.appraisalId,monthlySummary:row})}))});
  await tx.systemSetting.create({data:{key:SCOPE+competition.id,value:JSON.stringify({branch,fingerprint:view.sourceFingerprint,rules:view.rules}),updatedBy:user.id}});
  await tx.auditLog.create({data:{action:'OPS_EOTM_CALCULATED',userId:user.id,summary:`Calculated ${branch} EOTM ${year}-${month}`,metadata:JSON.stringify({branch,year,month,competitionId:competition.id,candidateCount:eligible.length,fingerprint:view.sourceFingerprint})}});
  return {competition};
 },{timeout:30000});
}
module.exports={DEFAULT_RULES,CACHE,SCOPE,rulesFor,classify,rankRows,availablePeriods,competitionForBranch,loadEmployeeOfMonth,syncMonthlySummaries,refreshAfterSourceChange,createCompetition};
