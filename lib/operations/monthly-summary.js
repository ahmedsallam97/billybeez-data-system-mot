const {getEffectivePerformanceSettings}=require('./performance-settings-service');
const {calculateMonthlyAppraisal}=require('./performance-policy');
const {getApprovedEventAdjustments}=require('./operational-report-service');
const {collectPerformanceSources,latestPerDate,hash,monthlyComponentEvidence}=require('./performance-sources');
const {employeeBranchFilter,assertEmployeeBranch}=require('./business-access');
const INCLUDED=['REVIEWED','EXCEPTION','MODIFIED','CLOSED'];
const parse=value=>{try{return JSON.parse(value||'{}');}catch{return {};}};
function periodDates(year,month){
 if(!Number.isInteger(year)||year<2020||year>2100||!Number.isInteger(month)||month<1||month>12)throw Object.assign(new Error('Invalid performance period'),{status:400});
 return {start:`${year}-${String(month).padStart(2,'0')}-01`,end:new Date(Date.UTC(year,month,0)).toISOString().slice(0,10)};
}
function uniqueAdjustments(rows){
 const map=new Map();for(const row of rows){const key=`${row.sourceReportId||row.reportId}:${row.id}`;if(!map.has(key))map.set(key,row);}return [...map.values()];
}
async function previewMonthlyAppraisal(db,{employeeId,branch,year,month,effective:provided}){
 const dates=periodDates(year,month);
 const employee=await db.employee.findUnique({where:{id:employeeId},select:{id:true,name:true,jobTitle:true,branch:true,active:true,employmentStatus:true}});
 if(!employee)throw new Error('Employee not found');await assertEmployeeBranch(db,employee,branch);
 const archived=Boolean(await db.employeeEmploymentEvent.findFirst({where:{employeeId,eventType:'PROFILE_ARCHIVED',newValue:'ARCHIVED'},select:{id:true}}));
 const effective=provided||await getEffectivePerformanceSettings(db,{branch,date:dates.end}),config=effective.value.monthlyAppraisal;
 const [events,rawRows,assignments,adjustments,previous]=await Promise.all([
  collectPerformanceSources(db,{employeeId,employee,branch,startDate:dates.start,endDate:dates.end,normalization:config.sourceNormalization,monthlySources:config.sources,includedEvaluationStatuses:config.includedEvaluationStatuses||INCLUDED}),
  db.opsEmployeeDailyEvaluation.findMany({where:{employeeId,dailyEvaluationDay:{evaluationDate:{gte:dates.start,lte:dates.end}}},include:{dailyEvaluationDay:{include:{criteriaVersion:{include:{criteria:true}}}},exceptions:true}}),
  db.opsScheduleAssignment.findMany({where:{employeeId,workDate:{gte:dates.start,lte:dates.end},schedule:{status:'PUBLISHED'}},include:{schedule:{select:{version:true,updatedAt:true}}},orderBy:[{schedule:{version:'desc'}},{schedule:{updatedAt:'desc'}}]}),
  getApprovedEventAdjustments(db,{employeeId,branch,startDate:dates.start,endDate:dates.end}),
  db.opsMonthlyAppraisal.findFirst({where:{employeeId,year,month},orderBy:{version:'desc'}}),
 ]);
 const workingCodes=new Set((await db.opsScheduleCode.findMany({where:{countsAsWorking:true},select:{code:true}})).map(row=>row.code));
 const latestAssignments=new Map();for(const row of assignments)if(!latestAssignments.has(row.workDate))latestAssignments.set(row.workDate,row);
 const expectedDates=[...latestAssignments.values()].filter(row=>workingCodes.has(row.code)).map(row=>row.workDate).sort();
 const rows=latestPerDate(rawRows,'dailyEvaluationDay'),daily=events.filter(row=>row.sourceType==='DAILY_EVALUATION');
 const completedDates=new Set(daily.map(row=>row.date));
 // Without a schedule, recorded employee-days are the only evidenced denominator.
 const eligibleDates=expectedDates.length?expectedDates:rows.map(row=>row.dailyEvaluationDay.evaluationDate).sort();
 const missingDates=eligibleDates.filter(date=>!completedDates.has(date));
 const componentScores={};
 for(const [component,metric] of [['attendanceReliability','punctuality'],['processReliability','processReliability'],['leadershipProblemResolution','leadershipProblemResolution']]){
  const values=events.map(row=>row.metrics[metric]).filter(value=>value!=null);if(values.length)componentScores[component]=values.reduce((sum,value)=>sum+value,0)/values.length;
 }
 const sourceEvidence=monthlyComponentEvidence(events,config.sources);
 for(const [component,evidence] of Object.entries(sourceEvidence))if(evidence.score!=null)componentScores[component]=evidence.score;
 const approvedAdjustments=uniqueAdjustments(adjustments);
 const appliedAdjustments=new Set(daily.flatMap(row=>row.sourceSnapshot.eventImpact?.sourceAdjustments||[]).map(row=>`${row.sourceReportId}:${row.id}`));
 // Report rewards flow through their exact reviewed daily source. They are not
 // added a second time after monthly weighting; events without a reviewed day
 // remain pending evidence rather than silently bypassing the daily workflow.
 const eventEvidence=approvedAdjustments.map(row=>({...row,application:appliedAdjustments.has(`${row.sourceReportId}:${row.id}`)?'IN_DAILY_SOURCE':'PENDING_DAILY_REVIEW'}));
 const input={dailyEvaluations:daily.map(row=>({id:row.sourceId,date:row.date,finalScore:row.sourceSnapshot.finalScore,maxScore:row.sourceSnapshot.maxScore,evaluationStatus:'REVIEWED',dayStatus:'CLOSED'})),componentScores,eventAdjustments:[],coverage:{expectedDays:eligibleDates.length}};
 const result=calculateMonthlyAppraisal(effective.value,input);
 const categories=new Map();
 for(const row of rows.filter(row=>completedDates.has(row.dailyEvaluationDay.evaluationDate))){
  for(const criterion of row.dailyEvaluationDay.criteriaVersion.criteria.filter(c=>c.active)){
   const key=criterion.category||criterion.code;const item=categories.get(key)||{code:key,label:criterion.label,labelAr:criterion.labelAr,score:0,maximum:0,days:0};
   item.maximum+=criterion.maxScore;item.score+=Math.max(0,criterion.maxScore-(row.exceptions.find(e=>e.criterionId===criterion.id)?.deduction||0));item.days++;categories.set(key,item);
  }
 }
 const dailyDetails=rows.map(row=>{const source=daily.find(d=>d.sourceId===row.id);return {id:row.id,date:row.dailyEvaluationDay.evaluationDate,dayStatus:row.dailyEvaluationDay.status,status:row.status,version:row.version,dayVersion:row.dailyEvaluationDay.version,baseFinalScore:row.finalScore,finalScore:source?.sourceSnapshot.finalScore??row.finalScore,eventImpact:source?.sourceSnapshot.eventImpact,maxScore:row.maxScore,included:Boolean(source),deductions:row.exceptions.map(e=>({criterionId:e.criterionId,deduction:e.deduction}))};});
 const fingerprint=hash({branch,year,month,configurationVersion:effective.version,config,events,dailyDetails,assignments:[...latestAssignments.values()].map(row=>({date:row.workDate,code:row.code,version:row.schedule.version})),adjustments:approvedAdjustments});
 const priorSources=parse(previous?.sourceSnapshotJson),frozen=Boolean(previous&&(['APPROVED','LOCKED'].includes(previous.status)||priorSources.source==='MANUAL_OVERRIDE'));
 const missingComponents=result.explanation.missingComponents;
 const state=!rows.length?'NO_DAILY':!daily.length?(rows.some(row=>!['DEFAULT_FULL','DEFAULT_ZERO'].includes(row.status))?'AWAITING_CLOSE':'INCOMPLETE'):missingComponents.length?'MISSING_COMPONENTS':!result.coverage.met?'INSUFFICIENT_COVERAGE':'CALCULATED';
 return {employee,effective,input,result,fingerprint,events,previous,summary:{employee,archived,branch,year,month,state,completedDays:daily.length,expectedDays:eligibleDates.length,coverageSource:expectedDates.length?'PUBLISHED_SCHEDULE':'RECORDED_EMPLOYEE_DAYS',missingDates,completedDates:[...completedDates].sort(),incompleteDays:rows.filter(row=>['DEFAULT_FULL','DEFAULT_ZERO'].includes(row.status)).length,awaitingCloseDays:rows.filter(row=>!['DEFAULT_FULL','DEFAULT_ZERO'].includes(row.status)&&row.dailyEvaluationDay.status!=='CLOSED').length,dailyAggregate:daily.length?result.components.dailyAggregate:null,monthlyResult:missingComponents.length||!daily.length?null:result.components.aggregateBeforeAdjustments,finalResult:missingComponents.length||!daily.length?null:result.totalScore,missingComponents,coverage:result.coverage,components:result.components,sourceEvidence,categories:[...categories.values()].map(row=>({...row,percentage:row.maximum?row.score/row.maximum*100:null})),dailyDetails,eventAdjustments:eventEvidence,formula:config.formulaParameters,aggregationMethod:config.aggregationMethod,eventAdjustmentTreatment:config.eventAdjustmentTreatment,configurationVersion:effective.version,formulaVersionId:config.formulaVersionId,sourceFingerprint:fingerprint,appraisalId:previous?.id||null,appraisalStatus:previous?.status||null,frozen,sourceChanged:Boolean(previous&&priorSources.source!=='MANUAL_OVERRIDE'&&priorSources.fingerprint!==fingerprint),snapshotScore:frozen?previous.totalScore:null}};
}
async function periodSummaries(db,{branch,year,month,employeeIds}){
 const dates=periodDates(year,month),effective=await getEffectivePerformanceSettings(db,{branch,date:dates.end});
 // Use the branch predicate directly; never infer membership from a global day.
 const scoped=await db.employee.findMany({where:{AND:[await employeeBranchFilter(db,branch),employeeIds?{id:{in:employeeIds}}:{}]},select:{id:true}});
 const previews=[];for(const employee of scoped)previews.push(await previewMonthlyAppraisal(db,{employeeId:employee.id,branch,year,month,effective}));
 return {effective,previews};
}
module.exports={INCLUDED,parse,periodDates,uniqueAdjustments,previewMonthlyAppraisal,periodSummaries};
