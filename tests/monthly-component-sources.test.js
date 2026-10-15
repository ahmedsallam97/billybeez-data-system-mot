const test=require('node:test'),assert=require('node:assert/strict');
const {monthlySourceConfig,validateMonthlySources}=require('../lib/operations/performance-source-config');
const {reportMonthlySources,monthlyComponentEvidence}=require('../lib/operations/performance-sources');
const {calculateMonthlyAppraisal}=require('../lib/operations/performance-policy');
const {defaultPerformanceSettings}=require('../lib/operations/performance-settings-config');
const {normalizeComponentEntry,changeMonthlyComponentEntry,listMonthlyComponentEntries}=require('../lib/operations/manual-appraisal');
const {prepareIsolatedEnvironment,assertIsolatedEnvironment}=require('./e2e/isolation');
const {PrismaClient}=require('@prisma/client');
const employee={id:'a',jobTitle:'Operator',employmentStatus:'ACTIVE'};
function sources(){const config=monthlySourceConfig();Object.assign(config.recognition,{active:true,includedReportTypes:['TRIP','BIRTHDAY'],levels:[{levelCode:'PLUS_3',points:3}],monthlyCap:10});Object.assign(config.guestFeedback,{active:true,eligibleTemplates:['SURVEY'],includeDirectFeedback:false,minimumResponses:1});return config;}
function report(id='r',overrides={}){return {id,branch:'SOURCE',workDate:'2091-11-04',reportType:'TRIP',status:'APPROVED',approvedBy:'reviewer',approvedAt:'2091-11-05T00:00:00Z',revision:2,source:{id:'booking',snapshot:{}},configSnapshot:{surveyTemplate:{code:'SURVEY',version:1}},draft:{participants:[{employeeId:'a'},{employeeId:'b',primaryLeader:true},{employeeId:'backup',backup:true}],adjustments:[{id:'award',employeeId:'a',levelCode:'PLUS_3',status:'APPROVED',approvedBy:'reviewer',scoreSnapshot:{approvedPoints:3},comment:'Approved evidence'}],survey:{answers:[{questionCode:'SERVICE',numericValue:4},{questionCode:'OTHER',numericValue:4}]}},...overrides};}
const options=(config=sources())=>({employeeId:'a',employee,branch:'SOURCE',startDate:'2091-11-01',endDate:'2091-11-30',sources:config});
test('Recognition and surveys use configured points, cap, actual attribution and one response per event without changing the 70/20/5/5 formula',()=>{
 const config=sources(),events=[...reportMonthlySources(report('r1'),options(config)),...reportMonthlySources(report('r2'),options(config))];
 const evidence=monthlyComponentEvidence(events,config);assert.equal(evidence.recognition.score,60);assert.equal(evidence.guestFeedback.score,75);assert.equal(evidence.guestFeedback.responseCount,2);
 const settings=defaultPerformanceSettings({appraisalFormula:{config:{dailyPerformance:70,attendanceReliability:20,recognition:5,guestFeedback:5}}});const result=calculateMonthlyAppraisal(settings,{dailyEvaluations:[{id:'daily',finalScore:50,maxScore:50,status:'REVIEWED',dayStatus:'CLOSED'}],componentScores:{attendanceReliability:100,recognition:60,guestFeedback:75},coverage:{expectedDays:1}});assert.equal(result.totalScore,96.75);assert.deepEqual(settings.monthlyAppraisal.formulaParameters,{dailyPerformance:70,attendanceReliability:20,recognition:5,guestFeedback:5});
 config.recognition.monthlyCap=2;assert.equal(monthlyComponentEvidence(reportMonthlySources(report(),options(config)),config).recognition.score,100);
});
test('cancelled/unapproved, wrong branch/date, backup employees, ineligible titles/statuses and removed feedback cannot score',()=>{
 const config=sources();for(const status of ['DRAFT','SUBMITTED','REVIEWED','CANCELLED','REOPENED'])assert.ok(reportMonthlySources(report('r',{status}),options(config)).every(row=>row.sourceType==='SOURCE_EXCLUSION'));
 assert.equal(reportMonthlySources(report(),{...options(config),branch:'OTHER'}).length,0);assert.equal(reportMonthlySources(report(),{...options(config),employeeId:'backup'}).length,0);
 assert.equal(reportMonthlySources(report(),{...options(config),startDate:'2091-12-01'}).length,0);
 config.recognition.eligibleJobTitles=['Leader'];config.guestFeedback.eligibleStatuses=['INACTIVE'];assert.ok(reportMonthlySources(report(),options(config)).every(row=>row.sourceType==='SOURCE_EXCLUSION'));
 const removed=report();removed.draft.survey.removed=true;assert.ok(!reportMonthlySources(removed,options()).some(row=>row.sourceType==='EVENT_SURVEY'));
});
test('minimum responses remain missing, equal shared birthday attribution and trip leader exclusions are explicit',()=>{
 const config=sources();config.guestFeedback.minimumResponses=2;const single=monthlyComponentEvidence(reportMonthlySources(report(),options(config)),config);assert.equal(single.guestFeedback.score,null);assert.equal(single.guestFeedback.reason,'MINIMUM_RESPONSES');
 const birthday=report('birthday',{reportType:'BIRTHDAY'});birthday.draft.participants=[{employeeId:'a',responsibleHost:true},{employeeId:'b',responsibleHost:true}];assert.equal(reportMonthlySources(birthday,options()).find(row=>row.sourceType==='EVENT_SURVEY').attributionWeight,.5);
 config.guestFeedback.tripLeaderWeight=0;assert.ok(!reportMonthlySources(report(),{...options(config),employeeId:'b'}).some(row=>row.sourceType==='EVENT_SURVEY'));
});
test('backup and unconfirmed actual participants cannot receive suitability evidence or daily event points',async()=>{
 const {collectPerformanceSources}=require('../lib/operations/performance-sources');
 const {getApprovedEventAdjustments}=require('../lib/operations/operational-report-service');
 const fixture=report();fixture.schemaVersion=1;fixture.history=[];fixture.configSnapshot.effective={value:defaultPerformanceSettings()};fixture.configSnapshot.processTemplate={steps:[{code:'ENTRY',active:true,branches:['*']}]};fixture.draft.steps=[{code:'ENTRY',completed:true}];fixture.draft.unresolvedIssues=[];
 const db={opsAttendanceRecord:{findMany:async()=>[]},opsEmployeeDailyEvaluation:{findMany:async()=>[]},employeeGuestFeedback:{findMany:async()=>[]},systemSetting:{findMany:async()=>[{key:'OPS_OPERATIONAL_REPORT:r',value:JSON.stringify(fixture)}]},opsDailyTrip:{findFirst:async()=>({id:'booking'})}};
 const args={employeeId:'a',employee,branch:'SOURCE',startDate:'2091-11-01',endDate:'2091-11-30'};
 for(const flags of [{backup:true},{actualParticipant:false}]){
  fixture.draft.participants=[{employeeId:'a',...flags}];
  assert.deepEqual(await collectPerformanceSources(db,{...args,profileCode:'TRIP_STAFF',monthlySources:sources()}),[]);
  assert.deepEqual(await getApprovedEventAdjustments(db,args),[]);
 }
 fixture.draft.participants=[{employeeId:'a',actualParticipant:true}];
 assert.equal((await collectPerformanceSources(db,{...args,profileCode:'TRIP_STAFF',monthlySources:sources()})).find(row=>row.sourceType==='OPERATIONAL_REPORT').metrics.processReliability,100);
 assert.equal((await getApprovedEventAdjustments(db,args))[0].points,3);
});
test('unconfigured rubrics and absent evidence never fabricate zero or redistribute weights; automatic sources supersede manual evidence visibly',()=>{
 const missing=monthlyComponentEvidence([],undefined);assert.equal(missing.recognition.score,null);assert.equal(missing.recognition.reason,'CONFIGURE_RECOGNITION');assert.equal(missing.guestFeedback.score,null);
 const automatic={id:'auto',sourceType:'GUEST_FEEDBACK',date:'2091-11-01',metrics:{guestFeedback:70},sourceSnapshot:{}},manual={id:'manual',sourceId:'manual',sourceType:'MANUAL_COMPONENT',date:'2091-11-01',metrics:{guestFeedback:100},sourceSnapshot:{reason:'Paper source'}};
 const result=monthlyComponentEvidence([automatic,manual]);assert.equal(result.guestFeedback.score,70);assert.equal(result.guestFeedback.mode,'AUTOMATIC');assert.deepEqual(result.guestFeedback.excludedManual,[{id:'manual',reason:'AUTOMATIC_SOURCE_AVAILABLE'}]);
});
test('explicit direct-feedback approval requirements fail closed while configured no-approval and legacy sources remain supported',async()=>{
 const {collectPerformanceSources}=require('../lib/operations/performance-sources');
 const feedback={id:'direct',feedbackDate:new Date('2091-11-04T12:00:00Z'),source:'GUEST',rating:4,status:'RESOLVED',createdBy:'creator'};
 const db={opsAttendanceRecord:{findMany:async()=>[]},opsEmployeeDailyEvaluation:{findMany:async()=>[]},employeeGuestFeedback:{findMany:async()=>[feedback]},systemSetting:{findMany:async()=>[]}};
 const args={employeeId:'a',employee,branch:'SOURCE',startDate:'2091-11-01',endDate:'2091-11-30'},config=sources();config.guestFeedback.includeDirectFeedback=true;
 const blocked=await collectPerformanceSources(db,{...args,monthlySources:config});
 assert.ok(!blocked.some(row=>row.metrics.guestFeedback!=null));assert.equal(blocked[0].exclusionReason,'DIRECT_FEEDBACK_APPROVAL_REQUIRED');
 config.guestFeedback.approvalRequired=false;
 assert.equal((await collectPerformanceSources(db,{...args,monthlySources:config}))[0].metrics.guestFeedback,75);
 assert.equal((await collectPerformanceSources(db,args))[0].metrics.guestFeedback,75);
 feedback.status='OPEN';
 assert.ok(!(await collectPerformanceSources(db,{...args,monthlySources:config})).some(row=>row.metrics.guestFeedback!=null));
});
test('source configuration and historical values reject malformed scales, dates, missing evidence and impossible counts',()=>{
 const issues=[];const config=sources();config.guestFeedback.ratingMaximum=1;config.recognition.effectiveFrom='invalid';validateMonthlySources(config,(path,message)=>issues.push(path+message));assert.ok(issues.some(issue=>issue.includes('ratingMaximum')));assert.ok(issues.some(issue=>issue.includes('effectiveFrom')));
 const context={branch:'SOURCE',year:2091,month:11},row={employeeId:'a',component:'recognition',value:80,source:'Original paper register',reason:'Verified signed paper evidence'};assert.equal(normalizeComponentEntry(row,context).month,'2091-11');for(const value of ['',null,'  ',false,[]])assert.throws(()=>normalizeComponentEntry({...row,value},context),/0 to 100/);assert.equal(normalizeComponentEntry({...row,value:0},context).value,0);assert.throws(()=>normalizeComponentEntry({...row,reason:''},context),/evidence/);for(const responseCount of [0,1.5])assert.throws(()=>normalizeComponentEntry({...row,component:'guestFeedback',responseCount},context),/response count/);
});
test('isolated historical entry/import is audited and idempotent, needs an independent approver, is reversible and cannot replace genuine automatic feedback',async()=>{
 prepareIsolatedEnvironment();assertIsolatedEnvironment();const db=new PrismaClient();try{
  const user=await db.user.create({data:{name:'Source fixture proposer',username:'source-proposer-'+Date.now(),password:'test-unusable',role:'ADMIN'}}),reviewer=await db.user.create({data:{name:'Source fixture reviewer',username:'source-reviewer-'+Date.now(),password:'test-unusable',role:'ADMIN'}}),worker=await db.employee.create({data:{name:'Source fixture employee',branch:'SOURCE'}});
  const args={branch:'SOURCE',year:2091,month:11},rows=[{employeeId:worker.id,component:'recognition',value:80,source:'Signed paper recognition log',evidence:'Paper archive index P-12',reason:'Legitimate historical evidence fixture'}];
  const first=await changeMonthlyComponentEntry(db,{...args,user,action:'appraisalSourcePropose',rows}),again=await changeMonthlyComponentEntry(db,{...args,user,action:'appraisalSourcePropose',rows});assert.equal(first.entries[0].id,again.entries[0].id);assert.equal((await listMonthlyComponentEntries(db,args)).length,1);
  await assert.rejects(changeMonthlyComponentEntry(db,{...args,user,action:'appraisalSourceApprove',id:first.entries[0].id,reason:'Verify independent source approval'}),/independent approver/);
  const approved=await changeMonthlyComponentEntry(db,{...args,user:reviewer,action:'appraisalSourceApprove',id:first.entries[0].id,reason:'Independent review of paper source'});assert.equal(approved.entries[0].status,'APPROVED');assert.equal(approved.entries[0].approvedBy,reviewer.id);const count=await db.auditLog.count({where:{action:'OPS_MONTHLY_COMPONENT_APPROVED',userId:reviewer.id}});await changeMonthlyComponentEntry(db,{...args,user:reviewer,action:'appraisalSourceApprove',id:first.entries[0].id,reason:'Identical approval retry'});assert.equal(await db.auditLog.count({where:{action:'OPS_MONTHLY_COMPONENT_APPROVED',userId:reviewer.id}}),count);
  const {collectPerformanceSources}=require('../lib/operations/performance-sources');let events=await collectPerformanceSources(db,{employeeId:worker.id,branch:'SOURCE',startDate:'2091-11-01',endDate:'2091-11-30'});assert.equal(monthlyComponentEvidence(events).recognition.score,80);
  await changeMonthlyComponentEntry(db,{...args,user:reviewer,action:'appraisalSourceCancel',id:first.entries[0].id,reason:'Original evidence was revoked'});events=await collectPerformanceSources(db,{employeeId:worker.id,branch:'SOURCE',startDate:'2091-11-01',endDate:'2091-11-30'});assert.equal(monthlyComponentEvidence(events).recognition.score,null);assert.equal((await listMonthlyComponentEntries(db,args))[0].history.length,3);
  await db.employeeGuestFeedback.create({data:{employeeId:worker.id,feedbackDate:new Date('2091-11-04T12:00:00Z'),source:'GUEST',rating:5,status:'RESOLVED',comment:'Actual source fixture',createdBy:user.id}});
  const guest=await changeMonthlyComponentEntry(db,{...args,user,action:'appraisalSourcePropose',rows:[{...rows[0],component:'guestFeedback'}]});await assert.rejects(changeMonthlyComponentEntry(db,{...args,user:reviewer,action:'appraisalSourceApprove',id:guest.entries[0].id,reason:'Cannot silently override approved source'}),/cannot replace approved automatic/);
 }finally{await db.$disconnect();}
});
test('genuine approved report sources adjust the exact daily row once, flow through monthly weighting and reverse when the booking is cancelled',async()=>{
 prepareIsolatedEnvironment();assertIsolatedEnvironment();const db=new PrismaClient();try{
  const proposer=await db.user.create({data:{name:'Automatic source proposer',username:'auto-source-proposer-'+Date.now(),password:'test-unusable',role:'ADMIN'}}),reviewer=await db.user.create({data:{name:'Automatic source reviewer',username:'auto-source-reviewer-'+Date.now(),password:'test-unusable',role:'ADMIN'}}),worker=await db.employee.create({data:{name:'Automatic source employee',branch:'SOURCEAUTO',jobTitle:'Operator',operationsTeamLeader:true}}),date='2092-04-04';
  const service=require('../lib/operations/performance-settings-service'),state=await service.getPerformanceSettingsState(db,'GLOBAL',{date}),value=structuredClone(state.effective.value);value.monthlyAppraisal.formulaParameters={dailyPerformance:70,attendanceReliability:20,recognition:5,guestFeedback:5};value.staffing.requireAvailability=false;value.monthlyAppraisal.sources=sources();value.monthlyAppraisal.sources.guestFeedback.eligibleTemplates=['AUTO_SURVEY'];
  value.surveyTemplates.push({code:'AUTO_SURVEY',reportType:'TRIP',version:1,active:true,label:'Source fixture survey',labelAr:'استبيان مصدر للاختبار',branches:['SOURCEAUTO'],effectiveFrom:'2092-04-01',effectiveTo:null,paperImageRequired:false,questions:[{code:'SERVICE',active:true,order:1,required:true,text:'Service rating',textAr:'تقييم الخدمة',choices:[{code:'GOOD',active:true,label:'Good',labelAr:'جيد',numericValue:4,commentRequired:false,followUpSuggested:false},{code:'POOR',active:true,label:'Poor',labelAr:'ضعيف',numericValue:1,commentRequired:false,followUpSuggested:false}]}]});
  let changed=await service.changePerformanceSettings(db,{user:proposer,scope:'GLOBAL',action:'saveDraft',expectedRevision:state.revision,value,reason:'Configure genuine automatic source fixture'});changed=await service.changePerformanceSettings(db,{user:proposer,scope:'GLOBAL',action:'publish',expectedRevision:changed.state.revision,effectiveFrom:'2092-04-01',reason:'Publish automatic source fixture rubric'});
  const effective=await service.getEffectivePerformanceSettings(db,{branch:'SOURCEAUTO',date});
  const day=await db.opsDailyEvaluationDay.create({data:{evaluationDate:date,version:1,status:'CLOSED',criteriaVersionId:effective.value.evaluation.criteriaVersionId}}),evaluation=await db.opsEmployeeDailyEvaluation.create({data:{dailyEvaluationDayId:day.id,employeeId:worker.id,status:'REVIEWED',finalScore:40,maxScore:50}}),attendance=await db.opsAttendanceDay.create({data:{workDate:date,version:1,status:'FINALIZED'}});await db.opsAttendanceRecord.create({data:{attendanceDayId:attendance.id,employeeId:worker.id,status:'PRESENT',expectedCode:'AM'}});
  const trip=await db.opsDailyTrip.create({data:{branch:'SOURCEAUTO',workDate:date,name:'Source fixture booked school',startTime:'10:00',endTime:'12:00'}}),reports=require('../lib/operations/operational-report-service');
  let created=await reports.changeOperationalReport(db,{user:proposer,action:'create',reportType:'TRIP',sourceId:trip.id,branch:'SOURCEAUTO',idempotencyKey:'source-auto-report',surveyTemplateCode:'AUTO_SURVEY',draft:{participants:[{employeeId:worker.id,primaryLeader:true}],steps:[{code:'REPORT_REVIEW',completed:true}],survey:{answers:[{questionCode:'SERVICE',choiceCode:'GOOD'}]},adjustments:[{employeeId:worker.id,levelCode:'PLUS_3',comment:'Approved genuine operational award',evidence:[]}]}});
  created=await reports.changeOperationalReport(db,{user:reviewer,action:'approve',id:created.report.id,expectedRevision:created.report.revision,reason:'Independent source fixture approval'});
  const args={employeeId:worker.id,branch:'SOURCEAUTO',year:2092,month:4},preview=await require('../lib/operations/monthly-summary').previewMonthlyAppraisal(db,args);assert.equal(preview.summary.sourceEvidence.recognition.score,30);assert.equal(preview.summary.sourceEvidence.guestFeedback.score,75);assert.equal(preview.summary.sourceEvidence.guestFeedback.responseCount,1);assert.equal(preview.summary.dailyDetails[0].baseFinalScore,40);assert.equal(preview.summary.dailyDetails[0].finalScore,43);assert.equal(preview.summary.eventAdjustments[0].application,'IN_DAILY_SOURCE');assert.equal(preview.result.components.eventAdjustment,0);assert.equal(preview.result.totalScore,85.45);
  const again=await require('../lib/operations/monthly-summary').previewMonthlyAppraisal(db,args);assert.equal(again.fingerprint,preview.fingerprint);assert.equal((await db.opsEmployeeDailyEvaluation.findUnique({where:{id:evaluation.id}})).finalScore,40);
  await db.opsDailyTrip.update({where:{id:trip.id},data:{status:'CANCELLED'}});const cancelled=await require('../lib/operations/monthly-summary').previewMonthlyAppraisal(db,args);assert.equal(cancelled.summary.dailyDetails[0].finalScore,40);assert.equal(cancelled.summary.sourceEvidence.recognition.score,null);assert.equal(cancelled.summary.sourceEvidence.guestFeedback.score,null);assert.ok(cancelled.summary.sourceEvidence.guestFeedback.excluded.some(row=>row.reason==='CANCELLED_EVENT'));
 }finally{await db.$disconnect();}
});
