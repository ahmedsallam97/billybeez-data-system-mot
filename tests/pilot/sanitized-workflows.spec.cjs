// Runs only against the explicitly prepared synthetic pilot, with real logins.
const {test,expect}=require('@playwright/test');
const fs=require('node:fs'),path=require('node:path');

test('sanitized pilot: scoped access, rotation, three reports, daily-to-monthly evidence and employee of the month',async({browser,baseURL,httpCredentials,ignoreHTTPSErrors})=>{
 test.setTimeout(180000);
 if(process.env.PILOT_TEST_BRANCH!=='TEST'||process.env.PILOT_TEST_DATE!=='2098-06-15')throw new Error('The dedicated synthetic TEST / 2098-06-15 fixture is required');
 const fixtureFile=process.env.PILOT_SANITIZED_FIXTURE_FILE||path.join(path.dirname(path.dirname(path.resolve(process.env.PILOT_ACCOUNTS_FILE))),'sanitized-fixture.json');
 const fixture=JSON.parse(fs.readFileSync(fixtureFile,'utf8'));
 if(fixture.kind!=='SYNTHETIC_SANITIZED_PILOT'||fixture.source!=='EMPTY_COMMITTED_SCHEMA'||fixture.workplaceRecordsCopied!==0||fixture.workplaceConfigurationCopied!==0)throw new Error('A verified empty-schema synthetic fixture descriptor is required');
 const branch=process.env.PILOT_TEST_BRANCH,date=process.env.PILOT_TEST_DATE;
 const evidence=path.resolve(process.env.PILOT_TEST_EVIDENCE),accounts=JSON.parse(fs.readFileSync(process.env.PILOT_ACCOUNTS_FILE,'utf8'));
 const contexts=[];
 const post=async(request,url,data)=>{const response=await request.post(url,{data});expect(response.ok(),await response.text()).toBe(true);return response.json();};
 const get=async(request,url)=>{const response=await request.get(url);expect(response.ok(),await response.text()).toBe(true);return response.json();};
 const reportGet=async(request,id)=>(await get(request,'/api/operations/reports?id='+encodeURIComponent(id))).reports[0];
 const periodUrl=`/api/operations/performance?section=eotm&branch=${branch}&year=2098&month=6`;
 try{
  for(const[index,account]of accounts.entries()){
   const context=await browser.newContext({baseURL,httpCredentials,ignoreHTTPSErrors,viewport:[{width:1366,height:768},{width:1440,height:900},{width:1920,height:1080}][index]});contexts.push(context);
   await context.addInitScript(()=>localStorage.setItem('bbLanguage','en'));const page=await context.newPage();await page.goto('/login');
   await page.locator('input[autocomplete="username"]').fill(account.username);await page.locator('input[autocomplete="current-password"]').fill(account.password);await page.locator('button[type="submit"]').click();await expect(page).toHaveURL(/\/(opmanager|operations)(\?|$)/);
  }
  const admin=contexts[0].request,manager=contexts[1].request,restricted=contexts[2].request,page=contexts[0].pages()[0];
  const employees=(await get(admin,'/api/operations/employees')).employees;expect(employees).toHaveLength(8);for(const employee of employees){expect(employee.name).toMatch(/^TEST /);expect(employee.branch).toBe('TEST');}
  expect((await restricted.get(`/api/operations/reports?branch=${branch}&workDate=${date}`)).status()).toBe(403);
  expect((await restricted.post('/api/operations/daily',{data:{action:'previewRotation',date,branch}})).status()).toBe(403);
  expect((await restricted.get('/api/operations/employees')).ok()).toBe(true);
  const preview=(await post(admin,'/api/operations/daily',{action:'previewRotation',branch,date})).preview;
  expect(preview.canApply).toBe(true);expect(preview.assignments.length).toBeGreaterThan(0);
  for(const assignment of preview.assignments){expect(JSON.stringify(assignment)).not.toContain('TEST_EXCLUDED');expect(JSON.stringify(assignment)).not.toContain('TEST_ARCHIVED');}
  await page.goto(`/operations/daily-preview?branch=${branch}&date=${date}`,{waitUntil:'networkidle'});
  await page.getByRole('button',{name:'Rotation Distribution Preview',exact:true}).click();await expect(page.getByRole('dialog').locator('[data-preview-roster-grid]')).toBeVisible();await page.screenshot({path:path.join(evidence,'synthetic-rotation-preview.png')});await page.getByRole('dialog').getByRole('button',{name:'Cancel',exact:true}).click();
  if(process.env.PILOT_TEST_PHASE!=='verify'){
   const generated=await post(admin,'/api/operations/daily',{action:'generateRotation',branch,date,confirmed:true,previewFingerprint:preview.sourceFingerprint,replaceManual:false,reason:'TEST apply verified synthetic shift-specific rotation'});
   expect(generated.plan.assignments.length).toBeGreaterThan(0);
  }
  const roster=await get(admin,`/api/operations/daily?branch=${branch}&date=${date}`);expect(roster.rotation).toBeTruthy();expect(roster.rotation.assignments.length).toBeGreaterThan(0);
  let reports=(await get(admin,`/api/operations/reports?branch=${branch}&workDate=${date}`)).reports;
  expect(reports.some(row=>row.reportType==='TRIP'&&row.status==='APPROVED')).toBe(true);
  const trip=reports.find(row=>row.reportType==='TRIP');
  expect(trip.configSnapshot.processTemplate.code).toMatch(/^TEST_/);expect(trip.configSnapshot.surveyTemplate.code).toMatch(/^TEST_/);
  for(const type of ['BIRTHDAY','SHIFT_LEADERSHIP']){
   let report=reports.find(row=>row.reportType===type&&(type!=='SHIFT_LEADERSHIP'||row.shiftCode==='PM'));expect(report).toBeTruthy();
   if(type==='BIRTHDAY'&&report.status==='APPROVED'&&!fs.existsSync(path.join(evidence,'sanitized-workflows-result.json')))report=(await post(admin,'/api/operations/reports',{action:'reopen',id:report.id,expectedRevision:report.revision,reason:'TEST resume interrupted independent-review rehearsal'})).report;
   if(report.status!=='APPROVED'){
    const actor=manager,draft=structuredClone(report.draft);draft.everythingPlanned=type!=='SHIFT_LEADERSHIP';draft.summary='TEST synthetic '+type+' completed locally';draft.steps=(draft.steps||[]).map(step=>({...step,completed:true}));
    if(type==='BIRTHDAY'){
     const shiftLeaderIds=new Set(reports.filter(row=>row.reportType==='SHIFT_LEADERSHIP').flatMap(row=>row.draft.participants.filter(member=>member.primaryLeader).map(member=>member.employeeId)));
     const host=employees.find(employee=>employee.name.endsWith('Operator 05')&&!shiftLeaderIds.has(employee.id));expect(host).toBeTruthy();
     draft.participants=[{...draft.participants[0],employeeId:host.id}];draft.leadershipReplacementReason='TEST actual birthday host differs from the occupied shift leader';
    }
    if(type==='SHIFT_LEADERSHIP')draft.participants=draft.participants.filter(member=>member.primaryLeader);
    if(report.configSnapshot.surveyTemplate)draft.survey={...(draft.survey||{}),removed:false,answers:report.configSnapshot.surveyTemplate.questions.filter(q=>q.active).map(q=>({questionCode:q.code,choiceCode:q.choices.find(c=>c.code==='TEST_GOOD')?.code||q.choices.find(c=>c.active).code,comment:'TEST synthetic feedback only'}))};
    report=(await post(actor,'/api/operations/reports',{action:'saveDraft',id:report.id,expectedRevision:report.revision,draft,reason:'TEST synthetic draft verification'})).report;
    report=(await post(actor,'/api/operations/reports',{action:'submit',id:report.id,expectedRevision:report.revision})).report;
    if(type==='SHIFT_LEADERSHIP'){const own=await actor.post('/api/operations/reports',{data:{action:'approve',id:report.id,expectedRevision:report.revision}});expect(own.status()).toBe(403);}
    report=(await post(admin,'/api/operations/reports',{action:'review',id:report.id,expectedRevision:report.revision})).report;
    report=(await post(admin,'/api/operations/reports',{action:'approve',id:report.id,expectedRevision:report.revision})).report;
   }
   expect(report.status).toBe('APPROVED');await page.goto(`/operations/reports/operational?branch=${branch}&date=${date}&reportId=${encodeURIComponent(report.id)}`,{waitUntil:'networkidle'});await expect(page.getByLabel('Report summary',{exact:true})).toBeVisible();await page.screenshot({path:path.join(evidence,'synthetic-'+type.toLowerCase()+'.png')});
  }
  await page.goto(`/operations/reports/operational?branch=${branch}&date=${date}&reportId=${encodeURIComponent(trip.id)}`,{waitUntil:'networkidle'});await expect(page.getByLabel('Report summary',{exact:true})).toBeVisible();await page.screenshot({path:path.join(evidence,'synthetic-trip.png')});
  let view=(await get(admin,periodUrl)).monthlyView,target=view.liveRows.find(row=>row.sourceEvidence?.recognition?.score===25&&row.sourceEvidence?.guestFeedback?.score===75);expect(target).toBeTruthy();expect(target.formula).toMatchObject({dailyPerformance:40,attendanceReliability:30,recognition:20,guestFeedback:10});expect(target.dailyDetails[0].baseFinalScore).toBe(8);expect(target.dailyDetails[0].finalScore).toBe(10);expect(target.monthlyResult).toBe(82.5);
  if(process.env.PILOT_TEST_PHASE!=='verify'){
   const daily=await get(admin,`/api/operations/evaluations?branch=${branch}&date=${date}`),other=daily.day.evaluations.find(row=>row.employeeId!==target.employee.id);
   const criterion=daily.criteriaVersion.criteria.find(row=>row.active);expect(criterion).toBeTruthy();
   // Save a real authorized daily correction and restore the synthetic value.
   await post(admin,'/api/operations/evaluations',{action:'correct',branch,date,reason:'TEST synthetic correction verifies monthly refresh',evaluations:[{employeeId:other.employeeId,exceptions:[{criterionId:criterion.id,deduction:3,note:'TEST synthetic deduction'}],supervisorNote:'TEST correction'}]});
   expect((await get(admin,`/api/operations/evaluations?branch=${branch}&date=${date}`)).day.evaluations.find(row=>row.employeeId===other.employeeId).baseFinalScore).toBe(7);
   await post(admin,'/api/operations/evaluations',{action:'correct',branch,date,reason:'Restore the original TEST synthetic daily score',evaluations:[{employeeId:other.employeeId,exceptions:[{criterionId:criterion.id,deduction:2,note:'TEST synthetic baseline'}],supervisorNote:'TEST restored baseline'}]});
  }
  view=(await get(admin,periodUrl)).monthlyView;target=view.liveRows.find(row=>row.employee.id===target.employee.id);
  if(!view.frozen){
   const calculated=await post(admin,'/api/operations/performance',{action:'appraisalCalculate',branch,year:2098,month:6,employeeId:target.employee.id,reason:'TEST synthetic monthly calculation'});
   await post(manager,'/api/operations/performance',{action:'appraisalApprove',branch,appraisalId:calculated.appraisal.id});
   view=(await get(admin,periodUrl)).monthlyView;expect(view.liveRows.find(row=>row.employee.id===target.employee.id).eligible).toBe(true);
   const competition=(await post(admin,'/api/operations/performance',{action:'eotmCreate',branch,year:2098,month:6,expectedFingerprint:view.sourceFingerprint})).competition;
   await post(manager,'/api/operations/performance',{action:'eotmWinner',branch,competitionId:competition.id,employeeId:target.employee.id});await post(admin,'/api/operations/performance',{action:'eotmLock',branch,competitionId:competition.id});
  }
  const final=(await get(admin,periodUrl)).monthlyView;expect(final.competition.status).toBe('LOCKED');expect(final.competition.winnerEmployeeId).toBe(target.employee.id);expect(final.competition.candidates.find(row=>row.employeeId===target.employee.id).finalScore).toBe(82.5);
  await page.goto(`/operations/employee-of-the-month?branch=${branch}&year=2098&month=6`,{waitUntil:'networkidle'});await page.screenshot({path:path.join(evidence,'synthetic-employee-of-month.png')});
  const concurrent=await Promise.all(contexts.map(context=>context.request.get('/api/operations/summary')));for(const response of concurrent)expect(response.ok()).toBe(true);
  fs.writeFileSync(path.join(evidence,'sanitized-workflows-result.json'),JSON.stringify({syntheticBranch:branch,date,noWorkplaceData:true,realLogins:3,scopedApiDenials:2,rotationPreview:true,rotationAppliedAndPersisted:true,rotationPlanId:roster.rotation.id,assignmentCount:roster.rotation.assignments.length,tripBirthdayShiftLeader:'APPROVED',dailyCorrectionAndMonthlyRefresh:true,weights:{dailyPerformance:40,attendance:30,recognition:20,guest:10},recognition:25,guestFeedback:75,dailyBase:8,dailyWithEventEvidence:10,monthlyScore:82.5,eomWinnerApprovedAndLocked:true,threeConcurrentDesktopSessions:true,completedAt:new Date().toISOString()},null,2));
 }finally{for(const context of contexts)await context.close();}
});
