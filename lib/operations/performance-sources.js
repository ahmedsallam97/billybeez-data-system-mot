const { createHash } = require('node:crypto');
const { calculateSuitability } = require('./performance-policy');
const { getEffectivePerformanceSettings } = require('./performance-settings-service');
const { operationsBranch, employeeBranchFilter } = require('./business-access');
const { NORMALIZATION_DEFAULTS, monthlySourceConfig } = require('./performance-source-config');
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const dateOnly = value => value instanceof Date ? value.toISOString().slice(0,10) : String(value).slice(0,10);
function latestPerDate(rows, dayKey) {
  const map = new Map();
  for (const row of rows.sort((a,b) => b[dayKey].version-a[dayKey].version || b.version-a.version)) {
    const date=row[dayKey].workDate || row[dayKey].evaluationDate;
    if (!map.has(date)) map.set(date,row);
  }
  return [...map.values()];
}
function sourceApplies(config, employee, branch, date) {
  return config.active && (config.branches?.includes('*') || config.branches?.includes(branch)) && (!config.effectiveFrom || date>=config.effectiveFrom) && (!config.effectiveTo || date<=config.effectiveTo) && (!config.eligibleJobTitles?.length || config.eligibleJobTitles.includes(employee?.jobTitle)) && (!config.eligibleStatuses?.length || config.eligibleStatuses.includes(employee?.employmentStatus));
}
function reportMonthlySources(report,{employeeId,employee,branch,startDate,endDate,sources}) {
  const events=[];
  if(report.branch!==branch||report.workDate<startDate||report.workDate>endDate)return events;
  const member=report.draft?.participants?.find(item=>item.employeeId===employeeId&&!item.backup&&item.actualParticipant!==false);
  if(!member)return events;
  const exclude=(component,reason)=>events.push({id:`SOURCE_EXCLUSION:${report.id}:${component}`,sourceType:'SOURCE_EXCLUSION',sourceId:report.id,date:report.workDate,metrics:{},excludedComponent:component,exclusionReason:reason,sourceSnapshot:{reportId:report.id,reportType:report.reportType,status:report.status,branch}});
  if(report.status!=='APPROVED'||['CANCELLED','REMOVED','DELETED'].includes(report.source?.snapshot?.status)){for(const component of ['recognition','guestFeedback'])exclude(component,report.status==='CANCELLED'?'CANCELLED_EVENT':'REPORT_NOT_APPROVED');return events;}
  const {recognition,guestFeedback}=monthlySourceConfig(sources);
  if(sourceApplies(recognition,employee,branch,report.workDate)&&recognition.includedReportTypes.includes(report.reportType)&&Number(recognition.monthlyCap)>0) {
    for(const adjustment of report.draft.adjustments||[]) {
      const level=recognition.levels.find(item=>item.levelCode===adjustment.levelCode);
      if(adjustment.employeeId!==employeeId||adjustment.status!=='APPROVED'||!adjustment.scoreSnapshot||Number(adjustment.scoreSnapshot.approvedPoints)<=0||!level||(recognition.approvalRequired&&!adjustment.approvedBy))continue;
      events.push({id:`RECOGNITION:${report.id}:${adjustment.id}`,sourceType:'RECOGNITION',sourceId:adjustment.id,date:report.workDate,metrics:{recognition:Number(level.points)/Number(recognition.monthlyCap)*100},sourceSnapshot:{reportId:report.id,reportType:report.reportType,revision:report.revision,levelCode:adjustment.levelCode,points:Number(level.points),monthlyCap:Number(recognition.monthlyCap),approvedBy:adjustment.approvedBy,approvedAt:adjustment.approvedAt,evidence:adjustment.evidence||[],comment:adjustment.comment,branch}});
    }
  }
  if(!events.some(row=>row.sourceType==='RECOGNITION'))exclude('recognition',!recognition.active?'CONFIGURE_RECOGNITION':!sourceApplies(recognition,employee,branch,report.workDate)?'OUTSIDE_SOURCE_SCOPE':!recognition.includedReportTypes.includes(report.reportType)?'REPORT_TYPE_NOT_INCLUDED':'NO_ELIGIBLE_REWARD');
  const template=report.configSnapshot?.surveyTemplate;
  if(sourceApplies(guestFeedback,employee,branch,report.workDate)&&template&&guestFeedback.eligibleTemplates.includes(template.code)&&(!guestFeedback.approvalRequired||report.approvedBy)&&report.draft.survey?.removed!==true) {
    const values=(report.draft.survey?.answers||[]).filter(answer=>(!guestFeedback.questionCodes.length||guestFeedback.questionCodes.includes(answer.questionCode))&&answer.numericValue!=null&&Number.isFinite(Number(answer.numericValue))&&Number(answer.numericValue)>=guestFeedback.ratingMinimum&&Number(answer.numericValue)<=guestFeedback.ratingMaximum);
    let weight=1;
    if(report.reportType==='BIRTHDAY') { if(!member.responsibleHost){exclude('guestFeedback','NO_EVENT_RESPONSIBILITY');return events;}const hosts=report.draft.participants.filter(item=>item.responsibleHost&&!item.backup&&item.actualParticipant!==false);if(guestFeedback.birthdayAttribution==='EQUAL')weight=1/Math.max(1,hosts.length); }
    if(report.reportType==='TRIP')weight=Number(member.primaryLeader||member.isTeamLeader?guestFeedback.tripLeaderWeight:guestFeedback.tripStaffWeight);
    if(values.length&&weight>0)events.push({id:`EVENT_SURVEY:${report.id}:${employeeId}`,sourceType:'EVENT_SURVEY',sourceId:report.id,date:report.workDate,metrics:{guestFeedback:values.reduce((sum,row)=>sum+(Number(row.numericValue)-guestFeedback.ratingMinimum)/(guestFeedback.ratingMaximum-guestFeedback.ratingMinimum)*100,0)/values.length},attributionWeight:weight,responseCount:1,sourceSnapshot:{reportId:report.id,reportType:report.reportType,revision:report.revision,templateCode:template.code,templateVersion:template.version,answers:values,attributionWeight:weight,approvedBy:report.approvedBy,approvedAt:report.approvedAt,branch}});
  }
  if(!events.some(row=>row.sourceType==='EVENT_SURVEY'))exclude('guestFeedback',!guestFeedback.active?'CONFIGURE_GUEST_FEEDBACK':!sourceApplies(guestFeedback,employee,branch,report.workDate)?'OUTSIDE_SOURCE_SCOPE':!template||!guestFeedback.eligibleTemplates.includes(template.code)?'SURVEY_TEMPLATE_NOT_INCLUDED':'NO_ELIGIBLE_NUMERIC_RESPONSES');
  return events;
}
function monthlyComponentEvidence(events,sources) {
  const config=monthlySourceConfig(sources),evidence={};
  for(const component of ['recognition','guestFeedback']) {
    const automatic=events.filter(row=>row.sourceType!=='MANUAL_COMPONENT'&&row.metrics?.[component]!=null),manual=events.filter(row=>row.sourceType==='MANUAL_COMPONENT'&&row.metrics?.[component]!=null);
    const rows=automatic.length?automatic:manual.slice(0,1),count=rows.reduce((sum,row)=>sum+Number(row.responseCount||1),0);
    const score=rows.length?(component==='recognition'&&automatic.length?Math.min(100,rows.reduce((sum,row)=>sum+row.metrics[component],0)):rows.reduce((sum,row)=>sum+row.metrics[component]*Number(row.attributionWeight??1),0)/rows.reduce((sum,row)=>sum+Number(row.attributionWeight??1),0)):null;
    const sufficient=component!=='guestFeedback'||count>=config.guestFeedback.minimumResponses;
    evidence[component]={score:sufficient?score:null,responseCount:count,minimumResponses:component==='guestFeedback'?config.guestFeedback.minimumResponses:null,configured:component==='recognition'?config.recognition.active:sources==null||config.guestFeedback.active,mode:automatic.length?'AUTOMATIC':manual.length?'MANUAL':'PENDING',reason:!rows.length?component==='recognition'&&!config.recognition.active?'CONFIGURE_RECOGNITION':component==='guestFeedback'&&sources!=null&&!config.guestFeedback.active?'CONFIGURE_GUEST_FEEDBACK':'NO_ELIGIBLE_SOURCES':!sufficient?'MINIMUM_RESPONSES':null,sources:rows.map(row=>({id:row.id,type:row.sourceType,date:row.date,score:row.metrics[component],responseCount:row.responseCount||1,...row.sourceSnapshot})),excluded:events.filter(row=>row.excludedComponent===component).map(row=>({id:row.sourceId,date:row.date,reason:row.exclusionReason,...row.sourceSnapshot})),excludedManual:automatic.length?manual.map(row=>({id:row.sourceId,reason:'AUTOMATIC_SOURCE_AVAILABLE'})):[]};
  }
  return evidence;
}
async function collectPerformanceSources(db, { employeeId, employee, branch, startDate, endDate, normalization = NORMALIZATION_DEFAULTS, profileCode, monthlySources, includedEvaluationStatuses = ['REVIEWED','EXCEPTION','MODIFIED','CLOSED'] }) {
  const n = { ...NORMALIZATION_DEFAULTS, ...normalization };
  const [attendance, evaluations, feedback, reports] = await Promise.all([
    db.opsAttendanceRecord.findMany({where:{employeeId,attendanceDay:{workDate:{gte:startDate,lte:endDate}}},include:{attendanceDay:true}}),
    db.opsEmployeeDailyEvaluation.findMany({where:{employeeId,dailyEvaluationDay:{evaluationDate:{gte:startDate,lte:endDate}}},include:{dailyEvaluationDay:true}}),
    db.employeeGuestFeedback.findMany({where:{employeeId,feedbackDate:{gte:new Date(startDate+'T00:00:00.000Z'),lt:new Date(new Date(endDate+'T00:00:00.000Z').getTime()+86400000)}}}),
    db.systemSetting.findMany({where:{OR:[{key:{startsWith:'OPS_OPERATIONAL_REPORT:'}},{key:{startsWith:'OPS_MONTHLY_COMPONENT:'}}]}}),
  ]);
  const events=[];
  // Select the most recent day version BEFORE filtering final/reviewed states, so
  // a reopened source cannot leave the previous closed version in the calculation.
  for (const row of latestPerDate(attendance,'attendanceDay')) {
    if (row.attendanceDay.status !== 'FINALIZED' || !['PRESENT','LATE','ABSENT','EARLY_LEAVE'].includes(row.status)) continue;
    const score = row.status === 'ABSENT' ? n.absenceScore : row.lateMinutes > n.lateGraceMinutes || row.earlyLeaveMinutes > n.earlyLeaveGraceMinutes ? n.lateScore : n.onTimeScore;
    events.push({id:'ATTENDANCE:'+row.id,sourceType:'ATTENDANCE',sourceId:row.id,date:row.attendanceDay.workDate,metrics:{punctuality:score},triggeredRules:row.status==='ABSENT'?['ABSENCE']:row.lateMinutes>n.lateGraceMinutes?['LATENESS']:[],sourceSnapshot:{version:row.version,dayVersion:row.attendanceDay.version,status:row.status,lateMinutes:row.lateMinutes,earlyLeaveMinutes:row.earlyLeaveMinutes}});
  }
  for (const row of latestPerDate(evaluations,'dailyEvaluationDay')) {
    if (row.dailyEvaluationDay.status !== 'CLOSED' || !includedEvaluationStatuses.includes(row.status) || row.maxScore<=0) continue;
    const impact=await require('./operational-report-service').eventImpactForDaily(db,{employeeId,branch,date:row.dailyEvaluationDay.evaluationDate,baseScore:row.finalScore,maxScore:row.maxScore});
    events.push({id:'DAILY_EVALUATION:'+row.id,sourceType:'DAILY_EVALUATION',sourceId:row.id,date:row.dailyEvaluationDay.evaluationDate,metrics:{performance:impact.finalScore/row.maxScore*100},sourceSnapshot:{version:row.version,dayVersion:row.dailyEvaluationDay.version,baseFinalScore:row.finalScore,finalScore:impact.finalScore,maxScore:row.maxScore,eventImpact:impact}});
  }
  for (const row of feedback) {
    const config=monthlySourceConfig(monthlySources).guestFeedback;
    const excluded=reason=>{if(!profileCode)events.push({id:'SOURCE_EXCLUSION:FEEDBACK:'+row.id,sourceType:'SOURCE_EXCLUSION',sourceId:row.id,date:dateOnly(row.feedbackDate),metrics:{},excludedComponent:'guestFeedback',exclusionReason:reason,sourceSnapshot:{status:row.status,source:row.source}});};
    if(monthlySources&&(!config.includeDirectFeedback||!sourceApplies(config,employee,branch,dateOnly(row.feedbackDate)))){excluded(!config.active?'CONFIGURE_GUEST_FEEDBACK':'OUTSIDE_SOURCE_SCOPE');continue;}
    if(!['RESOLVED','NO_ACTION'].includes(row.status)){excluded('FEEDBACK_NOT_REVIEWED');continue;}
    // The existing direct-feedback record stores its creator and resolution
    // state, but no independent approval evidence. A configured approval rule
    // cannot treat a creator-selected final state as an approved numeric source.
    // Legacy policies without an explicit source rubric keep their prior behavior.
    if(monthlySources&&config.approvalRequired){excluded('DIRECT_FEEDBACK_APPROVAL_REQUIRED');continue;}
    if(row.rating==null){excluded('MISSING_NUMERIC_RATING');continue;}
    const minimum=monthlySources?config.ratingMinimum:n.guestRatingMinimum,maximum=monthlySources?config.ratingMaximum:n.guestRatingMaximum;
    if(row.rating<minimum||row.rating>maximum||maximum<=minimum){excluded('OUTSIDE_RATING_SCALE');continue;}
    events.push({id:'GUEST_FEEDBACK:'+row.id,sourceType:'GUEST_FEEDBACK',sourceId:row.id,date:dateOnly(row.feedbackDate),metrics:{guestFeedback:(row.rating-minimum)/(maximum-minimum)*100},responseCount:1,sourceSnapshot:{rating:row.rating,status:row.status,updatedAt:row.updatedAt,source:row.source,createdBy:row.createdBy,branch}});
  }
  for (const stored of reports) {
    const report=JSON.parse(stored.value);
    if(stored.key.startsWith('OPS_MONTHLY_COMPONENT:')) {
      if(!profileCode&&report.employeeId===employeeId&&report.branch===branch&&report.status==='APPROVED'&&report.approvedBy&&report.month===startDate.slice(0,7))events.push({id:'MANUAL_COMPONENT:'+report.id,sourceType:'MANUAL_COMPONENT',sourceId:report.id,date:startDate,metrics:{[report.component]:report.value},responseCount:report.responseCount||1,sourceSnapshot:{...report}});
      continue;
    }
    if(report.status==='APPROVED'&&!await require('./operational-report-service').reportSourceIsAvailable(db,report)){if(!profileCode&&report.branch===branch&&report.workDate>=startDate&&report.workDate<=endDate&&report.draft?.participants?.some(item=>item.employeeId===employeeId))for(const component of ['recognition','guestFeedback'])events.push({id:`SOURCE_EXCLUSION:${report.id}:${component}`,sourceType:'SOURCE_EXCLUSION',sourceId:report.id,date:report.workDate,metrics:{},excludedComponent:component,exclusionReason:'CANCELLED_EVENT',sourceSnapshot:{reportId:report.id,reportType:report.reportType}});continue;}
    const reportEvents=reportMonthlySources(report,{employeeId,employee,branch,startDate,endDate,sources:monthlySources});
    events.push(...(profileCode?reportEvents.filter(row=>!['RECOGNITION','SOURCE_EXCLUSION'].includes(row.sourceType)):reportEvents));
    if(report.status!=='APPROVED'||report.branch!==branch||report.workDate<startDate||report.workDate>endDate)continue;
    const member=report.draft.participants.find(item=>item.employeeId===employeeId&&!item.backup&&item.actualParticipant!==false);
    if(!member)continue;
    if(profileCode && !({TRIP_STAFF:report.reportType==='TRIP',TRIP_TEAM_LEADER:report.reportType==='TRIP'&&member.primaryLeader,BIRTHDAY_HOST:report.reportType==='BIRTHDAY'&&member.responsibleHost,SHIFT_TEAM_LEADER:report.reportType==='SHIFT_LEADERSHIP'&&member.primaryLeader}[profileCode]))continue;
    const applicable=(report.configSnapshot.processTemplate?.steps||[]).filter(step=>step.active&&(step.branches.includes('*')||step.branches.includes(branch)));
    const completed=applicable.filter(step=>report.draft.steps.some(item=>item.code===step.code&&item.completed)).length;
    const issues=report.draft.unresolvedIssues || [];
    const adjustment=report.draft.adjustments.find(item=>item.employeeId===employeeId&&item.status==='APPROVED');
    const metrics={}; if(applicable.length)metrics.processReliability=completed/applicable.length*100;
    if(member.primaryLeader||member.isTeamLeader) metrics.leadershipProblemResolution=issues.length ? issues.filter(item=>item.resolved).length/issues.length*100 : metrics.processReliability;
    for(const key of Object.keys(metrics))if(metrics[key]==null)delete metrics[key];
    events.push({id:'OPERATIONAL_REPORT:'+report.id,sourceType:'OPERATIONAL_REPORT',sourceId:report.id,date:report.workDate,metrics,triggeredRules:issues.some(item=>!item.resolved)?['UNRESOLVED_ISSUE']:[],sourceSnapshot:{revision:report.revision,reportType:report.reportType,approvedBy:report.approvedBy,adjustment:adjustment?.scoreSnapshot || null}});
  }
  return events.sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id));
}
async function suitabilityInput(db,{employeeId,branch,profileCode,asOfDate}) {
  const effective=await getEffectivePerformanceSettings(db,{branch,date:asOfDate});
  const profile=effective.value.suitability.find(item=>item.code===profileCode);
  if(!profile?.active)throw new Error('Select an active suitability profile');
  const start=new Date(asOfDate+'T00:00:00.000Z');start.setUTCDate(start.getUTCDate()-profile.rollingWindowDays+1);
  const employee=await db.employee.findUnique({where:{id:employeeId},select:{id:true,jobTitle:true,employmentStatus:true}});
  const events=await collectPerformanceSources(db,{employeeId,employee,branch,startDate:dateOnly(start),endDate:asOfDate,normalization:profile.sourceNormalization,profileCode,monthlySources:effective.value.monthlyAppraisal.sources});
  return {effective,events,fingerprint:hash({configurationVersion:effective.version,profile,events}),result:calculateSuitability(effective.value,{profileCode,asOfDate,events})};
}
async function getSuitabilityRecommendations(db,{user,branch,profileCode,asOfDate}) {
  branch=await operationsBranch(db,user,branch);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(asOfDate)||new Date(asOfDate+'T00:00:00.000Z').toISOString().slice(0,10)!==asOfDate)throw new Error('A valid date is required');
  const employees=await db.employee.findMany({where:{active:true,employmentStatus:'ACTIVE',department:'OPERATION',...await employeeBranchFilter(db,branch)},select:{id:true,name:true,jobTitle:true,operationsTeamLeader:true},orderBy:{name:'asc'}});
  const rows=[];
  const snapshots=await db.systemSetting.findMany({where:{key:{startsWith:'OPS_SUITABILITY_SNAPSHOT:'}}});
  for(const employee of employees){
    if(profileCode.endsWith('TEAM_LEADER')&&!employee.operationsTeamLeader)continue;
    const input=await suitabilityInput(db,{employeeId:employee.id,branch,profileCode,asOfDate});
    const recorded=snapshots.map(row=>JSON.parse(row.value)).filter(row=>row.employeeId===employee.id&&row.branch===branch&&row.profileCode===profileCode&&row.asOfDate<=asOfDate).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
    const prior=recorded.find(item=>item.result.override)||recorded[0];
    rows.push({employee,result:input.result,fingerprint:input.fingerprint,snapshot:prior || null,overrideStale:Boolean(prior?.result.override&&prior.fingerprint!==input.fingerprint)});
  }
  rows.sort((a,b)=>(b.result.score??-1)-(a.result.score??-1));
  return {branch,asOfDate,profileCode,recommendations:rows};
}
module.exports={NORMALIZATION_DEFAULTS,hash,dateOnly,latestPerDate,sourceApplies,reportMonthlySources,monthlyComponentEvidence,collectPerformanceSources,suitabilityInput,getSuitabilityRecommendations};
