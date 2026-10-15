require('../e2e/account-fixtures').installLanguageFixture();
const {test, expect} = require('@playwright/test');
const {PrismaClient} = require('@prisma/client');
const {assertIsolatedEnvironment} = require('../e2e/isolation');
const {loadAccount} = require('../../lib/accounts/service');
const service = require('../../lib/operations/planning-service');
const {getEffectivePerformanceSettings} = require('../../lib/operations/performance-settings-service');
const {proposedFramework, keyOf} = require('../../lib/operations/succession-workspace');
const fs = require('node:fs'), path = require('node:path');
const stage = process.env.OPS_UIUX_STAGE || 'after';
const folder = path.resolve('docs/audit-evidence/planning-uiux', stage);
fs.mkdirSync(folder, {recursive:true});
let records = [];
test.beforeAll(async () => {
 assertIsolatedEnvironment(); const db = new PrismaClient();
 try {
  const raw = await db.user.findFirst({where:{active:true, role:'ADMIN'}}), user = await loadAccount(db, raw);
  const configuration = (await getEffectivePerformanceSettings(db, {branch:'MOT'})).value.succession;
  for (const [index,name] of ['Sara Hassan — سارة حسن','Karim Nabil — كريم نبيل','Mona Adel — منى عادل'].entries()) {
   const employee = await db.employee.upsert({where:{name},create:{name,branch:'MOT',department:'OPERATION',jobTitle:'Ride Operator'},update:{}});
   const previous = await service.loadPlanning(db,{user,branch:'MOT',mode:'succession'}), existing = previous.succession.find(row=>row.employeeId===employee.id), existingDevelopment = existing&&previous.developments.find(row=>row.candidateId===existing.id);
   if(existing&&existingDevelopment){records.push({candidateId:existing.id,developmentId:existingDevelopment.id,employeeId:employee.id});continue;}
   const framework = proposedFramework(configuration, {currentRole:'Ride Operator',targetRole:'Front Cashier'}).slice(0,2);
   const {candidate} = await service.createSuccession(db,{user,branch:'MOT',employeeId:employee.id,targetRole:'Front Cashier',framework,details:{ownerUserId:user.id,nextReviewDate:index===0?'2026-10-01':'2027-01-10',targetDate:'2027-03-01',reviewFrequency:'MONTHLY',businessNeed:'Provide reliable cashier cover through supervised practical development.'}});
   const proof = await db.employeeDocument.create({data:{employeeId:employee.id,documentType:'OTHER',storageKey:'uiux-proof-'+employee.id,displayName:'Signed observation checklist — سجل الملاحظة',mimeType:'application/pdf',sizeBytes:20}});
   const {development} = await service.createDevelopment(db,{user,branch:'MOT',candidateId:candidate.id,ownerUserId:user.id,objectives:framework.map((definition,i)=>({gapKey:keyOf(definition),outcome:i?'Handle guest requests independently during two observed shifts':'Complete opening checks and demonstrate safe incident response',successCriteria:'Supervisor verifies the practical checklist during two observed shifts.',targetDate:index===0?'2026-10-08':'2027-02-01',assignments:[{task:i?'Shadow an experienced cashier and practise handling guest requests':'Run a supervised opening check and emergency response drill',responsibleUserId:user.id,dueDate:index===0?'2026-10-07':'2027-01-20'}]}))});
   if(index===0) await service.updateAssignment(db,{user,branch:'MOT',developmentId:development.id,assignmentId:development.objectives[0].assignments[0].id,expectedRevision:1,status:'BLOCKED',blocker:'Drill equipment is unavailable. Arrange a supervised alternative with the shift leader.',reason:'Document the support needed before the next practical review.'});
   if(index===1) {
    for(const [i,objective] of development.objectives.entries()) await service.updateAssignment(db,{user,branch:'MOT',developmentId:development.id,assignmentId:objective.assignments[0].id,expectedRevision:i+1,status:'COMPLETED',completionNote:'Supervisor observed and signed the completed practical assignment.',documentIds:[proof.id],reason:'Document the successful observed practical review.'});
    await service.decideReadiness(db,{user,branch:'MOT',candidateId:candidate.id,expectedRevision:1,decision:'READY_WITH_CONDITIONS',decisionDate:'2026-10-10',reason:'Practical review and signed observations support supervised cashier cover.',remainingConditions:'Maintain supervised cover for the first two independent shifts.',nextReviewDate:'2027-01-10',documentIds:[proof.id]});
   }
   records.push({candidateId:candidate.id,developmentId:development.id,employeeId:employee.id});
  }
 } finally {await db.$disconnect();}
});
async function fit(page) {
 const root=page.locator('[data-planning-page]'); await expect(root).toBeVisible();
 expect(await root.evaluate(el=>el.scrollWidth<=el.clientWidth+2)).toBe(true);
 expect(await root.evaluate(el=>[...el.querySelectorAll('input,select,textarea,button')].filter(c=>c.getBoundingClientRect().width>0&&!c.closest('[class*="scroll"]')).every(c=>{const r=c.getBoundingClientRect();return r.left>=-2&&r.right<=innerWidth+2&&(c.type==='checkbox'||r.width>=35);}))).toBe(true);
 expect(await root.evaluate(el=>[...el.querySelectorAll('*')].filter(c=>c.getBoundingClientRect().height>0&&!c.closest('[class*="scroll"]')&&['auto','scroll'].includes(getComputedStyle(c).overflowY)&&c.scrollHeight>c.clientHeight+3&&c.clientHeight<300).map(c=>({tag:c.tagName,css:c.className,height:c.clientHeight,content:c.scrollHeight})))).toEqual([]);
}
test('realistic records: visual hierarchy, mobile cards, readiness and themes',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const sizes=stage==='before'||process.env.OPS_UIUX_QUICK==='1'?[['laptop',1366,768],['mobile',390,844]]:[['desktop',1920,1080],['laptop',1366,768],['tablet',820,1180],['mobile',390,844]];
 for(const language of ['en','ar']) for(const [size,width,height] of sizes.filter(([,width])=>process.env.OPS_E2E_DESKTOP_ONLY!=="1"||width>=1366)) for(const theme of (stage==='before'||process.env.OPS_UIUX_QUICK==='1'?['classic']:['classic','red','blue','orange'])) {
  await page.setViewportSize({width,height});await page.addInitScript(({language,theme})=>{localStorage.setItem('bbLanguage',language);localStorage.setItem('bbTheme',theme);},{language,theme});
  const screens=[['succession-list','/operations/succession'],['development-list','/operations/development'],['succession','/operations/succession?planId='+records[0].candidateId],['development','/operations/development?developmentId='+records[0].developmentId],['readiness','/operations/succession?planId='+records[1].candidateId],['reports','/operations/reports/performance?q=—']];
  for(const [name,url] of screens){
   await page.goto(url,{waitUntil:'networkidle'});await fit(page);
   if(name==='readiness') {await page.getByRole('button',{name:language==='ar'?'تسجيل قرار الجاهزية':'Record Readiness Decision',exact:true}).click();await page.locator('#plan-readiness').scrollIntoViewIfNeeded();}
   else await page.locator('[data-planning-page]').scrollIntoViewIfNeeded();
   if(theme==='classic'||size==='laptop'&&language==='en') {
    await page.screenshot({path:path.join(folder,`${name}-${language}-${size}-${theme}.png`)});
    if(name.endsWith('-list')||name==='reports'){await page.locator('table tbody tr').first().scrollIntoViewIfNeeded();await page.screenshot({path:path.join(folder,`${name}-records-${language}-${size}-${theme}.png`)});}
    if(name==='development'){await page.locator('summary').filter({hasText:'Run a supervised opening check'}).evaluate(el=>el.scrollIntoView({block:'start'}));await page.screenshot({path:path.join(folder,`${name}-progress-${language}-${size}-${theme}.png`)});}
    if(name==='readiness'){await page.locator('#readiness-decision-form').evaluate(el=>el.scrollIntoView({block:'start'}));await page.screenshot({path:path.join(folder,`${name}-form-${language}-${size}-${theme}.png`)});}
   }
   if(stage!=='before'&&name.endsWith('-list')&&width<700) {await expect(page.locator('[data-responsive-table]')).toBeVisible();expect(await page.locator('[data-responsive-table]').evaluate(el=>el.scrollWidth<=el.clientWidth+2)).toBe(true);}
   if(stage!=='before'&&name==='reports') await expect(page.getByRole('button',{name:language==='ar'?'تصدير CSV':'Export CSV',exact:true})).toBeVisible();
  }
 }
 expect(errors).toEqual([]);
});
test('filters, empty/error/loading feedback and documented progress remain usable',async({page})=>{
 test.skip(stage==='before');await page.addInitScript(()=>localStorage.setItem('bbLanguage','en'));
 await page.setViewportSize(process.env.OPS_E2E_DESKTOP_ONLY==="1"?{width:1366,height:768}:{width:390,height:844});await page.goto('/operations/development?developmentId='+records[0].developmentId,{waitUntil:'networkidle'});
 await expect(page.getByText('Blocked',{exact:true}).first()).toBeVisible();await expect(page.getByText('Overdue',{exact:true}).first()).toBeVisible();
 const task=page.locator('[id^=assignment-]').first();
 await task.getByLabel('Assignment status',{exact:true}).selectOption('IN_PROGRESS');await task.getByLabel('Progress or completion note',{exact:true}).fill('Alternative equipment is ready and a supervised drill is now scheduled.');await task.getByLabel('Update reason',{exact:true}).fill('Resolve the blocker and document a manager progress review.');await task.getByRole('button',{name:'Save progress review',exact:true}).click();await expect(page.getByRole('status').filter({hasText:'Saved.'})).toBeVisible();
 await page.goto('/operations/succession',{waitUntil:'networkidle'});await page.getByLabel('Search employee or role',{exact:true}).fill('__no_match__');await expect(page.getByText('No plans match this view',{exact:true})).toBeVisible();await page.screenshot({path:path.join(folder,'filtered-empty-mobile.png')});await page.getByRole('button',{name:'Reset filters',exact:true}).click();await expect(page.getByText('No plans match this view',{exact:true})).toHaveCount(0);
 await page.getByText(/More filters/).click();await page.getByLabel('Readiness',{exact:true}).selectOption('READY_WITH_CONDITIONS');await expect(page.locator('[data-responsive-table]').getByText('Karim Nabil — كريم نبيل')).toBeVisible();await page.reload({waitUntil:'networkidle'});await expect(page.getByLabel('Readiness',{exact:true})).toHaveValue('READY_WITH_CONDITIONS');
 await page.route('**/api/operations/planning?*',route=>route.fulfill({status:500,contentType:'application/json',body:JSON.stringify({error:'Fixture service unavailable. Please retry.'})}));await page.goto('/operations/development');await expect(page.getByRole('alert').filter({hasText:'Fixture service'})).toContainText('unavailable');await page.screenshot({path:path.join(folder,'error-mobile.png')});await page.unroute('**/api/operations/planning?*');await page.getByRole('button',{name:'Try again',exact:true}).click();await expect(page.locator('[data-planning-page]')).toBeVisible();
 await page.route('**/api/operations/planning?*',async route=>{await new Promise(r=>setTimeout(r,1800));await route.continue();});await page.goto('/operations/succession',{waitUntil:'domcontentloaded'});await expect(page.getByRole('status').filter({hasText:'Loading planning records'})).toBeVisible();await page.screenshot({path:path.join(folder,'loading-mobile.png')});await expect(page.locator('[data-planning-page]')).toBeVisible();
 const db=new PrismaClient();try{expect((await db.employee.findUnique({where:{id:records[0].employeeId}})).jobTitle).toBe('Ride Operator');const saved=JSON.parse((await db.systemSetting.findUnique({where:{key:'OPS_SUCCESSION_PLAN:'+records[0].candidateId}})).value);expect(saved.decisions).toHaveLength(0);expect(saved.status).toBe('ACTIVE');}finally{await db.$disconnect();}
});
