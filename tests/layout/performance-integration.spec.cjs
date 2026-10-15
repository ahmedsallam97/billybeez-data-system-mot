const {openDisclosure}=require("./disclosures.cjs");
require('../e2e/account-fixtures').installLanguageFixture();
const {test,expect}=require('@playwright/test');
const {PrismaClient}=require('@prisma/client');
const {createHmac,randomBytes}=require('node:crypto');
const {assertIsolatedEnvironment}=require('../e2e/isolation');
const settingsUrl='/api/operations/performance-settings';
const copy=value=>JSON.parse(JSON.stringify(value));
function auth(id){const now=Math.floor(Date.now()/1000);const token=Buffer.from(JSON.stringify({sub:id,iat:now,exp:now+3600,jti:randomBytes(16).toString('hex'),v:1})).toString('base64url');return{cookies:[{name:process.env.AUTH_COOKIE_NAME,value:token+'.'+createHmac('sha256',process.env.SESSION_SECRET).update(token).digest('base64url'),domain:'127.0.0.1',path:'/',expires:now+3600,httpOnly:true,secure:false,sameSite:'Strict'}],origins:[]};}
async function json(response){const payload=await response.json();expect(response.ok(),JSON.stringify(payload)).toBeTruthy();return payload;}
test('database publication changes new evaluations, appraisals and reports while preserving prior snapshots',async({playwright})=>{
 assertIsolatedEnvironment();const db=new PrismaClient();let request,reviewer;
 try{
  const actor=await db.user.create({data:{name:'Isolated configuration reviewer',username:'e2e-config-'+Date.now(),password:'unusable-test-only-account',role:'ADMIN'}});
  await require('../e2e/account-fixtures').registerAccountFixture(db,actor);
  request=await playwright.request.newContext({baseURL:'http://127.0.0.1:3018',storageState:auth(actor.id)});
  const reviewerUser=await db.user.create({data:{name:'Independent isolated report reviewer',username:'e2e-review-'+Date.now(),password:'unusable-test-only-account',role:'ADMIN'}});
  await require('../e2e/account-fixtures').registerAccountFixture(db,reviewerUser);
  reviewer=await playwright.request.newContext({baseURL:'http://127.0.0.1:3018',storageState:auth(reviewerUser.id)});
  const employee=await db.employee.findFirst({where:{active:true,employmentStatus:'ACTIVE',department:'OPERATION',OR:[{branch:'MOT'},{branch:null}]}});expect(employee).toBeTruthy();
  const dates=['2099-11-03','2099-11-04'];
  const schedule=await db.opsSchedule.create({data:{year:2099,month:11,operationalYear:2099,operationalMonth:11,periodStart:'2099-11-01',periodEnd:'2099-11-30',version:99,status:'PUBLISHED'}});
  for(const workDate of dates)await db.opsScheduleAssignment.create({data:{scheduleId:schedule.id,employeeId:employee.id,workDate,code:'AM',shiftCode:'AM',source:'E2E'}});
  const state=(await json(await request.get(settingsUrl+'?scope=GLOBAL&date=2099-11-01'))).state;
  let revision=state.revision;let config=copy(state.effective.value);
  config.evaluation.criteria.forEach((criterion,index)=>{criterion.active=index===0;criterion.maxScore=20;});config.evaluation.rules.penaltyDeduction=7;config.monthlyAppraisal.formulaParameters={dailyPerformance:100};
  async function publish(effectiveFrom){let result=await json(await request.post(settingsUrl,{data:{scope:'GLOBAL',action:'saveDraft',expectedRevision:revision,config,reason:'Isolated regression configuration update'}}));revision=result.state.revision;result=await json(await request.post(settingsUrl,{data:{scope:'GLOBAL',action:'publish',expectedRevision:revision,effectiveFrom,reason:'Publish isolated dated regression version'}}));revision=result.state.revision;config=copy(result.change.publication?.value||result.state.history.find(item=>item.effectiveFrom===effectiveFrom)?.value||config);return result;}
  await publish('2099-11-01');
  async function evaluate(date,expectedMax,expectedPenalty){await json(await request.post('/api/operations/evaluations',{data:{action:'open',date,branch:'MOT'}}));let value=await json(await request.get('/api/operations/evaluations?date='+date));expect(value.rules.penaltyDeduction).toBe(expectedPenalty);expect(value.criteriaVersion.criteria).toHaveLength(1);expect(value.day.evaluations[0].maxScore).toBe(expectedMax);await json(await request.post('/api/operations/evaluations',{data:{action:'save',date,evaluations:[{employeeId:employee.id,exceptions:[],penaltyNote:'Reviewed operational penalty'}]}}));await json(await request.post('/api/operations/evaluations',{data:{action:'close',date}}));value=await json(await request.get('/api/operations/evaluations?date='+date));return value.day.evaluations.find(item=>item.employeeId===employee.id);}
  const original=await evaluate(dates[0],20,7);expect(original.finalScore).toBe(13);
  const firstAppraisal=(await json(await request.post('/api/operations/performance',{data:{action:'appraisalCalculate',year:2099,month:11,employeeId:employee.id,reason:'Calculate verified first source records'}}))).appraisal;expect(firstAppraisal.totalScore).toBe(65);
  await json(await request.post('/api/operations/performance',{data:{action:'appraisalApprove',appraisalId:firstAppraisal.id}}));
  async function report(date){const source=await db.opsDailyTrip.create({data:{branch:'MOT',workDate:date,name:'Isolated report '+date,startTime:'10:00',endTime:'12:00'}});const created=(await json(await request.post('/api/operations/reports',{data:{action:'create',reportType:'TRIP',sourceId:source.id,branch:'MOT',workDate:date,reason:'Create verified source report',draft:{everythingPlanned:true,summary:'Verified operation completed',participants:[{employeeId:employee.id,role:'TRIP_TEAM_LEADER',primaryLeader:true,isTeamLeader:true}],adjustments:[{employeeId:employee.id,levelCode:'PLUS_1',comment:'Verified approved evidence'}]}}}))).report;return(await json(await reviewer.post('/api/operations/reports',{data:{action:'approve',id:created.id,expectedRevision:created.revision,reason:'Review and approve source report'}}))).report;}
  const firstReport=await report(dates[0]);expect(firstReport.draft.adjustments[0].scoreSnapshot.appliedPoints).toBe(1);
  config.evaluation.criteria[0].maxScore=30;config.evaluation.rules.penaltyDeduction=3;config.rewards.performanceLevels.find(item=>item.code==='PLUS_1').points=2;
  Object.assign(config.shiftLeadership,{active:true,enabledBranches:['MOT'],requiredWeekdays:[],selectedDates:[dates[1]],shiftCodes:['AM'],teamLeaderRequired:false,automaticReportCreation:true,reportDueTime:'18:30'});
  await publish('2099-11-04');
  const shiftCountBefore=await db.systemSetting.count({where:{key:{startsWith:'OPS_OPERATIONAL_REPORT:SHIFT_LEADERSHIP:'}}});
  await json(await request.get('/api/operations/daily?date='+dates[1]));
  expect(await db.systemSetting.count({where:{key:{startsWith:'OPS_OPERATIONAL_REPORT:SHIFT_LEADERSHIP:'}}})).toBe(shiftCountBefore);
  const opened=await json(await request.post('/api/operations/daily',{data:{action:'open',date:dates[1],branch:'MOT'}}));
  expect(opened.leadershipReports.warnings).toEqual([]);expect(opened.leadershipReports.created).toHaveLength(1);
  const repeated=await json(await request.post('/api/operations/daily',{data:{action:'open',date:dates[1],branch:'MOT'}}));expect(repeated.leadershipReports.created).toEqual([]);expect(repeated.leadershipReports.existing).toEqual(opened.leadershipReports.created);
  const leadership=(await json(await request.get('/api/operations/reports?id='+encodeURIComponent(opened.leadershipReports.created[0])))).reports[0];expect(leadership.status).toBe('DRAFT');expect(leadership.configSnapshot.leadershipRequirement.requiredReadyTime).toBeTruthy();expect(leadership.configSnapshot.leadershipRequirement.dueTime).toBe('18:30');
  const frozen=await json(await request.get('/api/operations/evaluations?date='+dates[0]));expect(frozen.rules.penaltyDeduction).toBe(7);expect(frozen.day.evaluations.find(item=>item.id===original.id).finalScore).toBe(13);
  const fresh=await evaluate(dates[1],30,3);expect(fresh.finalScore).toBe(27);
  const secondReport=await report(dates[1]);expect(secondReport.draft.adjustments[0].scoreSnapshot.appliedPoints).toBe(2);
  const preserved=(await json(await request.get('/api/operations/reports?id='+firstReport.id))).reports[0];expect(preserved.draft.adjustments[0].scoreSnapshot.appliedPoints).toBe(1);
  const secondAppraisal=(await json(await request.post('/api/operations/performance',{data:{action:'appraisalCalculate',year:2099,month:11,employeeId:employee.id,reason:'Recalculate after independently approved sources'}}))).appraisal;expect(secondAppraisal.totalScore).toBe(80.5);expect(secondAppraisal.version).toBe(firstAppraisal.version+1);
  const old=await db.opsMonthlyAppraisal.findUnique({where:{id:firstAppraisal.id}});expect(old.status).toBe('APPROVED');expect(old.totalScore).toBe(65);
  expect(await db.auditLog.count({where:{userId:actor.id}})).toBeGreaterThan(8);
 }finally{await request?.dispose();await reviewer?.dispose();await db.$disconnect();}
});

test('settings criteria edits and customer directories save from their actual workspaces',async({page,request})=>{
 await page.addInitScript(()=>localStorage.setItem('bbLanguage','en'));
 await page.goto('/opmanager/settings?category=performance-settings&section=rewards',{waitUntil:'networkidle'});
 await page.getByRole('button',{name:'Add criterion',exact:true}).evaluate(button=>button.scrollIntoView({block:'center'}));
 await page.getByRole('button',{name:'Add criterion',exact:true}).click();
 const criterion=page.locator('article').filter({has:page.getByLabel('Maximum score',{exact:true})}).last();
 await criterion.getByLabel('English label',{exact:true}).fill('Guest care regression');await criterion.getByLabel('Arabic label',{exact:true}).fill('رعاية الضيوف');await criterion.getByLabel('Category',{exact:true}).fill('DAILY_EVALUATION');await criterion.getByLabel('Maximum score',{exact:true}).fill('15');
 await page.getByLabel('Draft reason',{exact:true}).fill('Add verified configurable evaluation criterion');await page.getByRole('button',{name:'Save draft',exact:true}).click();await expect(page.getByRole('status').filter({hasText:'Draft saved.'})).toBeVisible();
 const draft=(await json(await request.get(settingsUrl))).state.draft;expect(draft.value.evaluation.criteria.some(item=>item.label==='Guest care regression'&&item.maxScore===15)).toBe(true);
 for(const [tab,title,field,save,value]of [['trips','Academies and schools','Academy name','Save academy','Isolated academy '+Date.now()],['birthdays','Birthday customers','Customer name','Save customer','Isolated customer '+Date.now()]]){
  await page.goto('/operations?tab='+tab,{waitUntil:'networkidle'});await openDisclosure(page,tab==='trips'?'New academy':'New customer');const directory=page.getByRole('region',{name:title,exact:true});await directory.getByLabel(field,{exact:true}).fill(value);if(tab==='birthdays')await directory.getByLabel('Phone',{exact:true}).fill('01099999888');await directory.getByRole('button',{name:save,exact:true}).click();await expect(directory.getByRole('row').filter({hasText:value})).toBeVisible();
  await directory.getByRole('row').filter({hasText:value}).getByRole('button',{name:'Edit',exact:true}).click();await directory.getByLabel(field,{exact:true}).fill(value+' edited');await directory.getByRole('button',{name:save,exact:true}).click();await expect(directory.getByRole('row').filter({hasText:value+' edited'})).toBeVisible();
 }
 await page.goto('/opmanager/settings?category=master',{waitUntil:'networkidle'});await expect(page.getByLabel('Academy name',{exact:true})).toHaveCount(0);await expect(page.getByLabel('Customer name',{exact:true})).toHaveCount(0);
});
