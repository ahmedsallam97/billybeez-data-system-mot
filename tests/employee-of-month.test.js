const test=require('node:test'),assert=require('node:assert/strict');
const {prepareIsolatedEnvironment,assertIsolatedEnvironment}=require('./e2e/isolation');
const {PrismaClient}=require('@prisma/client');
const {loadEmployeeOfMonth,syncMonthlySummaries,rankRows,createCompetition}=require('../lib/operations/employee-of-month');
const {previewMonthlyAppraisal}=require('../lib/operations/monthly-summary');
const {changePerformanceSettings,getPerformanceSettingsState}=require('../lib/operations/performance-settings-service');
const {calculateMonthlyAppraisal}=require('../lib/operations/performance-policy');
test('all existing months expose real day counts; October is blocked by unavailable configured components, not missing daily data',async()=>{
 prepareIsolatedEnvironment();assertIsolatedEnvironment();const db=new PrismaClient();try{
 const view=await loadEmployeeOfMonth(db,{branch:'MOT',year:2026,month:10});assert.equal(view.stats.completedEmployeeDays,23);assert.equal(view.stats.evaluatedEmployees,13);assert.equal(view.state,'MISSING_COMPONENTS');assert.equal(view.rows.length,13);assert.equal(view.periods.find(row=>row.period==='2026-09').recordedEmployeeDays,111);assert.equal(view.periods.find(row=>row.period==='2026-10').completedEmployeeDays,23);
 const user=await db.user.findFirst({where:{active:true,role:'ADMIN'}});
 const originalDailyRecordCount=await db.opsEmployeeDailyEvaluation.count({where:{dailyEvaluationDay:{evaluationDate:{gte:'2026-10-01',lte:'2026-10-31'}}}});
 await db.systemSetting.deleteMany({where:{key:{startsWith:'OPS_MONTHLY_SUMMARY:MOT:2026-10:'}}});
 const first=await syncMonthlySummaries(db,{user,branch:'MOT',year:2026,month:10});assert.equal(first.changes.length,13);assert.equal(await db.opsMonthlyAppraisal.count({where:{year:2026,month:10}}),0);
 const repeated=await syncMonthlySummaries(db,{user,branch:'MOT',year:2026,month:10});assert.equal(repeated.changes.length,0);assert.equal(await db.opsEmployeeDailyEvaluation.count({where:{dailyEvaluationDay:{evaluationDate:{gte:'2026-10-01',lte:'2026-10-31'}}}}),originalDailyRecordCount);
 assert.ok(view.rows.every(row=>row.finalResult===null&&!row.eligible&&row.missingComponents.includes('recognition')));
 assert.ok(view.rows.every(row=>!row.exclusionReasons.includes('INSUFFICIENT_COVERAGE')));
 }finally{await db.$disconnect();}
});
test('daily-derived weighted results, missing days, source corrections, duplicate versions, branch isolation, explicit ranking and frozen published decisions',async()=>{
 prepareIsolatedEnvironment();assertIsolatedEnvironment();const db=new PrismaClient();try{
 const branch='EOMTEST',date='2097-05-04',user=await db.user.create({data:{name:'EOM test manager',username:'eom-'+Date.now(),password:'unusable',role:'ADMIN'}});
 const state=await getPerformanceSettingsState(db,'GLOBAL',{date}),value=structuredClone(state.effective.value);
 value.monthlyAppraisal.formulaParameters={dailyPerformance:80,attendanceReliability:20};value.monthlyAppraisal.employeeOfMonth={minimumDailyEvaluations:2,minimumScore:0,activeEmployeesOnly:true,requireMonthlyApproval:true,tieBreakers:['FINAL_SCORE','COMPLETED_DAYS','EMPLOYEE_NAME','EMPLOYEE_ID']};
 let change=await changePerformanceSettings(db,{user,scope:'GLOBAL',action:'saveDraft',expectedRevision:state.revision,value,reason:'Prepare isolated employee-month rules'});
 change=await changePerformanceSettings(db,{user,scope:'GLOBAL',action:'publish',expectedRevision:change.state.revision,effectiveFrom:'2097-05-01',reason:'Publish isolated employee-month rules'});
 const criteriaVersionId=change.state.history.find(row=>row.effectiveFrom==='2097-05-01').value.evaluation.criteriaVersionId;
 const employee=await db.employee.create({data:{name:'Zara EOM',branch,jobTitle:'Ride Operator'}});
 const second=await db.employee.create({data:{name:'Adam EOM',branch,jobTitle:'Ride Operator'}});
 const schedule=await db.opsSchedule.create({data:{year:2097,month:5,operationalYear:2097,operationalMonth:5,version:99,status:'PUBLISHED',periodStart:'2097-05-01',periodEnd:'2097-05-31'}});
 for(const [dayDate,score,late] of [['2097-05-04',40,0],['2097-05-05',30,10]]){
  const day=await db.opsDailyEvaluationDay.create({data:{evaluationDate:dayDate,version:99,status:'CLOSED',criteriaVersionId}});
  const attendance=await db.opsAttendanceDay.create({data:{workDate:dayDate,version:99,status:'FINALIZED'}});
  for(const person of [employee,second]){await db.opsEmployeeDailyEvaluation.create({data:{dailyEvaluationDayId:day.id,employeeId:person.id,status:'REVIEWED',finalScore:score,maxScore:50}});await db.opsAttendanceRecord.create({data:{attendanceDayId:attendance.id,employeeId:person.id,expectedCode:'AM',status:late?'LATE':'PRESENT',lateMinutes:late}});await db.opsScheduleAssignment.create({data:{scheduleId:schedule.id,employeeId:person.id,workDate:dayDate,code:'AM',shiftCode:'AM',source:'TEST'}});}
 }
 await db.opsScheduleAssignment.create({data:{scheduleId:schedule.id,employeeId:employee.id,workDate:'2097-05-06',code:'AM',shiftCode:'AM',source:'TEST'}});
 const preview=await previewMonthlyAppraisal(db,{employeeId:employee.id,branch,year:2097,month:5});assert.equal(preview.summary.completedDays,2);assert.equal(preview.summary.expectedDays,3);assert.deepEqual(preview.summary.missingDates,['2097-05-06']);assert.equal(preview.summary.dailyAggregate,70);assert.equal(preview.summary.finalResult,66);assert.equal(preview.summary.components.componentScores.attendanceReliability,50);
 await assert.rejects(previewMonthlyAppraisal(db,{employeeId:employee.id,branch:'MOT',year:2097,month:5}),/another branch/);
 let synced=await syncMonthlySummaries(db,{user,branch,year:2097,month:5});assert.equal(synced.changes.length,2);
 await db.opsMonthlyAppraisal.updateMany({where:{employeeId:{in:[employee.id,second.id]},year:2097,month:5},data:{status:'APPROVED'}});
 let view=await loadEmployeeOfMonth(db,{branch,year:2097,month:5});assert.equal(view.rows.length,2);assert.equal(view.rows[0].employee.id,second.id);assert.equal(view.rows[0].rank,1);
 await assert.rejects(createCompetition(db,{user,branch,year:2097,month:5,expectedFingerprint:'stale'}),/changed/);
 const created=await createCompetition(db,{user,branch,year:2097,month:5,expectedFingerprint:view.sourceFingerprint});await db.opsEotmCompetition.update({where:{id:created.competition.id},data:{status:'LOCKED',winnerEmployeeId:second.id}});
 await db.opsEmployeeDailyEvaluation.updateMany({where:{employeeId:second.id,dailyEvaluationDay:{evaluationDate:'2097-05-04'}},data:{finalScore:20,status:'MODIFIED'}});
 synced=await syncMonthlySummaries(db,{user,branch,year:2097,month:5});assert.equal(synced.changes.length,0);
 view=await loadEmployeeOfMonth(db,{branch,year:2097,month:5});assert.equal(view.sourceChanged,true);assert.equal(view.rows[0].finalResult,66);assert.equal(view.frozen,true);await assert.rejects(syncMonthlySummaries(db,{user,branch,year:2097,month:5,explicit:true,reason:'Explicit source update'}),/Reopen/);
 await db.opsEotmCompetition.update({where:{id:created.competition.id},data:{status:'REOPENED'}});
 const oldApproved=await db.opsMonthlyAppraisal.findFirst({where:{employeeId:second.id,year:2097,month:5},orderBy:{version:'desc'}});
 await syncMonthlySummaries(db,{user,branch,year:2097,month:5,explicit:true,reason:'Explicit source correction review'});assert.equal((await db.opsMonthlyAppraisal.findUnique({where:{id:oldApproved.id}})).totalScore,66);assert.equal(await db.opsMonthlyAppraisal.count({where:{employeeId:second.id,year:2097,month:5}}),2);
 const newer=await db.opsDailyEvaluationDay.create({data:{evaluationDate:'2097-05-05',version:100,status:'OPEN',criteriaVersionId}});await db.opsEmployeeDailyEvaluation.create({data:{dailyEvaluationDayId:newer.id,employeeId:employee.id,status:'DEFAULT_FULL',finalScore:50,maxScore:50}});
 const reopened=await previewMonthlyAppraisal(db,{employeeId:employee.id,branch,year:2097,month:5});assert.equal(reopened.summary.completedDays,1);assert.equal(reopened.summary.incompleteDays,1);
 await db.opsEmployeeDailyEvaluation.deleteMany({where:{employeeId:employee.id,dailyEvaluationDay:{evaluationDate:'2097-05-04'}}});assert.equal((await previewMonthlyAppraisal(db,{employeeId:employee.id,branch,year:2097,month:5})).summary.completedDays,0);
 }finally{await db.$disconnect();}
});
test('approved event effects are applied once and configured caps/ignore treatment stay intact',()=>{
 const value=require('../lib/operations/performance-settings-config').defaultPerformanceSettings();value.monthlyAppraisal.formulaParameters={dailyPerformance:100};value.monthlyAppraisal.finalScoreMaximum=100;value.monthlyAppraisal.monthlyPositiveCap=5;value.monthlyAppraisal.monthlyNegativeCap=3;
 const dailyEvaluations=[{id:'day',date:'2026-10-10',evaluationStatus:'REVIEWED',dayStatus:'CLOSED',finalScore:40,maxScore:50}];
 const plus={id:'bonus',sourceReportId:'trip',status:'APPROVED',points:3};const minus={id:'penalty',sourceReportId:'birthday',status:'APPROVED',points:-2};
 const result=calculateMonthlyAppraisal(value,{dailyEvaluations,eventAdjustments:[plus,plus,minus,minus],coverage:{expectedDays:1}});assert.equal(result.totalScore,81);assert.equal(result.components.sourceCounts.approvedEventAdjustments,2);
 value.monthlyAppraisal.eventAdjustmentTreatment='IGNORE';assert.equal(calculateMonthlyAppraisal(value,{dailyEvaluations,eventAdjustments:[plus],coverage:{expectedDays:1}}).totalScore,80);
});
test('configurable tie-breaking uses completed days then deterministic name/ID without modifying inputs',()=>{
 const make=(id,name,days)=>({employee:{id,name},eligible:true,finalResult:90,completedDays:days});const rows=[make('b','Zara',2),make('a','Adam',2),make('c','More',3)];const original=structuredClone(rows);const result=rankRows(rows,{tieBreakers:['FINAL_SCORE','COMPLETED_DAYS','EMPLOYEE_NAME','EMPLOYEE_ID']});assert.deepEqual(result.map(row=>row.employee.id),['c','a','b']);assert.deepEqual(rows,original);
});
