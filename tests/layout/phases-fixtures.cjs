const fs=require('node:fs'),{createHmac,randomBytes}=require('node:crypto');
const {PrismaClient}=require('@prisma/client');
const {assertIsolatedEnvironment}=require('../e2e/isolation');
async function prepare(){
 assertIsolatedEnvironment();const db=new PrismaClient();
 try{
  const key='PHASE_COMPLETION_BROWSER_FIXTURE';const prior=await db.systemSetting.findUnique({where:{key}});if(prior)return JSON.parse(prior.value);
  const accounts=require('../../lib/accounts/service'),permissions=require('../e2e/account-fixtures');
  const rawAdmin=await db.user.findFirst({where:{role:'ADMIN',active:true}}),admin=await accounts.loadAccount(db,rawAdmin);
  const genuine=await require('../../lib/operations/employee-of-month').loadEmployeeOfMonth(db,{branch:'MOT',year:2026,month:10});
  const reviewer=await db.user.create({data:{username:'phase-reviewer-'+randomBytes(5).toString('hex'),name:'Independent phase fixture reviewer',password:'unusable-test-password',role:'ADMIN',active:true}});await permissions.registerAccountFixture(db,reviewer);
  const reviewerAccount=await accounts.loadAccount(db,reviewer);
  const branch='SOURCE_UI',data={branch,reviewer:reviewerAccount.id,reviewerVersion:reviewerAccount.profile.sessionVersion||0,genuineOctober:{stats:genuine.stats,formula:genuine.formula.formulaParameters||genuine.formula},variants:{}};
  const schedule=await db.opsSchedule.create({data:{year:2097,month:6,operationalYear:2097,operationalMonth:6,periodStart:'2097-06-01',periodEnd:'2097-06-30',version:1,status:'PUBLISHED'}});
  await db.systemSetting.create({data:{key:'OPS_SCHEDULE_STATE:'+schedule.id,value:JSON.stringify({branch,revision:0,dayResponsibilities:{}})}});
  const svc=require('../../lib/operations/performance-settings-service'),state=await svc.getPerformanceSettingsState(db,'GLOBAL',{date:'2097-06-30'}),value=structuredClone(state.effective.value);
  const sourceConfig=require('../../lib/operations/performance-source-config').monthlySourceConfig();
  Object.assign(sourceConfig.recognition,{active:true,includedReportTypes:['TRIP','BIRTHDAY','SHIFT_LEADERSHIP'],levels:[{levelCode:'PLUS_3',points:3}],monthlyCap:10,branches:[branch]});
  Object.assign(sourceConfig.guestFeedback,{active:true,eligibleTemplates:['PHASE_TRIP_SURVEY','PHASE_BIRTHDAY_SURVEY'],includeDirectFeedback:false,minimumResponses:1,branches:[branch]});
  value.monthlyAppraisal.sources=sourceConfig;
  Object.assign(value.shiftLeadership,{active:true,enabledBranches:[branch],selectedDates:['2097-06-15','2097-06-16'],requiredWeekdays:[],shiftCodes:['AM'],automaticReportCreation:true});
  value.reports.SHIFT_LEADERSHIP.active=true;value.staffing.minimumRequiredBirthdayHosts=1;value.staffing.maximumResponsibleBirthdayHosts=2;
  for(const type of ['TRIP','BIRTHDAY']){
   value.reports[type].active=true;value.reports[type].surveyRequired=true;
   value.processTemplates=value.processTemplates.filter(row=>row.reportType!==type);
   value.surveyTemplates=value.surveyTemplates.filter(row=>row.reportType!==type);
   value.processTemplates.push({code:'PHASE_'+type+'_PROCESS',reportType:type,version:1,active:true,label:'Test-only '+type+' workflow',labelAr:'مسار تجريبي فقط',instructions:'Isolated workflow test',instructionsAr:'اختبار معزول',branches:[branch],effectiveFrom:'2097-06-01',effectiveTo:null,steps:require('../../lib/operations/report-process-suggestions').appendProcessSuggestions(type)});
   value.processTemplates.push({...structuredClone(value.processTemplates.at(-1)),code:'PHASE_'+type+'_ALTERNATIVE_PROCESS',label:'Alternative test-only process',labelAr:'عملية تجريبية بديلة'});
   value.surveyTemplates.push({code:'PHASE_'+type+'_SURVEY',reportType:type,version:1,active:true,label:'Test-only service survey',labelAr:'استبيان تجريبي فقط',paperImageRequired:false,branches:[branch],effectiveFrom:'2097-06-01',effectiveTo:null,questions:[{code:'SERVICE',order:1,active:true,text:'Verified test service rating',textAr:'تقييم خدمة تجريبي موثق',required:true,choices:[{code:'GOOD',label:'Good',labelAr:'جيد',numericValue:4,active:true,order:1,commentRequired:false,followUpSuggested:false},{code:'POOR',label:'Poor',labelAr:'ضعيف',numericValue:1,active:true,order:2,commentRequired:false,followUpSuggested:false}]}]});
   value.surveyTemplates.push({...structuredClone(value.surveyTemplates.at(-1)),code:'PHASE_'+type+'_ALTERNATIVE_SURVEY',label:'Alternative test-only survey',labelAr:'استبيان تجريبي بديل'});
  }
  let publication=await svc.changePerformanceSettings(db,{user:admin,scope:'GLOBAL',action:'saveDraft',expectedRevision:state.revision,value,reason:'Prepare isolated future report/source workflows'});
  await svc.changePerformanceSettings(db,{user:admin,scope:'GLOBAL',action:'publish',expectedRevision:publication.state.revision,effectiveFrom:'2097-06-01',reason:'Publish isolated future report/source workflows'});
  for(const [language,date]of [['en','2097-06-15'],['ar','2097-06-16']]){
   const employees=[];for(const [i,shift]of ['AM','AM','PM','PM','PM'].entries()){const employee=await db.employee.create({data:{name:`TEST ${language} operator ${i}`,nameEn:`TEST ${language} operator ${i}`,branch,department:'OPERATION',jobTitle:'Ride Operator',hireDate:new Date('2097-06-01'),operationsTeamLeader:i===0}});employees.push({...employee,shift});await db.opsScheduleAssignment.create({data:{scheduleId:schedule.id,employeeId:employee.id,workDate:date,code:shift,shiftCode:shift,source:'ISOLATED_PHASE_TEST'}});}
   const effective=await svc.getEffectivePerformanceSettings(db,{branch,date});
   const evalDay=await db.opsDailyEvaluationDay.create({data:{evaluationDate:date,version:1,status:'CLOSED',criteriaVersionId:effective.value.evaluation.criteriaVersionId}});
   await svc.capturePerformanceSettingsSnapshot(db,{kind:'EVALUATION_DAY',recordId:evalDay.id,branch,date,user:admin});
   await db.opsEmployeeDailyEvaluation.create({data:{dailyEvaluationDayId:evalDay.id,employeeId:employees[0].id,status:'REVIEWED',finalScore:40,maxScore:50}});
   const attendance=await db.opsAttendanceDay.create({data:{workDate:date,version:1,status:'FINALIZED'}});await db.opsAttendanceRecord.createMany({data:employees.map(employee=>({attendanceDayId:attendance.id,employeeId:employee.id,status:'PRESENT',expectedCode:employee.shift,lateMinutes:0}))});
   const trip=await db.opsDailyTrip.create({data:{branch,workDate:date,name:`TEST ${language} booked school`,startTime:'10:00',endTime:'12:00',expectedChildren:50}}),birthday=await db.opsDailyEvent.create({data:{branch,workDate:date,eventType:'BIRTHDAY',name:`TEST ${language} booked birthday`,childName:`TEST ${language} child`,startTime:'16:00',endTime:'18:00'}});
   const duties=require('../../lib/operations/day-responsibilities');const loaded=await duties.loadResponsibilities(db,admin,{branch,date,scheduleId:schedule.id});
   const assigned=await duties.saveResponsibilities(db,admin,{branch,date,scheduleId:schedule.id,expectedRevision:loaded.previous.state.revision,values:{AM:employees[0].id,PM:employees[2].id,TRIP:employees[0].id,BIRTHDAY:employees[2].id}});
   data.variants[language]={date,employees:employees.map(row=>({id:row.id,name:row.name,shift:row.shift})),tripId:trip.id,birthdayId:birthday.id,shiftReportId:assigned.leadershipReports.created[0]};
  }
  await db.systemSetting.create({data:{key,value:JSON.stringify(data)}});return data;
 }finally{await db.$disconnect();}
}
function reviewerStorage(data){const now=Math.floor(Date.now()/1000),payload=Buffer.from(JSON.stringify({sub:data.reviewer,sv:data.reviewerVersion,iat:now,exp:now+3600,jti:randomBytes(16).toString('hex'),v:1})).toString('base64url');return {cookies:[{name:process.env.AUTH_COOKIE_NAME,value:payload+'.'+createHmac('sha256',process.env.SESSION_SECRET).update(payload).digest('base64url'),domain:'127.0.0.1',path:'/',httpOnly:true,sameSite:'Strict'}],origins:[]};}
module.exports={prepare,reviewerStorage};
