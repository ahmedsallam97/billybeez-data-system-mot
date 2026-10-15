require('../e2e/account-fixtures').installLanguageFixture();
const {test,expect}=require('@playwright/test');
const {PrismaClient}=require('@prisma/client');
const {createHmac,randomBytes}=require('node:crypto');
const {assertIsolatedEnvironment}=require('../e2e/isolation');
function auth(id){const now=Math.floor(Date.now()/1000),token=Buffer.from(JSON.stringify({sub:id,iat:now,exp:now+3600,jti:randomBytes(16).toString('hex'),v:1})).toString('base64url');return{cookies:[{name:process.env.AUTH_COOKIE_NAME,value:token+'.'+createHmac('sha256',process.env.SESSION_SECRET).update(token).digest('base64url'),domain:'127.0.0.1',path:'/',expires:now+3600,httpOnly:true,secure:false,sameSite:'Strict'}],origins:[]};}
test('report upload API validates bytes, authenticates downloads and preserves attached evidence',async({playwright})=>{
  assertIsolatedEnvironment();const db=new PrismaClient();let request,anonymous;
  try{
    const user=await db.user.create({data:{name:'Upload API reviewer',username:'upload-'+Date.now(),password:'unusable-test-only',role:'ADMIN'}});
    await require('../e2e/account-fixtures').registerAccountFixture(db,user);
    request=await playwright.request.newContext({baseURL:'http://127.0.0.1:3018',storageState:auth(user.id)});anonymous=await playwright.request.newContext({baseURL:'http://127.0.0.1:3018',storageState:{cookies:[],origins:[]}});
    const trip=await db.opsDailyTrip.create({data:{branch:'MOT',workDate:'2098-03-04',name:'Protected upload test',startTime:'10:00',endTime:'12:00'}});
    const created=await request.post('/api/operations/reports',{data:{action:'create',reportType:'TRIP',sourceId:trip.id,reason:'Prepare protected upload regression',draft:{}}});expect(created.ok(),await created.text()).toBeTruthy();const report=(await created.json()).report;
    const bytes=Buffer.from('%PDF-1.4\nProtected report evidence\n%%EOF');
    const result=await request.post('/api/operations/reports/files',{multipart:{reportId:report.id,file:{name:'evidence.pdf',mimeType:'application/pdf',buffer:bytes}}});expect(result.ok(),await result.text()).toBeTruthy();const file=(await result.json()).file;
    const download=await request.get(file.reference);expect(download.ok()).toBeTruthy();expect(await download.body()).toEqual(bytes);expect(download.headers()['cache-control']).toBe('private, no-store');
    expect((await anonymous.get(file.reference)).status()).toBe(401);
    expect((await request.post('/api/operations/reports/files',{multipart:{reportId:report.id,file:{name:'spoof.pdf',mimeType:'application/pdf',buffer:Buffer.from('<html>spoof</html>')}}})).status()).toBe(422);
    const save=await request.post('/api/operations/reports',{data:{action:'saveDraft',id:report.id,expectedRevision:report.revision,reason:'Attach protected uploaded evidence',draft:{...report.draft,attachments:[file]}}});expect(save.ok(),await save.text()).toBeTruthy();expect((await save.json()).report.draft.attachments[0].id).toBe(file.id);
    const otherTrip=await db.opsDailyTrip.create({data:{branch:'MOT',workDate:'2098-03-05',name:'Other upload source'}});
    const other=await request.post('/api/operations/reports',{data:{action:'create',reportType:'TRIP',sourceId:otherTrip.id,reason:'Check file ownership enforcement',draft:{attachments:[file]}}});expect(other.status()).toBe(403);
  }finally{await request?.dispose();await anonymous?.dispose();await db.$disconnect();}
});
for(const language of ['en','ar'])for(const [width,height] of [[1920,1080],[1366,768]])test(`${language} ${width}: independent report uploads and settings rubrics remain usable`,async({page})=>{
  await page.setViewportSize({width,height});await page.addInitScript(lang=>localStorage.setItem('bbLanguage',lang),language);const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/operations/reports/operational?year=2098&month=3',{waitUntil:'networkidle'});
  await expect(page.locator('main h1')).toHaveCount(1);await expect(page.locator('#recommendations')).toHaveCount(0);
  await page.getByRole('button').filter({hasText:'Protected upload test'}).click();
  expect(await page.locator('input[type=file]').count()).toBeGreaterThanOrEqual(1);
  const input=page.locator('input[type=file]').last();await input.setInputFiles({name:`browser-${language}-${width}.pdf`,mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.4\nBrowser uploaded evidence\n%%EOF')});
  await expect(page.getByRole('link',{name:`browser-${language}-${width}.pdf`,exact:true})).toBeVisible();
  await page.getByRole('button',{name:language==='ar'?'حفظ المسودة':'Save draft',exact:true}).click();await expect(page.getByRole('status').filter({hasText:language==='ar'?'تم حفظ سير عمل التقرير':'Report workflow saved'})).toBeVisible();
  await page.goto('/opmanager/settings?category=performance-settings&section=suitability',{waitUntil:'networkidle'});await expect(page.getByText(language==='ar'?'قواعد درجات المصدر':'Source scoring rubric',{exact:true}).first()).toBeVisible();
  await page.screenshot({path:`tmp/mandatory-${language}-${width}.png`,fullPage:true});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2)).toBe(true);expect(errors).toEqual([]);
});
