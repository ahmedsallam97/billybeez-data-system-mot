require('../e2e/account-fixtures').installLanguageFixture();
const {test,expect}=require('@playwright/test');
const {PrismaClient}=require('@prisma/client');
const {assertIsolatedEnvironment}=require('../e2e/isolation');
const fs=require('node:fs'),path=require('node:path');
const evidence=path.resolve('tmp/roster-layout-evidence');fs.mkdirSync(evidence,{recursive:true});
const {readConfig}=require('../../lib/accounts/service');
const {qualifyCurrentEmployees}=require('../../lib/operations/current-employee-qualifications');
let trip,birthday;
test.beforeAll(async()=>{
 assertIsolatedEnvironment();const db=new PrismaClient();
 try{
  const {config}=await readConfig(db),role=config.roles.find(row=>row.name==='Super Admin'),id=Object.entries(config.accounts).find(([,p])=>p.roleId===role.id&&!p.archivedAt)[0];
  await qualifyCurrentEmployees(db,{userId:id,backupReference:'disposable browser test'});
  trip=await db.opsDailyTrip.create({data:{branch:'MOT',workDate:'2026-10-11',name:'Pilot trip leadership fixture',startTime:'10:00',endTime:'12:00'}});
  birthday=await db.opsDailyEvent.create({data:{branch:'MOT',workDate:'2026-10-11',name:'Pilot birthday responsibility fixture',eventType:'BIRTHDAY',startTime:'16:00',endTime:'18:00'}});
 }finally{await db.$disconnect();}
});
for(const language of ['en','ar'])for(const [name,width,height]of [['desktop',1920,1080],['laptop',1366,768]])test(`${language} ${name}: roster and monthly responsibilities, equal cards, centered titles and single-line names`,async({page})=>{
 await page.setViewportSize({width,height});await page.addInitScript(lang=>localStorage.setItem('bbLanguage',lang),language);
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto('/operations?tab=roster&date=2026-10-11',{waitUntil:'networkidle'});
 const workspace=page.getByRole('region',{name:'Daily responsibilities'});
 await expect(workspace.getByRole('button',{name:language==='ar'?'حفظ المسؤولين':'Save responsibilities'})).toBeEnabled();
 const data=await (await page.request.get('/api/operations/responsibilities?date=2026-10-11&branch=MOT')).json();
 const am=data.employees.find(row=>row.shiftCode==='AM'),pm=data.employees.find(row=>row.shiftCode==='PM');expect(am&&pm).toBeTruthy();
 await workspace.getByLabel(language==='ar'?'تيم ليدر الصبح':'Morning team leader',{exact:true}).selectOption(am.id);
 await workspace.getByLabel(language==='ar'?'تيم ليدر بليل':'Night team leader',{exact:true}).selectOption(pm.id);
 await workspace.getByLabel(new RegExp(language==='ar'?'تيم ليدر الرحلة · Pilot trip':'Trip leader · Pilot trip')).selectOption(am.id);
 await workspace.getByLabel(new RegExp(language==='ar'?'مسؤول عيد الميلاد · Pilot birthday':'Birthday responsible employee · Pilot birthday')).selectOption(pm.id);
 await workspace.getByRole('button',{name:language==='ar'?'حفظ المسؤولين':'Save responsibilities',exact:true}).click();
 await expect(workspace.getByRole('status')).toContainText(language==='ar'?'تم حفظ':'saved');
 await page.reload({waitUntil:'networkidle'});await expect(workspace.getByLabel(language==='ar'?'تيم ليدر الصبح':'Morning team leader',{exact:true})).toHaveValue(am.id);
 const result=await (await page.request.get('/api/operations/roster?date=2026-10-11')).json();
 expect(result.roster.find(row=>row.employee.id===am.id).isShiftLeader).toBe(true);
 expect(result.trips.find(row=>row.id===trip.id).responsibleEmployee.id).toBe(am.id);
 const summaries=page.locator('.ops-daily-summary-pair > .ops-bottom-card');await expect(summaries).toHaveCount(2);
 const boxes=await summaries.evaluateAll(rows=>rows.map(row=>row.getBoundingClientRect().height));expect(Math.abs(boxes[0]-boxes[1])).toBeLessThan(2);
 const headings=await page.locator('.daily-operations-poster .ops-info-card>h3,.daily-operations-poster .ops-bottom-card>h3').evaluateAll(rows=>rows.map(row=>getComputedStyle(row).textAlign));expect(headings.length).toBeGreaterThan(0);expect(headings.every(value=>value==='center')).toBe(true);
 await page.locator('.daily-operations-poster').screenshot({path:path.join(evidence,`${language}-${name}-roster.png`)});
 await page.getByRole('button',{name:language==='ar'?'توليد الروتيشن':'Generate rotation',exact:true}).click();
 await expect(page.locator('.daily-approval-preview > .alert.success')).toContainText(language==='ar'?'تم توليد':'Generated');
 const rotation=await (await page.request.get('/api/operations/roster?date=2026-10-11')).json();expect(rotation.rotation.assignments.length).toBeGreaterThan(0);expect(rotation.rotation.assignments.some(row=>row.employeeId===am.id||row.employeeId===pm.id)).toBe(false);
 await page.goto('/operations?tab=schedule',{waitUntil:'networkidle'});await expect(page.getByRole('heading',{name:language==='ar'?'جدول فريق التشغيل':'Operations team schedule',exact:true})).toBeVisible();
 await workspace.getByLabel('Responsibilities date').fill('2026-10-11');
 await expect(workspace.getByLabel(language==='ar'?'تيم ليدر الصبح':'Morning team leader',{exact:true})).toHaveValue(am.id);
 await workspace.getByLabel(language==='ar'?'تيم ليدر الصبح':'Morning team leader',{exact:true}).selectOption('');
 await workspace.getByRole('button',{name:language==='ar'?'حفظ المسؤولين':'Save responsibilities',exact:true}).click();await expect(workspace.getByRole('status')).toContainText(language==='ar'?'تم حفظ':'saved');
 const cleared=await (await page.request.get('/api/operations/responsibilities?date=2026-10-11')).json();expect(cleared.values.AM).toBe('');
 const names=await page.locator('.schedule-grid-table td:first-child b').evaluateAll(rows=>rows.map(row=>({whiteSpace:getComputedStyle(row).whiteSpace,height:row.getBoundingClientRect().height,lineHeight:parseFloat(getComputedStyle(row).lineHeight),width:row.getBoundingClientRect().width,scroll:row.scrollWidth})));
 expect(names.length).toBeGreaterThan(0);for(const row of names){expect(row.whiteSpace).toBe('nowrap');expect(row.height).toBeLessThan(row.lineHeight+2);expect(row.scroll).toBeLessThanOrEqual(row.width+2);}
 const fit=await workspace.evaluate(root=>({overflow:root.scrollWidth>root.clientWidth+2,bad:[...root.querySelectorAll('button,input,select')].filter(row=>{const r=row.getBoundingClientRect();return r.width>0&&(r.left<0||r.right>innerWidth+2);}).length}));expect(fit.overflow).toBe(false);expect(fit.bad).toBe(0);
 await page.locator('.cashier-schedule').screenshot({path:path.join(evidence,`${language}-${name}-cashier.png`)});
 await page.emulateMedia({media:'print'});await expect(workspace).toBeHidden();await page.emulateMedia({media:'screen'});expect(errors).toEqual([]);
});
test('empty rotation generation returns a useful error and preserves the last valid plan',async({request})=>{
 const before=await (await request.get('/api/operations/roster?date=2026-10-11')).json();expect(before.rotation.assignments.length).toBeGreaterThan(0);
 const db=new PrismaClient();try{await db.employeeQualification.deleteMany();}finally{await db.$disconnect();}
 const generated=await request.post('/api/operations/daily',{data:{action:'generateRotation',date:'2026-10-11',branch:'MOT'}});expect(generated.status()).toBe(422);expect((await generated.json()).error).toContain('previous rotation was preserved');
 const after=await (await request.get('/api/operations/roster?date=2026-10-11')).json();expect(after.rotation.id).toBe(before.rotation.id);expect(after.rotation.assignments.length).toBe(before.rotation.assignments.length);
});
