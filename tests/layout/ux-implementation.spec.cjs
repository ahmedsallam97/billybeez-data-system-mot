require('../e2e/account-fixtures').installLanguageFixture();
const { test, expect } = require('@playwright/test');
const { PrismaClient } = require('@prisma/client');
const { database } = require('../e2e/stabilization-helpers');
const path = require('node:path'), fs = require('node:fs');
const evidence = path.resolve(process.env.UX_EVIDENCE_DIR || 'docs/ux-implementation-2026-10-12');
let realistic;
test.beforeAll(async()=>{
 const db=new PrismaClient();try{
  const raw=await db.user.findFirst({where:{role:'ADMIN',active:true}}),user=await require('../../lib/accounts/service').loadAccount(db,raw);
  const employee=await db.employee.upsert({where:{name:'Sara Hassan — سارة حسن'},create:{name:'Sara Hassan — سارة حسن',branch:'MOT',department:'OPERATION',jobTitle:'Ride Operator'},update:{}});
  let proof=await db.employeeDocument.findFirst({where:{employeeId:employee.id,displayName:'Signed observation checklist'}});if(!proof){const storageKey=employee.id+'/ux-observation.pdf';const pdf=await require('pdf-lib').PDFDocument.create();pdf.addPage().drawText('Signed practical observation checklist: supervised opening and guest service review.');const bytes=Buffer.from(await pdf.save());await require('../../lib/employee-file-storage').writeEmployeeFile(storageKey,bytes,'application/pdf');proof=await db.employeeDocument.create({data:{employeeId:employee.id,documentType:'OTHER',displayName:'Signed observation checklist',storageKey,mimeType:'application/pdf',sizeBytes:bytes.length}});}
  const service=require('../../lib/operations/planning-service'),{proposedFramework,keyOf}=require('../../lib/operations/succession-workspace');
  const previous=await service.loadPlanning(db,{user,branch:'MOT',mode:'succession'}),prior=previous.succession.find(row=>row.employeeId===employee.id),priorDevelopment=prior&&previous.developments.find(row=>row.candidateId===prior.id);
  if(prior&&priorDevelopment){realistic={proofId:proof.id,employeeId:employee.id,candidateId:prior.id,developmentId:priorDevelopment.id,taskId:priorDevelopment.objectives[0].assignments[0].id};return;}
  const config=(await require('../../lib/operations/performance-settings-service').getEffectivePerformanceSettings(db,{branch:'MOT'})).value.succession;
  const framework=proposedFramework(config,{currentRole:'Ride Operator',targetRole:'Front Cashier'}).slice(0,2);
  const {candidate}=await service.createSuccession(db,{user,branch:'MOT',employeeId:employee.id,targetRole:'Front Cashier',framework,details:{ownerUserId:user.id,nextReviewDate:'2026-10-01',targetDate:'2027-03-01',reviewFrequency:'MONTHLY',businessNeed:'Prepare supervised cashier cover using documented practical reviews.'}});
  const {development}=await service.createDevelopment(db,{user,branch:'MOT',candidateId:candidate.id,ownerUserId:user.id,objectives:framework.map((definition,i)=>({gapKey:keyOf(definition),outcome:i?'Handle guest requests during observed shifts':'Complete opening checks and demonstrate incident response',successCriteria:'Supervisor observes two shifts and records a practical review.',targetDate:'2026-10-08',assignments:[{task:i?'Shadow an experienced cashier':'Run a supervised opening and incident response drill',responsibleUserId:user.id,dueDate:'2026-10-07'}]}))});
  await service.updateAssignment(db,{user,branch:'MOT',developmentId:development.id,assignmentId:development.objectives[0].assignments[0].id,expectedRevision:1,status:'BLOCKED',blocker:'Drill equipment is unavailable; arrange a supervised alternative.',reason:'Record support needed for the practical review.'});
  await db.opsDailyTrip.create({data:{name:'November school visit',branch:'MOT',workDate:'2026-11-05',startTime:'09:00',endTime:'13:00',expectedChildren:80,staffingRequired:3,status:'PLANNED'}});
  await db.opsDailyEvent.create({data:{name:'Mariam birthday',childName:'Mariam',branch:'MOT',eventType:'BIRTHDAY',workDate:'2026-11-07',startTime:'17:00',endTime:'19:00',expectedGuests:12,staffingRequired:2,status:'PLANNED'}});
  await db.opsDailyOffer.createMany({data:[{title:'Current Sunday offer',branch:'MOT',priceBefore:300,priceAfter:210,childrenCount:2,effectiveFrom:'2026-10-01',effectiveTo:'2026-10-31',weekdaysJson:'[0]',active:true},{title:'Archived summer offer',branch:'MOT',priceBefore:300,priceAfter:240,childrenCount:1,effectiveFrom:'2026-08-01',effectiveTo:'2026-08-31',active:false}]});
  realistic={employeeId:employee.id,candidateId:candidate.id,developmentId:development.id,taskId:development.objectives[0].assignments[0].id};
 }finally{await db.$disconnect();}
});
test('FD01 requires a readable stored contract and retries without duplicate conversion or upload', async ({ page }) => {
  const db = new PrismaClient();
  const employee = await db.employee.create({data:{name:'Contract safety fixture',employmentType:'PART_TIME',localEmployeeCode:'PT-UX-SAFE',branch:'MOT',jobTitle:'Ride Operator'}});
  const payload={action:'convertToHris',hrisNumber:'91837',jobTitle:'Ride Operator',effectiveDate:'2026-10-12',reason:'Contract safety regression'};
  try {
    let response=await page.request.post(`/api/operations/employees/${employee.id}/360`,{data:payload});
    expect(response.status()).toBe(400); expect((await db.employee.findUnique({where:{id:employee.id}})).localEmployeeCode).toBe('PT-UX-SAFE');
    const token=require('node:crypto').randomUUID(), bytes=Buffer.from('%PDF-1.4\nContract safety fixture\n%%EOF');
    const upload=()=>page.request.post(`/api/operations/employees/${employee.id}/documents`,{multipart:{employeeId:employee.id,documentType:'CONTRACT',uploadToken:token,file:{name:'contract.pdf',mimeType:'application/pdf',buffer:bytes}}});
    const stored=await upload();expect(stored.ok()).toBeTruthy(); const document=(await stored.json()).document;
    expect((await (await upload()).json()).document.id).toBe(document.id);
    response=await page.request.post(`/api/operations/employees/${employee.id}/360`,{data:{...payload,contractDocumentId:document.id}});expect(response.ok(),await response.text()).toBeTruthy();
    response=await page.request.post(`/api/operations/employees/${employee.id}/360`,{data:{...payload,contractDocumentId:document.id}});expect(response.ok(),await response.text()).toBeTruthy();expect((await response.json()).replayed).toBe(true);
    expect(await db.employeeEmploymentEvent.count({where:{employeeId:employee.id,eventType:'CONVERTED_TO_HRIS'}})).toBe(1);
    expect(await db.employeeDocument.count({where:{employeeId:employee.id}})).toBe(1);
    const broken=await db.employee.create({data:{name:'Unreadable contract fixture',employmentType:'PART_TIME',localEmployeeCode:'PT-UX-MISSING',branch:'MOT',jobTitle:'Ride Operator'}});
    const missing=await db.employeeDocument.create({data:{employeeId:broken.id,documentType:'CONTRACT',displayName:'Missing contract',storageKey:broken.id+'/missing.pdf',mimeType:'application/pdf',sizeBytes:32}});
    response=await page.request.post(`/api/operations/employees/${broken.id}/360`,{data:{...payload,hrisNumber:'91838',contractDocumentId:missing.id}});expect(response.status()).toBe(400);
    expect((await db.employee.findUnique({where:{id:broken.id}})).localEmployeeCode).toBe('PT-UX-MISSING');
  } finally { await db.$disconnect(); }
});
test('FD02 tab collections contain only permitted sections', async () => {
  const {permittedEmployeeTabs}=require('../../lib/operations/employee-tabs');
  const tabs=['Overview','Personal','Guest Feedback','Incidents','Files','Training & Qualifications'];
  expect(permittedEmployeeTabs(tabs,{'competencies.view':true})).toEqual(['Overview','Training & Qualifications']);
  expect(permittedEmployeeTabs(tabs,{'employees.sensitive':true,'files.view':true,'competencies.view':true})).toEqual(tabs);
});

test('FD01 an existing saved contract supports recovery without uploading a duplicate',async({page})=>{
 await page.addInitScript(()=>localStorage.setItem('bbLanguage','en'));const db=new PrismaClient();const employee=await db.employee.create({data:{name:'Saved contract recovery fixture',employmentType:'PART_TIME',localEmployeeCode:'PT-RECOVERY',branch:'MOT',jobTitle:'Ride Operator'}});
 try{const stored=await page.request.post(`/api/operations/employees/${employee.id}/documents`,{multipart:{employeeId:employee.id,documentType:'CONTRACT',file:{name:'saved-contract.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.4\nStored contract\n%%EOF')}}});expect(stored.ok()).toBeTruthy();const document=(await stored.json()).document;await page.goto('/operations/employees?employeeId='+employee.id,{waitUntil:'networkidle'});await expect(page.locator('.employee360-identity')).toContainText(employee.name);await page.getByRole('button',{name:'Convert PT to HRIS',exact:true}).click();const dialog=page.getByRole('dialog');await dialog.getByLabel('Use saved signed contract',{exact:true}).selectOption(document.id);await dialog.getByLabel('HRIS number',{exact:true}).fill('91839');await dialog.getByRole('button',{name:'Convert to HRIS',exact:true}).click();await expect(dialog).toHaveCount(0);await expect(page.locator('.employee360-identity')).toContainText('91839');expect(await db.employeeDocument.count({where:{employeeId:employee.id}})).toBe(1);expect((await db.employee.findUnique({where:{id:employee.id}})).localEmployeeCode).toBeNull();}finally{await db.$disconnect();}
});
test('FD03 saved dashboard title survives immediate navigation, refresh and a new context',async({page,browser})=>{
  await page.addInitScript(()=>localStorage.setItem('bbLanguage','en'));
  const key='OPS_DASHBOARD_UI_CONFIG'; const old=database(db=>db.prepare('SELECT value FROM SystemSetting WHERE key=?').get(key)?.value);
  const {parseDashboardSettings}=require('../../lib/operations/dashboard-settings'); const value=parseDashboardSettings(old); value.dashboard.titleEn='Immediate saved operations title';
  try {
    await page.goto('/opmanager',{waitUntil:'networkidle'});
    const result=await page.request.patch('/api/operations/settings',{data:{key,value:JSON.stringify(value)}});expect(result.ok(),await result.text()).toBeTruthy();
    await page.reload({waitUntil:'networkidle'});await expect(page.locator('[data-page-header] h1')).toHaveText(value.dashboard.titleEn);
    const context=await browser.newContext({storageState:await page.context().storageState()});const fresh=await context.newPage();await fresh.goto('http://127.0.0.1:3018/opmanager',{waitUntil:'networkidle'});await expect(fresh.locator('[data-page-header] h1')).toHaveText(value.dashboard.titleEn);await context.close();
  } finally { if(old)await page.request.patch('/api/operations/settings',{data:{key,value:old}}); }
});
test('capture before screenshots of enabled affected desktop pages',async({page})=>{
  test.skip(process.env.UX_CAPTURE_BEFORE!=='1');
  fs.mkdirSync(path.join(evidence,'before'),{recursive:true}); await page.setViewportSize({width:1366,height:768});
  await page.addInitScript(()=>localStorage.setItem('bbLanguage','ar'));
  for(const [id,route] of [['schedule','/operations/schedule'],['performance-settings','/opmanager/settings/performance-settings/appraisal'],['succession','/operations/succession'],['development','/operations/development'],['reports','/operations/reports/performance'],['trips','/operations/trips'],['offers','/operations/offers'],['log','/operations/log'],['catalogs','/opmanager/settings/master'],['roster-settings','/opmanager/settings/roster'],['appearance','/opmanager/settings/appearance']]){
    await page.goto(route+'?date=2026-10-11',{waitUntil:'networkidle'});await page.screenshot({path:path.join(evidence,'before',id+'.png'),fullPage:false});
  }
});

test('UX02 schedule grid is visible at laptop size and import settings open only on demand',async({page})=>{
 await page.addInitScript(()=>localStorage.setItem('bbLanguage','en'));await page.setViewportSize({width:1366,height:768});await page.goto('/operations/schedule',{waitUntil:'networkidle'});
 const grid=page.locator('.schedule-grid-table').first();await expect(grid).toBeVisible();const box=await grid.boundingBox();expect(box.y).toBeLessThan(560);await expect(page.getByLabel('Import mode',{exact:true})).toHaveCount(0);
 const edit=page.getByRole('button',{name:'Start live editing',exact:true});if(await edit.count())await edit.click();await page.getByRole('button',{name:'Import XLSX',exact:true}).click();await expect(page.getByRole('dialog')).toBeVisible();await expect(page.getByLabel('Import mode',{exact:true})).toBeVisible();await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).toHaveCount(0);
});
test('UX03 HRIS dialog contains keyboard focus, protects a changed draft and restores focus',async({page})=>{
 await page.addInitScript(()=>localStorage.setItem('bbLanguage','en'));const db=new PrismaClient();const employee=await db.employee.create({data:{name:'Dialog keyboard fixture',employmentType:'PART_TIME',localEmployeeCode:'PT-UX-DIALOG',branch:'MOT',jobTitle:'Ride Operator'}});await db.$disconnect();
 await page.goto('/operations/employees?employeeId='+employee.id,{waitUntil:'networkidle'});const trigger=page.getByRole('button',{name:'Convert PT to HRIS',exact:true});await trigger.click();const dialog=page.getByRole('dialog');await expect(dialog).toBeVisible();await expect(dialog.getByLabel('HRIS number',{exact:true})).toBeFocused();
 const controls=dialog.locator('button,input,textarea,select').filter({visible:true});const last=controls.last();await last.focus();await page.keyboard.press('Tab');expect(await page.evaluate(()=>Boolean(document.activeElement.closest('dialog')))).toBe(true);
 await dialog.getByLabel('HRIS number',{exact:true}).fill('91234');page.once('dialog',event=>event.dismiss());await page.keyboard.press('Escape');await expect(dialog).toBeVisible();page.once('dialog',event=>event.accept());await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);await expect(trigger).toBeFocused();
});
test('UX04 performance settings begin read only and provide an explicit editable draft stage',async({page})=>{
 await page.addInitScript(()=>localStorage.setItem('bbLanguage','en'));
 await page.route('**/api/operations/performance-settings*',async route=>{const response=await route.fetch();const json=await response.json();json.state.draft=null;await route.fulfill({response,json});});
 await page.goto('/opmanager/settings/performance-settings/appraisal',{waitUntil:'networkidle'});
 const readonly=page.locator('fieldset[data-readonly]');await expect(readonly).toHaveAttribute('data-readonly','true');await page.getByRole('button',{name:'Create editable draft',exact:true}).click();await expect(readonly).toHaveAttribute('data-readonly','false');await expect(page.getByRole('button',{name:'Save draft',exact:true})).toBeVisible();await expect(page.locator('.ui-version-lifecycle')).toContainText('Existing approved records');
});

test('FD02 denied secondary tabs and APIs stay protected, and losing a tab grant falls back safely',async({page,browser})=>{
 await page.addInitScript(()=>localStorage.setItem('bbLanguage','en'));await page.goto('/operations/employees',{waitUntil:'networkidle'});await page.getByRole('button',{name:'Guest Feedback',exact:true}).click();
 const {user}=await page.request.get('/api/account').then(r=>r.json());const limited={...user,permissions:{...user.permissions,'employees.sensitive':null}};
 await page.evaluate(value=>window.dispatchEvent(new CustomEvent('account-updated',{detail:value})),limited);
 await expect(page.getByRole('button',{name:'Guest Feedback',exact:true})).toHaveCount(0);await expect(page.getByRole('button',{name:'Overview',exact:true})).toHaveAttribute('aria-current','page');
 const db=new PrismaClient();let token;try{
  const raw=await db.user.create({data:{name:'Restricted employee viewer',username:'restricted-ux-'+Date.now(),role:'ADMIN',password:'unusable'}});await require('../e2e/account-fixtures').registerAccountFixture(db,raw);
  const service=require('../../lib/accounts/service'),{config}=await service.readConfig(db);config.accounts[raw.id].overrides={'employees.sensitive':null,'files.view':null,'files.download':null,'competencies.view':null,'eom.view':null};await db.systemSetting.update({where:{key:service.KEY},data:{value:JSON.stringify(config)}});token=require('../../lib/auth').encodeSession(await service.loadAccount(db,raw));
 }finally{await db.$disconnect();}
 const context=await browser.newContext({baseURL:'http://127.0.0.1:3018'});await context.addCookies([{name:process.env.AUTH_COOKIE_NAME,value:token,domain:'127.0.0.1',path:'/',httpOnly:true,sameSite:'Strict'}]);
 try{const restricted=await context.newPage();await restricted.addInitScript(()=>localStorage.setItem('bbLanguage','en'));await restricted.goto('/operations/employees',{waitUntil:'networkidle'});for(const title of ['Personal','Guest Feedback','Guidance & Penalties','Incidents','Manager AI Assistant','Documents','Files'])await expect(restricted.getByRole('button',{name:title,exact:true})).toHaveCount(0);
  const result=await context.request.get(`/api/operations/employees/${realistic.employeeId}/360`);expect(result.status()).toBe(200);const payload=await result.json();expect(payload.employee.guestFeedback||[]).toEqual([]);expect(payload.employee.nationalId).toBeUndefined();
  expect((await context.request.post(`/api/operations/employees/${realistic.employeeId}/360`,{data:{action:'guestFeedback',comment:'Unauthorized'}})).status()).toBe(403);
 }finally{await context.close();}
});

test('UX08 invalid fields show inline recovery, summary and accessible association without discarding entries',async({page})=>{
 await page.addInitScript(()=>localStorage.setItem('bbLanguage','en'));await page.goto('/operations/employees',{waitUntil:'networkidle'});await page.getByRole('button',{name:'Convert PT to HRIS',exact:true}).click();const dialog=page.getByRole('dialog');
 await dialog.getByLabel('HRIS number',{exact:true}).fill('1234');await dialog.getByLabel('Signed HRIS contract (required)',{exact:true}).setInputFiles({name:'contract.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.4\nContract\n%%EOF')});await dialog.getByRole('button',{name:'Convert to HRIS',exact:true}).click();
 await expect(dialog.locator('.ui-form-error-summary')).toBeVisible();await expect(dialog.getByLabel('HRIS number',{exact:true})).toHaveAttribute('aria-invalid','true');await expect(dialog.getByLabel('HRIS number',{exact:true})).toHaveAttribute('aria-describedby',/.+/);await expect(dialog.getByLabel('HRIS number',{exact:true})).toHaveValue('1234');page.once('dialog',d=>d.accept());await page.keyboard.press('Escape');
});

test('UX09 connected plan, development review and manual readiness preserve employee and evaluation behavior',async({page})=>{
 await page.addInitScript(()=>localStorage.setItem('bbLanguage','en'));await page.goto('/operations/succession?planId='+realistic.candidateId,{waitUntil:'networkidle'});await expect(page.getByRole('region',{name:'Plan completeness',exact:true})).toBeVisible();await expect(page.locator('.ui-plan-completeness')).toContainText('Competency evidence');
 await page.goto('/operations/development?developmentId='+realistic.developmentId,{waitUntil:'networkidle'});const task=page.locator('#assignment-'+realistic.taskId);await task.getByLabel('Assignment status',{exact:true}).selectOption('IN_PROGRESS');await task.getByLabel('Progress or completion note',{exact:true}).fill('Alternative drill arranged; supervisor will observe the next shift.');await task.getByLabel('Update reason',{exact:true}).fill('Resolve the support blocker and record progress.');await task.getByRole('button',{name:'Save progress review',exact:true}).click();await expect(page.getByRole('status').filter({hasText:'Saved.'})).toBeVisible();
 await page.goto('/operations/succession?planId='+realistic.candidateId,{waitUntil:'networkidle'});await page.getByRole('button',{name:'Record Readiness Decision',exact:true}).click();const decision=page.locator('#readiness-decision-form');await decision.getByLabel('Decision',{exact:true}).selectOption('READY_WITH_CONDITIONS');await decision.getByLabel('Decision reason',{exact:true}).fill('Observed progress supports supervised cover with remaining practical gaps.');await decision.getByLabel('Remaining conditions and gaps',{exact:true}).fill('Finish two observed shifts and the incident response drill.');await decision.getByLabel('Next review date',{exact:true}).fill('2026-11-01');await decision.getByLabel('Signed observation checklist',{exact:true}).check();await decision.getByRole('button',{name:'Save documented decision',exact:true}).click();await expect(page.locator('[data-status=READY_WITH_CONDITIONS]').first()).toBeVisible();
 const db=new PrismaClient();try{expect((await db.employee.findUnique({where:{id:realistic.employeeId}})).jobTitle).toBe('Ride Operator');expect(await db.opsMonthlyAppraisal.count({where:{employeeId:realistic.employeeId}})).toBe(0);}finally{await db.$disconnect();}
});

test('UX10 report period describes decision history and exports the active reference dates',async({page})=>{
 await page.addInitScript(()=>localStorage.setItem('bbLanguage','en'));await page.goto('/operations/reports/performance?period=2026-10&employeeId='+realistic.employeeId,{waitUntil:'networkidle'});await expect(page.getByLabel('Decision history month',{exact:true})).toHaveValue('2026-10');await expect(page.locator('.ui-filter-criteria').first()).toContainText('Decisions');const download=page.waitForEvent('download');await page.getByRole('button',{name:'Export CSV',exact:true}).click();const file=await (await download).path();expect(fs.readFileSync(file,'utf8')).toContain('Employee');await expect(page.locator('.ui-filter-criteria').first()).toContainText('2026-10-01');await page.reload({waitUntil:'networkidle'});await expect(page.getByLabel('Decision history month',{exact:true})).toHaveValue('2026-10');
});

test('UX11 period bookings are discoverable and preserve their stable destination after refresh',async({page})=>{
 await page.addInitScript(()=>localStorage.setItem('bbLanguage','en'));for(const [route,name]of [['trips','November school visit'],['birthdays','Mariam']]){await page.goto('/operations/'+route+'?bookingMonth=2026-11',{waitUntil:'networkidle'});await expect(page.getByRole('heading',{name:'Bookings for selected period',exact:true})).toBeVisible();await expect(page.locator('.ui-period-bookings')).toContainText(name);await page.reload({waitUntil:'networkidle'});await expect(page.getByLabel('Booking month',{exact:true})).toHaveValue('2026-11');}
});

test('UX12 active date-relevant offers and inactive offers remain separately available',async({page})=>{
 await page.addInitScript(()=>localStorage.setItem('bbLanguage','en'));await page.goto('/operations/offers?date=2026-10-11',{waitUntil:'networkidle'});await expect(page.getByText('Current Sunday offer',{exact:true})).toBeVisible();await expect(page.getByText('Archived summer offer',{exact:true})).toHaveCount(0);await page.getByLabel('Offer view',{exact:true}).selectOption('INACTIVE');await expect(page.getByText('Archived summer offer',{exact:true})).toBeVisible();await expect(page.getByText('Current Sunday offer',{exact:true})).toHaveCount(0);
});

test('UX13 human-readable account events keep technical codes in expandable details',async({page})=>{
 await page.addInitScript(()=>localStorage.setItem('bbLanguage','ar'));await page.goto('/opmanager/settings/account-activity',{waitUntil:'networkidle'});await expect(page.getByLabel('المستخدم',{exact:true})).toBeVisible();await expect(page.getByLabel('الإجراء',{exact:true})).toBeVisible();const first=page.locator('.record-line-table tbody tr').first();if(await first.count()){expect(await first.locator('td').nth(1).innerText()).not.toMatch(/ACCOUNT_|OPS_/);await first.getByText('التفاصيل الفنية والقيم',{exact:true}).click();await expect(first.locator('code')).toContainText('ACCOUNT_');}
});

test('UX14 structured catalog additions and archival roundtrip without changing existing stock',async({page})=>{
 await page.addInitScript(()=>localStorage.setItem('bbLanguage','en'));const before=database(db=>db.prepare('SELECT COUNT(*) n FROM OpsWristbandStock').get().n);await page.goto('/opmanager/settings/master',{waitUntil:'networkidle'});const catalog=page.locator('.ui-structured-catalog').filter({has:page.getByRole('heading',{name:'Sock sizes',exact:true})});await catalog.getByRole('button',{name:'Add entry',exact:true}).click();const dialog=page.getByRole('dialog');await dialog.getByLabel('Stable code',{exact:true}).fill('UX_SIZE');await dialog.getByLabel('English label',{exact:true}).fill('Trial size');await dialog.getByLabel('Arabic label',{exact:true}).fill('مقاس تجريبي');await dialog.getByRole('button',{name:'Add to catalog draft',exact:true}).click();await page.getByRole('button',{name:'Save catalogues',exact:true}).click();await expect(page.getByRole('status').filter({hasText:'Settings saved'})).toBeVisible();await page.reload({waitUntil:'networkidle'});const row=catalog.locator('tr').filter({hasText:'UX_SIZE'});await expect(row.getByLabel('Sock sizes · UX_SIZE · Arabic label',{exact:true})).toHaveValue('مقاس تجريبي');page.once('dialog',d=>d.accept());await row.getByRole('button',{name:'Archive entry',exact:true}).click();await page.getByRole('button',{name:'Save catalogues',exact:true}).click();await expect(page.getByRole('status').filter({hasText:'Settings saved'})).toBeVisible();expect(database(db=>db.prepare('SELECT COUNT(*) n FROM OpsWristbandStock').get().n)).toBe(before);
});

test('UX16 login distinguishes transport, credentials and temporary service failures and retains username',async({browser})=>{
 const context=await browser.newContext({baseURL:'http://127.0.0.1:3018',storageState:{cookies:[],origins:[]}});const page=await context.newPage();await page.addInitScript(()=>localStorage.setItem('bbLanguage','en'));try{await page.goto('/login');await page.getByLabel('Username',{exact:true}).fill('manager-retry');await page.getByLabel('Password',{exact:true}).fill('wrong-password');for(const [mode,message]of [['network','Could not connect'],['credentials','username or password is incorrect'],['service','temporarily unavailable']]){await page.route('**/api/auth/login',route=>mode==='network'?route.abort():route.fulfill({status:mode==='credentials'?401:503,contentType:'application/json',body:JSON.stringify({success:false,error:'internal error'})}));await page.locator('button[type=submit]').click();await expect(page.locator('.message[role=alert]')).toContainText(message);await expect(page.getByLabel('Username',{exact:true})).toHaveValue('manager-retry');await page.unroute('**/api/auth/login');}}finally{await context.close();}
});

test('UX17 personal theme and shared brand scope are explicit and independently applied',async({page})=>{
 await page.addInitScript(()=>{localStorage.setItem('bbLanguage','en');localStorage.setItem('bbTheme','blue');});await page.goto('/opmanager/settings/appearance',{waitUntil:'networkidle'});await expect(page.locator('.ui-theme-scope')).toContainText('Your personal interface theme');await expect(page.locator('.ui-theme-scope')).toContainText('Operations dashboard brand colors');await page.getByRole('button',{name:'Change interface theme',exact:true}).click();expect(await page.evaluate(()=>localStorage.getItem('bbTheme'))).not.toBe('blue');await page.getByLabel('Primary accent',{exact:true}).selectOption('plum');const theme=await page.evaluate(()=>localStorage.getItem('bbTheme'));await page.getByRole('button',{name:'Save UI settings',exact:true}).click();expect(await page.evaluate(()=>localStorage.getItem('bbTheme'))).toBe(theme);
});

test('UX18 section index reflects unsaved rule sections and Save announces its exact scope',async({page})=>{
 await page.addInitScript(()=>localStorage.setItem('bbLanguage','en'));await page.goto('/opmanager/settings/rules',{waitUntil:'networkidle'});await expect(page.getByRole('navigation',{name:'Sections on this page',exact:true})).toBeVisible();await page.getByLabel('Late grace minutes',{exact:true}).fill('12');await expect(page.getByRole('navigation',{name:'Sections on this page',exact:true})).toContainText('unsaved');const button=page.getByRole('button',{name:'Save',exact:true}).first();await expect(button).toHaveAttribute('title',/Attendance/);
});

test('FD03 saving through the UI updates titles and landing preferences immediately',async({page})=>{
 await page.addInitScript(()=>localStorage.setItem('bbLanguage','en'));const key='OPS_DASHBOARD_UI_CONFIG',old=database(db=>db.prepare('SELECT value FROM SystemSetting WHERE key=?').get(key).value);
 try{await page.goto('/opmanager',{waitUntil:'networkidle'});await page.goto('/opmanager/settings/dashboard',{waitUntil:'networkidle'});await page.getByLabel('Dashboard title (English)',{exact:true}).fill('Saved through the current editor');await page.getByRole('button',{name:'Save UI settings',exact:true}).click();await expect(page.getByRole('status').filter({hasText:'UI settings saved'})).toBeVisible();await page.getByRole('link',{name:'View dashboard',exact:true}).click();await expect(page.locator('[data-page-header] h1')).toHaveText('Saved through the current editor');
  await page.goto('/opmanager/settings/navigation',{waitUntil:'networkidle'});await page.getByLabel('Default landing page',{exact:true}).selectOption('stock');await page.getByLabel('Starting view',{exact:true}).selectOption('configured');await page.getByRole('button',{name:'Save UI settings',exact:true}).click();await expect(page.getByRole('status').filter({hasText:'UI settings saved'})).toBeVisible();const saved=await page.request.get('/api/operations/settings?keys='+key).then(r=>r.json());expect(JSON.parse(saved.settings[0].value).landing.destination).toBe('stock');
 }finally{await page.request.patch('/api/operations/settings',{data:{key,value:old}});}
});

test('printed roster retains English artwork and a full-width single portrait A4 page',async({page})=>{
 const {PDFDocument}=require('pdf-lib');for(const language of ['en','ar']){await page.addInitScript(value=>localStorage.setItem('bbLanguage',value),language);await page.setViewportSize({width:1366,height:768});await page.goto('/operations/daily-preview?date=2026-10-11',{waitUntil:'networkidle'});await page.evaluate(()=>document.fonts.ready);await expect(page.locator('.daily-operations-poster')).toContainText('Morning Shift');await page.evaluate(()=>document.body.dataset.dailyPreviewPrint='true');await page.emulateMedia({media:'print'});const box=await page.locator('.daily-operations-poster').evaluate(el=>({width:el.getBoundingClientRect().width,scroll:el.scrollWidth}));expect(box.scroll).toBeLessThanOrEqual(Math.ceil(box.width)+1);const bytes=await page.pdf({preferCSSPageSize:true,printBackground:true}),pdf=await PDFDocument.load(bytes);expect(pdf.getPageCount()).toBe(1);expect(pdf.getPage(0).getWidth()).toBeCloseTo(595.28,0);expect(pdf.getPage(0).getHeight()).toBeCloseTo(841.89,0);fs.mkdirSync(evidence,{recursive:true});fs.writeFileSync(path.join(evidence,'roster-'+language+'.pdf'),bytes);await page.emulateMedia({media:'screen'});}
});

for(const language of ['en','ar'])for(const theme of ['classic','blue','orange','red'])for(const [width,height]of [[1366,768],[1440,900],[1920,1080]])test(`visual desktop regression ${language} ${theme} ${width}`,async({page})=>{
 test.skip(process.env.UX_VISUAL!=='1');test.setTimeout(240000);const folder=path.join(evidence,'after');fs.mkdirSync(folder,{recursive:true});await page.setViewportSize({width,height});await page.addInitScript(({language,theme})=>{localStorage.setItem('bbLanguage',language);localStorage.setItem('bbTheme',theme);},{language,theme});const errors=[];page.on('pageerror',error=>errors.push(error.message));
 const routes=[['dashboard','/opmanager'],['stock','/operations/stock'],['schedule','/operations/schedule'],['performance-settings','/opmanager/settings/performance-settings/appraisal'],['succession','/operations/succession'],['succession-plan','/operations/succession?planId='+realistic.candidateId],['development','/operations/development'],['development-plan','/operations/development?developmentId='+realistic.developmentId],['reports','/operations/reports/performance?period=2026-10'],['trips','/operations/trips?bookingMonth=2026-11'],['birthdays','/operations/birthdays?bookingMonth=2026-11'],['offers','/operations/offers?date=2026-10-11'],['log','/operations/log'],['account-activity','/opmanager/settings/account-activity'],['catalogs','/opmanager/settings/master'],['roster-settings','/opmanager/settings/roster'],['appearance','/opmanager/settings/appearance'],['employees','/operations/employees'],['live-editor','/opmanager/settings/live-editors/roster']];
 const targets=process.env.UX_SCREEN_TARGETS?.split(',');
 for(const [id,url]of routes.filter(([id])=>!targets||targets.includes(id))){await page.goto(url,{waitUntil:'networkidle'});await expect(page.locator('[data-page-header] h1')).toBeVisible();await expect(page.locator('html')).toHaveAttribute('dir',language==='ar'?'rtl':'ltr');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),id).toBe(true);if(['offers','trips','birthdays'].includes(id)){for(const table of await page.locator('.ui-comparison-table').all())expect(await table.evaluate(el=>el.parentElement.scrollWidth<=el.parentElement.clientWidth+2)).toBe(true);}await page.screenshot({path:path.join(folder,`${id}-${language}-${theme}-${width}.png`)});if(id==='catalogs'){const catalog=page.locator('.ui-structured-catalog').first();await catalog.scrollIntoViewIfNeeded();expect(await catalog.locator('.record-table-scroll').evaluate(el=>el.scrollWidth<=el.clientWidth+2)).toBe(true);await page.screenshot({path:path.join(folder,`catalog-detail-${language}-${theme}-${width}.png`)});}}
 await page.goto('/operations/succession?planId='+realistic.candidateId,{waitUntil:'networkidle'});await page.getByRole('button',{name:language==='ar'?'تسجيل قرار الجاهزية':'Record Readiness Decision',exact:true}).click();await page.locator('#readiness-decision-form').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(folder,`readiness-${language}-${theme}-${width}.png`)});
 if(!targets||targets.includes('hris-dialog')){await page.goto('/operations/employees',{waitUntil:'networkidle'});const convert=page.getByRole('button',{name:language==='ar'?'تحويل الموظف الجزئي إلى HRIS':'Convert PT to HRIS',exact:true});if(await convert.count()){await convert.click();const dialog=page.getByRole('dialog');await expect(dialog).toHaveAttribute('dir',language==='ar'?'rtl':'ltr');expect(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth+2)).toBe(true);await page.screenshot({path:path.join(folder,`hris-dialog-${language}-${theme}-${width}.png`)});await page.keyboard.press('Escape');}}
 expect(errors).toEqual([]);
});
