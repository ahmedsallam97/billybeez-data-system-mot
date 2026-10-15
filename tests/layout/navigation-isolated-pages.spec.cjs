require('../e2e/account-fixtures').installLanguageFixture();
const {test,expect}=require('@playwright/test');
const {PrismaClient}=require('@prisma/client');
const {assertIsolatedEnvironment}=require('../e2e/isolation');
const {readConfig,loadAccount,KEY}=require('../../lib/accounts/service');
const {PERMISSIONS}=require('../../lib/accounts/registry');
const {PAGES}=require('../../lib/operations/page-routes');
test('every sidebar page keeps its title, direction and page width across Arabic/English desktop/tablet/mobile',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 for(const language of ['ar','en'])for(const [width,height]of [[1920,1080],[1366,768],[820,1180],[390,844]].filter(([width])=>process.env.OPS_E2E_DESKTOP_ONLY!=="1"||width>=1366)){
  await page.setViewportSize({width,height});await page.addInitScript(language=>localStorage.setItem('bbLanguage',language),language);
  for(const [id,[href,en,ar]]of Object.entries(PAGES)){
   await page.goto(href,{waitUntil:'networkidle'});await expect(page.locator('.module-page-identity')).toHaveAttribute('data-module',id);await expect(page.locator('.module-page-identity h1')).toHaveCount(1);await expect(page.locator('.module-page-identity h1')).not.toBeEmpty();await expect(page.locator('html')).toHaveAttribute('dir',language==='ar'?'rtl':'ltr');
   expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),`${id} / ${language} / ${width}`).toBe(true);
  }
 }
 expect(errors).toEqual([]);
});
test('module-only grants load their page and API without granting neighbouring modules',async({browser})=>{
 assertIsolatedEnvironment();const db=new PrismaClient();
 try{
  const raw=await db.user.create({data:{name:'Module-only browser fixture',username:'module-only-'+Date.now(),role:'ADMIN',password:'unusable'}});
  await require('../e2e/account-fixtures').registerAccountFixture(db,raw);
  const cases=[
   ['employees','/api/operations/employees'],['schedule','/api/operations/schedules?year=2026&month=10'],
   ['daily','/api/operations/attendance?date=2026-10-10'],['evaluation','/api/operations/evaluations?date=2026-10-10'],
   ['roster','/api/operations/roster?date=2026-10-10'],
   ...['trips','birthdays','offers','stock'].map(id=>[id,'/api/operations/daily?date=2026-10-10&view='+id]),
   ['time','/api/operations/leave-time?year=2026'],
   ['performance','/api/operations/performance?year=2026&month=10&section=appraisal'],
   ['eotm','/api/operations/performance?year=2026&month=10&section=eotm'],
   ['hall','/api/operations/recognition?kind=hall&year=2026'],['audit','/api/reports/audit'],
  ];
  for(const [id,api]of cases){
   const {config}=await readConfig(db);config.accounts[raw.id].overrides={...Object.fromEntries(PERMISSIONS.map(row=>[row.key,null])),[PAGES[id][3]]:'ALL'};
   await db.systemSetting.update({where:{key:KEY},data:{value:JSON.stringify(config)}});
   const user=await loadAccount(db,raw),context=await browser.newContext({baseURL:'http://127.0.0.1:3018'});
   await context.addCookies([{name:process.env.AUTH_COOKIE_NAME,value:require('../../lib/auth').encodeSession(user),domain:'127.0.0.1',path:'/',httpOnly:true,sameSite:'Strict'}]);
   try{
    const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.addInitScript(()=>localStorage.setItem('bbLanguage','en'));
    await page.goto(PAGES[id][0],{waitUntil:'networkidle'});await expect(page.locator('.module-page-identity')).toHaveAttribute('data-module',id);
    const response=await context.request.get(api);expect(response.status(),id+': '+await response.text()).toBe(200);
    await expect(page.locator('.alert.danger')).toHaveCount(0);expect(errors,id).toEqual([]);
    if(id==='employees'){expect((await context.request.get('/api/operations/employees/unknown/360')).status()).toBe(403);await expect(page.getByRole('combobox',{name:'Select employee',exact:true})).toBeDisabled();}
    if(['daily','evaluation'].includes(id)){const result=await context.request.get('/api/operations/daily?date=2026-10-10&view='+(id==='daily'?'attendance':'evaluation'));expect(result.status()).toBe(200);expect(Object.keys(await result.json()).sort()).toEqual(['success','date','branch','branchConfig','schedule'].sort());expect((await context.request.get('/api/operations/daily?date=2026-10-10')).status()).toBe(403);}
    if(['trips','birthdays','offers','stock'].includes(id)){const data=await response.json();for(const key of ['team','rotation','timeline','qualifications'])expect(data[key],id+': '+key).toBeUndefined();for(const neighbour of ['trips','birthdays','offers','stock'].filter(key=>key!==id))expect((await context.request.get('/api/operations/daily?date=2026-10-10&view='+neighbour)).status()).toBe(403);}
    if(id==='performance'){const data=await response.json();expect(data.succession).toEqual([]);expect(data.competitions).toEqual([]);expect((await context.request.get('/api/operations/performance?section=eotm')).status()).toBe(403);}
    if(id==='eotm'){expect((await response.json()).succession).toEqual([]);expect((await context.request.get('/api/operations/performance?section=appraisal')).status()).toBe(403);}
    if(['schedule','roster'].includes(id)){const keys=id==='schedule'?'OPS_SCHEDULE_CODE_CONFIG':'DAILY_OPERATIONS_TEMPLATE_CONFIG,OPS_MOTIVATION_PHRASES,OPS_SCHEDULE_CODE_CONFIG,OPS_ROTATION_RULES,OPS_BRANCH_CONFIG,OPS_PLANNING_CATALOGS';expect((await context.request.get('/api/operations/settings?keys='+keys)).status()).toBe(200);expect((await context.request.get('/api/operations/settings')).status()).toBe(403);}
    await page.goto('/operations/succession');expect(new URL(page.url()).pathname).toBe('/account');
   }finally{await context.close();}
  }
 }finally{await db.$disconnect();}
});
test('standalone employee development persists drafts and appears in read-only reports',async({page})=>{
 assertIsolatedEnvironment();const db=new PrismaClient();let employee;try{employee=await db.employee.create({data:{name:'Standalone browser employee '+Date.now(),branch:'MOT',jobTitle:'Ride Operator',department:'OPERATION'}});}finally{await db.$disconnect();}
 await page.addInitScript(()=>localStorage.setItem('bbLanguage','en'));await page.goto('/operations/development?create=1',{waitUntil:'networkidle'});
 await page.getByLabel('Create employee development without a succession plan',{exact:true}).check();await page.getByLabel('Development employee',{exact:true}).selectOption(employee.id);await page.getByLabel('Target position',{exact:true}).selectOption('Front Cashier');
 await page.reload({waitUntil:'networkidle'});await expect(page.getByLabel('Development employee',{exact:true})).toHaveValue(employee.id);await expect(page.getByText('Your unfinished draft was restored.',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Continue',exact:true}).click();await page.getByLabel(/Safe operation & incident response/).check();await page.getByRole('button',{name:'Continue',exact:true}).click();await page.getByRole('button',{name:'Use editable requirement proposal',exact:true}).click();await page.getByLabel('Objective target date',{exact:true}).fill('2027-03-01');await page.getByRole('button',{name:'Continue',exact:true}).click();await page.getByRole('button',{name:'Add assignment',exact:true}).click();await page.getByLabel('Assignment task',{exact:true}).fill('Prepare and demonstrate a supervised opening checklist');await page.getByRole('button',{name:'Continue',exact:true}).click();await page.getByRole('button',{name:'Confirm and activate',exact:true}).click();await expect(page.locator('[data-development-id]')).toBeVisible();const id=await page.locator('[data-development-id]').getAttribute('data-development-id');
 await page.goto('/operations/reports/performance?employeeId='+employee.id,{waitUntil:'networkidle'});await expect(page.getByText('Standalone development',{exact:true})).toBeVisible();const source=page.locator(`a[href="/operations/development?developmentId=${id}"]`);await source.click();await expect(page.locator('[data-development-id]')).toHaveAttribute('data-development-id',id);await page.reload({waitUntil:'networkidle'});await expect(page.locator('[data-development-id]')).toHaveAttribute('data-development-id',id);
 await page.locator('summary').filter({hasText:'Prepare and demonstrate a supervised opening checklist'}).click();await page.getByLabel('Assignment status',{exact:true}).selectOption('COMPLETED');await page.getByLabel('Progress or completion note',{exact:true}).fill('Manager witnessed and recorded the successful supervised opening checklist');await page.getByLabel('Update reason',{exact:true}).fill('Document the observed completion without a duplicate uploaded file');await page.getByRole('button',{name:'Save progress review',exact:true}).click();await expect(page.getByText('1/1 assignments completed',{exact:false})).toBeVisible();
 const verify=new PrismaClient();try{expect(await verify.opsSuccessionCandidate.count({where:{employeeId:employee.id}})).toBe(0);}finally{await verify.$disconnect();}
});
