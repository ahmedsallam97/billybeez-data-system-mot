const {test,expect}=require('@playwright/test'),fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto');
const fixtures=require('./phases-fixtures.cjs');let data;
const evidence=path.resolve(process.env.PHASE_EVIDENCE_DIR||process.env.OPS_E2E_RUN_DIR||'tmp/phases-completion','workflows');
test.beforeAll(async()=>{fs.mkdirSync(evidence,{recursive:true});data=await fixtures.prepare();});
const prefs=async(page,lang='en',theme='classic',width=1440,height=900)=>{await page.setViewportSize({width,height});await page.addInitScript(({lang,theme})=>{localStorage.setItem('bbLanguage',lang);localStorage.setItem('bbTheme',theme);},{lang,theme});};
const get=async(page,id)=>{const r=await page.request.get('/api/operations/reports?id='+encodeURIComponent(id));expect(r.ok(),await r.text()).toBe(true);return (await r.json()).reports[0];};
const reportUrl=(id,date)=>`/operations/reports/operational?branch=${data.branch}&date=${date}&reportId=${encodeURIComponent(id)}`;
test('genuine October remains pending with its actual daily records, configured weights and exact source actions',async({page})=>{
 await prefs(page);await page.goto('/operations/employee-of-the-month?year=2026&month=10&branch=MOT',{waitUntil:'networkidle'});
 const payload=await page.request.get('/api/operations/performance?section=eotm&year=2026&month=10&branch=MOT').then(r=>r.json());
 expect(payload.monthlyView.stats.evaluatedEmployees).toBe(13);expect(payload.monthlyView.stats.completedEmployeeDays).toBe(23);
 const evaluated=payload.monthlyView.liveRows.find(row=>row.completedDays>0);expect(evaluated.formula).toMatchObject({dailyPerformance:70,attendanceReliability:20,recognition:5,guestFeedback:5});expect(evaluated.finalResult).toBeNull();
 await page.getByRole('button',{name:'Breakdown',exact:true}).first().click();const dialog=page.getByRole('dialog');await expect(dialog.getByRole('heading',{name:'Recognition and guest feedback evidence',exact:true})).toBeVisible();await expect(dialog).toContainText('Publish included rewards');await page.screenshot({path:path.join(evidence,'genuine-october-en-1440.png')});
 fs.writeFileSync(path.join(evidence,'genuine-october.json'),JSON.stringify({evaluatedEmployees:13,reviewedEmployeeDays:23,weights:evaluated.formula,missingComponents:evaluated.missingComponents,recognition:evaluated.sourceEvidence.recognition.reason,guestFeedback:evaluated.sourceEvidence.guestFeedback.reason,finalResult:null},null,2));
});
for(const language of ['en','ar'])test(`manager event workflow uses booking roster attendance, autosave recovery, approval, evidence and reversal ${language}`,async({page,browser})=>{
 const ar=language==='ar',v=data.variants[language],t=(en,arabic)=>ar?arabic:en;await prefs(page,language);
 await page.goto(`/operations/reports/operational?branch=${data.branch}&date=${v.date}`,{waitUntil:'networkidle'});
 await expect(page.getByLabel(t('Booking / source','المصدر'),{exact:true})).toContainText(`TEST ${language} booked school`);
 await page.getByLabel(t('Process template','قالب العملية'),{exact:true}).selectOption('PHASE_TRIP_PROCESS');await page.getByLabel(t('Survey template','قالب الاستبيان'),{exact:true}).selectOption('PHASE_TRIP_SURVEY');
 const created=page.waitForResponse(response=>response.url().endsWith('/api/operations/reports')&&response.request().method()==='POST'&&response.request().postDataJSON()?.action==='create');await page.getByRole('button',{name:t('Create draft','إنشاء مسودة'),exact:true}).click();const createdResponse=await created;expect(createdResponse.ok(),await createdResponse.text()).toBe(true);await expect(page.getByLabel(t('Report summary','ملخص التقرير'),{exact:true})).toBeVisible();
 const id='TRIP:'+v.tripId;let report=await get(page,id);expect(report.draft.participants.map(row=>row.employeeId).sort()).toEqual(v.employees.filter(row=>row.shift==='AM').map(row=>row.id).sort());expect(report.draft.participants.find(row=>row.primaryLeader)?.employeeId).toBe(v.employees[0].id);
 expect(report.source.id).toBe(v.tripId);expect(report.source.snapshot.roster.schedule.id).toBeTruthy();
 let failed=false;await page.route('**/api/operations/reports',async route=>{const body=route.request().postDataJSON();if(route.request().method()==='POST'&&body?.action==='saveDraft'&&!failed){failed=true;await route.fulfill({status:503,json:{error:'Temporary report connection failure'}});}else await route.continue();});
 const summary=`Verified ${language} trip with actual source participants`;await page.getByLabel(t('Report summary','ملخص التقرير'),{exact:true}).fill(summary);await expect(page.getByRole('alert').first()).toBeVisible();await expect(page.getByLabel(t('Report summary','ملخص التقرير'),{exact:true})).toHaveValue(summary);
 await page.getByRole('button',{name:t('Save draft','حفظ المسودة'),exact:true}).click();await expect.poll(async()=>(await get(page,id)).draft.summary).toBe(summary);await page.unroute('**/api/operations/reports');
 await page.getByRole('button',{name:t('All completed','كل الخطوات مكتملة'),exact:true}).click();await expect.poll(async()=>(await get(page,id)).draft.steps.every(step=>step.completed)).toBe(true);
 await page.getByLabel(t(`Performance level: ${v.employees[0].name}`,`مستوى الأداء: ${v.employees[0].name}`),{exact:true}).selectOption('PLUS_3');
 await page.getByLabel(t('Adjustment comment','تعليق النقاط'),{exact:true}).fill('Verified event performance evidence');await page.getByLabel(t('Verified test service rating','تقييم خدمة تجريبي موثق'),{exact:true}).selectOption('GOOD');
 await expect.poll(async()=>{const r=await get(page,id);return r.draft.adjustments[0]?.comment&&r.draft.survey?.answers[0]?.choiceCode;}).toBe('GOOD');
 const image=fs.readFileSync('public/billy-favicon.png');const upload=await page.request.post('/api/operations/reports/files',{multipart:{reportId:id,file:{name:'test-evidence.png',mimeType:'image/png',buffer:image}}});expect(upload.ok(),await upload.text()).toBe(true);const file=(await upload.json()).file;
 const downloaded=await page.request.get(file.reference);expect(downloaded.ok()).toBe(true);expect(createHash('sha256').update(await downloaded.body()).digest('hex')).toBe(createHash('sha256').update(image).digest('hex'));
 report=await get(page,id);const linked=await page.request.post('/api/operations/reports',{data:{action:'saveDraft',id,expectedRevision:report.revision,draft:{...report.draft,attachments:[file]},reason:'Link the verified test report file'}});expect(linked.ok(),await linked.text()).toBe(true);
 await page.reload({waitUntil:'networkidle'});await expect(page.getByLabel(t('Report summary','ملخص التقرير'),{exact:true})).toHaveValue(summary);await expect(page).toHaveURL(new RegExp('reportId='));
 await page.getByRole('button',{name:t('Submit for review','إرسال للمراجعة'),exact:true}).click();await expect.poll(async()=>(await get(page,id)).status).toBe('SUBMITTED');
 const context=await browser.newContext({baseURL:'http://127.0.0.1:3018',storageState:fixtures.reviewerStorage(data)});try{
  const reviewPage=await context.newPage();await prefs(reviewPage,language);await reviewPage.goto(reportUrl(id,v.date),{waitUntil:'networkidle'});
  await reviewPage.getByRole('button',{name:t('Mark reviewed','تمت المراجعة'),exact:true}).click();await expect.poll(async()=>(await get(reviewPage,id)).status).toBe('REVIEWED');
  await reviewPage.getByRole('button',{name:t('Approve','اعتماد'),exact:true}).click();await expect.poll(async()=>(await get(reviewPage,id)).status).toBe('APPROVED');
  await reviewPage.reload({waitUntil:'networkidle'});await reviewPage.evaluate(()=>window.scrollTo(0,0));await reviewPage.screenshot({path:path.join(evidence,`approved-trip-${language}-1440.png`)});
  const metrics=await reviewPage.request.get(`/api/operations/performance?section=eotm&branch=${data.branch}&year=2097&month=6`).then(r=>r.json());const worker=metrics.monthlyView.liveRows.find(row=>row.employee.id===v.employees[0].id);
  expect(worker.sourceEvidence.recognition.score).toBe(30);expect(worker.sourceEvidence.guestFeedback.score).toBe(75);expect(worker.sourceEvidence.guestFeedback.responseCount).toBe(1);expect(worker.dailyDetails[0].baseFinalScore).toBe(40);expect(worker.dailyDetails[0].finalScore).toBe(43);expect(worker.components.eventAdjustment).toBe(0);
  const profile=await reviewPage.request.get(`/api/operations/employees/${v.employees[0].id}/360`).then(r=>r.json());expect(profile.employee.operationalEvidence.some(row=>row.id===id)).toBe(true);
  // Keep the approved record as populated visual evidence; independent node tests cover cancellation and reversal.
 }finally{await context.close();}
 await page.goto(`/operations/reports/operational?branch=${data.branch}&date=${v.date}`,{waitUntil:'networkidle'});await page.getByLabel(t('Report type','نوع التقرير'),{exact:true}).selectOption('BIRTHDAY');await page.getByLabel(t('Process template','قالب العملية'),{exact:true}).selectOption('PHASE_BIRTHDAY_PROCESS');await page.getByLabel(t('Survey template','قالب الاستبيان'),{exact:true}).selectOption('PHASE_BIRTHDAY_SURVEY');await page.getByRole('button',{name:t('Create draft','إنشاء مسودة'),exact:true}).click();
 const birthdayId='BIRTHDAY:'+v.birthdayId;await expect(page.getByLabel(t('Report summary','ملخص التقرير'),{exact:true})).toBeVisible();const birthday=await get(page,birthdayId);expect(birthday.draft.participants.map(row=>row.employeeId)).toEqual([v.employees[2].id]);
 const team=page.locator('details').filter({has:page.locator('summary').filter({hasText:t('Actual team and performance','الفريق الفعلي والأداء')})}).first();
 await team.getByLabel(v.employees[3].name,{exact:true}).check();await expect.poll(async()=>(await get(page,birthdayId)).draft.participants.length).toBe(2);await team.getByLabel(v.employees[4].name,{exact:true}).click();await expect(page.getByRole('alert').first()).toBeVisible();await expect(team.getByLabel(v.employees[4].name,{exact:true})).not.toBeChecked();
 await page.screenshot({path:path.join(evidence,`birthday-team-limit-${language}-1440.png`)});
 const shift=await get(page,v.shiftReportId);expect(shift.reportType).toBe('SHIFT_LEADERSHIP');expect(shift.source.type).toBe('OPS_PUBLISHED_SCHEDULE_SHIFT');expect(shift.draft.participants.find(row=>row.primaryLeader).employeeId).toBe(v.employees[0].id);
 await page.goto(reportUrl(v.shiftReportId,v.date),{waitUntil:'networkidle'});await expect(page.getByLabel(t('Report summary','ملخص التقرير'),{exact:true})).toBeVisible();await page.screenshot({path:path.join(evidence,`shift-leader-${language}-1440.png`)});
});
test('historical sources retain failed inputs, need independent approval, are idempotent and cannot replace automatic evidence',async({page,browser})=>{
 const v=data.variants.en,employee=v.employees[1];await prefs(page);await page.goto(`/operations/employee-of-the-month?branch=${data.branch}&year=2097&month=6`,{waitUntil:'networkidle'});
 const row=page.locator('tbody tr').filter({hasText:employee.name}).first();await row.getByRole('button',{name:'Breakdown',exact:true}).click();const dialog=page.getByRole('dialog');await dialog.getByText('Documented historical entry / import',{exact:true}).click();
 await dialog.getByLabel('Value (0–100)',{exact:true}).fill('80');await dialog.getByLabel('Original source',{exact:true}).fill('Verified signed test paper log');await dialog.getByLabel('Evidence reference',{exact:true}).fill('TEST archive reference H-01');await dialog.getByLabel('Evidence and historical reason',{exact:true}).fill('Verified legitimate historical evidence fixture');
 let fail=true;await page.route('**/api/operations/performance',async route=>{if(route.request().method()==='POST'&&route.request().postDataJSON()?.action==='appraisalSourcePropose'&&fail){fail=false;await route.fulfill({status:503,json:{error:'Temporary historical source connection failure'}});}else await route.continue();});
 await dialog.getByRole('button',{name:'Submit historical evidence',exact:true}).click();await expect(dialog.getByRole('alert')).toBeVisible();await expect(dialog.getByLabel('Value (0–100)',{exact:true})).toHaveValue('80');await dialog.getByRole('button',{name:'Submit historical evidence',exact:true}).click();await page.unroute('**/api/operations/performance');
 let payload=await page.request.get(`/api/operations/performance?section=eotm&branch=${data.branch}&year=2097&month=6`).then(r=>r.json());const entry=payload.monthlyView.componentEntries.find(row=>row.employeeId===employee.id);expect(entry.status).toBe('PROPOSED');
 const own=await page.request.post('/api/operations/performance',{data:{action:'appraisalSourceApprove',branch:data.branch,year:2097,month:6,entryId:entry.id,reason:'Attempt creator approval test'}});expect(own.status()).toBe(403);
 const context=await browser.newContext({baseURL:'http://127.0.0.1:3018',storageState:fixtures.reviewerStorage(data)});try{
  const approved=await context.request.post('/api/operations/performance',{data:{action:'appraisalSourceApprove',branch:data.branch,year:2097,month:6,entryId:entry.id,reason:'Independent verification of historical paper evidence'}});expect(approved.ok(),await approved.text()).toBe(true);
  const reviewPage=await context.newPage();await prefs(reviewPage);await reviewPage.goto(`/operations/employee-of-the-month?branch=${data.branch}&year=2097&month=6`,{waitUntil:'networkidle'});await reviewPage.locator('tbody tr').filter({hasText:employee.name}).first().getByRole('button',{name:'Breakdown',exact:true}).click();await expect(reviewPage.getByRole('dialog')).toContainText('Approved historical entry');await reviewPage.screenshot({path:path.join(evidence,'historical-source-approved-en-1440.png')});
  const automatic=v.employees[0];const proposal=await page.request.post('/api/operations/performance',{data:{action:'appraisalSourcePropose',branch:data.branch,year:2097,month:6,rows:[{employeeId:automatic.id,component:'guestFeedback',value:100,source:'TEST paper alternative',reason:'Test that digital approved sources take precedence'}]}}).then(r=>r.json());
  const rejected=await context.request.post('/api/operations/performance',{data:{action:'appraisalSourceApprove',branch:data.branch,year:2097,month:6,entryId:proposal.entries[0].id,reason:'Attempt to replace genuine automatic source'}});expect(rejected.status()).toBe(409);
 }finally{await context.close();}
});
for(const language of ['en','ar'])for(const theme of ['classic','blue','orange','red'])for(const [width,height]of [[1366,768],[1440,900],[1920,1080]])test(`connected report and source desktop ${language} ${theme} ${width}`,async({page})=>{
 const v=data.variants[language],ar=language==='ar';await prefs(page,language,theme,width,height);await page.goto(reportUrl('TRIP:'+v.tripId,v.date),{waitUntil:'networkidle'});await expect(page.getByLabel(ar?'ملخص التقرير':'Report summary',{exact:true})).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2)).toBe(true);await expect(page.locator('html')).toHaveAttribute('dir',ar?'rtl':'ltr');await expect(page.locator('html')).toHaveAttribute('data-theme',theme);await page.screenshot({path:path.join(evidence,`report-${language}-${theme}-${width}.png`)});
 await page.goto(`/operations/employee-of-the-month?branch=${data.branch}&year=2097&month=6`,{waitUntil:'networkidle'});await page.locator('tbody tr').filter({hasText:v.employees[0].name}).first().getByRole('button',{name:ar?'التفاصيل':'Breakdown',exact:true}).click();const dialog=page.getByRole('dialog');await expect(dialog.getByRole('heading',{name:ar?'أدلة التكريم وتقييم الضيوف':'Recognition and guest feedback evidence',exact:true})).toBeVisible();expect(await dialog.evaluate(node=>node.scrollWidth<=node.clientWidth+2)).toBe(true);await dialog.getByRole('heading',{name:ar?'أدلة التكريم وتقييم الضيوف':'Recognition and guest feedback evidence',exact:true}).scrollIntoViewIfNeeded();await page.screenshot({path:path.join(evidence,`sources-${language}-${theme}-${width}.png`)});
 await page.goto('/opmanager/settings/performance-settings/appraisal',{waitUntil:'networkidle'});await expect(page.locator('[data-settings-top-nav]')).toBeVisible();await expect(page.getByRole('heading',{name:ar?'مصادر التكريم وتقييم الضيوف':'Recognition and guest feedback sources',exact:true})).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2)).toBe(true);await page.screenshot({path:path.join(evidence,`source-settings-${language}-${theme}-${width}.png`)});await page.getByRole('heading',{name:ar?'مصادر التكريم وتقييم الضيوف':'Recognition and guest feedback sources',exact:true}).scrollIntoViewIfNeeded();await page.screenshot({path:path.join(evidence,`source-settings-fields-${language}-${theme}-${width}.png`)});
});
test('direct HTTP report permissions hide event evidence while evaluation and monthly numeric results remain readable',async({browser})=>{
 const {assertIsolatedEnvironment}=require('../e2e/isolation');assertIsolatedEnvironment();
 const {PrismaClient}=require('@prisma/client'),{randomBytes}=require('node:crypto');
 const accounts=require('../../lib/accounts/service'),{registerAccountFixture}=require('../e2e/account-fixtures');
 const db=new PrismaClient();let restricted;
 try{
  const user=await db.user.create({data:{username:'phase-evidence-reader-'+randomBytes(6).toString('hex'),name:'Restricted phase evidence test reader',password:'unusable-test-password',role:'ADMIN',active:true}});
  await registerAccountFixture(db,user);
  const {config}=await accounts.readConfig(db),profile=config.accounts[user.id];
  // Reuse the existing role; only this disposable account receives overrides.
  const role=config.roles.find(item=>item.id===profile.roleId);
  for(const permission of Object.keys(role.permissions||{}))if(permission.startsWith('reports.')||permission.startsWith('trips.'))profile.overrides[permission]=null;
  Object.assign(profile.overrides,{'reports.view':null,'trips.view':null,'appraisals.view':'ALL','evaluations.view':'ALL','eom.view':'ALL','employees.details':'ALL'});
  config.revision++;await db.systemSetting.update({where:{key:accounts.KEY},data:{value:JSON.stringify(config)}});
  restricted=await accounts.loadAccount(db,user);
  expect(restricted.permissions['reports.view']).toBeUndefined();expect(restricted.permissions['trips.view']).toBeUndefined();
  expect(restricted.permissions['appraisals.view']).toBeTruthy();expect(restricted.permissions['evaluations.view']).toBeTruthy();
 }finally{await db.$disconnect();}
 const v=data.variants.en,employee=v.employees[0],reportId='TRIP:'+v.tripId;
 const context=await browser.newContext({baseURL:'http://127.0.0.1:3018',storageState:fixtures.reviewerStorage({reviewer:restricted.id,reviewerVersion:restricted.profile.sessionVersion||0})});
 try{
  const denied=await context.request.get('/api/operations/reports?id='+encodeURIComponent(reportId));expect(denied.status()).toBe(403);expect((await denied.json()).success).toBe(false);
  const evaluated=await context.request.get(`/api/operations/evaluations?branch=${data.branch}&date=${v.date}`);expect(evaluated.ok(),await evaluated.text()).toBe(true);
  const daily=(await evaluated.json()).day.evaluations.find(row=>row.employeeId===employee.id);expect(daily.baseFinalScore).toBe(40);expect(daily.finalScore).toBe(43);expect(daily.eventImpact.points).toBe(3);expect(daily.eventImpact.sourceAdjustments).toEqual([]);expect(JSON.stringify(daily)).not.toContain(reportId);
  const monthlyResponse=await context.request.get(`/api/operations/performance?section=eotm&branch=${data.branch}&year=2097&month=6`);expect(monthlyResponse.ok(),await monthlyResponse.text()).toBe(true);
  const monthly=(await monthlyResponse.json()).monthlyView.liveRows.find(row=>row.employee.id===employee.id);
  expect(monthly.sourceEvidence.recognition.score).toBe(30);expect(monthly.sourceEvidence.guestFeedback.score).toBe(75);expect(monthly.sourceEvidence.guestFeedback.responseCount).toBe(1);
  for(const component of ['recognition','guestFeedback']){expect(monthly.sourceEvidence[component].sources).toEqual([]);expect(monthly.sourceEvidence[component].sourceRecordCount).toBe(1);expect(monthly.sourceEvidence[component].restrictedSourceCount).toBe(1);}
  expect(monthly.dailyDetails[0].finalScore).toBe(43);expect(monthly.dailyDetails[0].eventImpact.sourceAdjustments).toEqual([]);expect(monthly.eventAdjustments).toEqual([]);expect(JSON.stringify(monthly)).not.toContain(reportId);expect(JSON.stringify(monthly)).not.toContain(v.tripId);
  const employeeResponse=await context.request.get(`/api/operations/employees/${employee.id}/360`);expect(employeeResponse.ok(),await employeeResponse.text()).toBe(true);
  const profile=(await employeeResponse.json()).employee;expect(profile.operationalEvidence).toEqual([]);expect(profile.sectionPermissions['reports.view']).toBe(false);
  const profileDaily=profile.dailyEvaluations.find(row=>row.employeeId===employee.id);expect(profileDaily.finalScore).toBe(43);expect(profileDaily.eventImpact.sourceAdjustments||[]).toEqual([]);expect(JSON.stringify(profile)).not.toContain(reportId);
  expect(profile.monthlyAppraisals.length).toBeGreaterThan(0);for(const appraisal of profile.monthlyAppraisals){expect(appraisal.sourceSnapshotJson).not.toContain(reportId);expect(appraisal.sourceSnapshotJson).not.toContain(v.tripId);}
  fs.writeFileSync(path.join(evidence,'report-evidence-permissions.json'),JSON.stringify({reportsGet:403,evaluationsGet:200,monthlyGet:200,employee360Get:200,baseDailyScore:40,derivedDailyScore:43,recognition:30,guestFeedback:75,responseCount:1,deniedReportDetailsHidden:true,storedMonthlySnapshotsRedacted:true},null,2));
 }finally{await context.close();}
});
