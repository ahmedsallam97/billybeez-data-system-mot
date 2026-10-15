// Focused active-branch smoke; uses existing supervised-pilot config and synthetic fixture only.
const {test,expect}=require('@playwright/test'),fs=require('node:fs'),path=require('node:path');
const {PAGES}=require('../../lib/operations/page-routes');
const REMOVED=[
  "/api/business-day",
  "/api/categories",
  "/api/child-names",
  "/api/customers",
  "/api/dashboard",
  "/api/devices",
  "/api/front-dashboard",
  "/api/loyalty/rewards",
  "/api/loyalty",
  "/api/orders/TEST-NONEXISTENT/archive",
  "/api/orders/TEST-NONEXISTENT/deliver",
  "/api/orders/TEST-NONEXISTENT/geidea",
  "/api/orders/TEST-NONEXISTENT/items",
  "/api/orders/TEST-NONEXISTENT/left",
  "/api/orders/TEST-NONEXISTENT/merge",
  "/api/orders/TEST-NONEXISTENT/pay",
  "/api/orders/TEST-NONEXISTENT",
  "/api/orders/TEST-NONEXISTENT/system",
  "/api/orders/TEST-NONEXISTENT/unarchive",
  "/api/orders",
  "/api/payment-providers",
  "/api/print-jobs/TEST-NONEXISTENT",
  "/api/print-jobs",
  "/api/products",
  "/api/reports/daily",
  "/api/reports/payments",
  "/api/reports/products",
  "/cashier",
  "/data",
  "/front",
  "/invoice/TEST-NONEXISTENT",
  "/kitchen-cashier",
  "/kitchen-ticket/TEST-NONEXISTENT",
  "/kitchen",
  "/manager"
];
function fixture(){if(process.env.PILOT_TEST_BRANCH!=='TEST'||process.env.PILOT_TEST_DATE!=='2098-06-15')throw Error('Synthetic TEST / 2098-06-15 pilot required');const file=process.env.PILOT_SANITIZED_FIXTURE_FILE||path.join(path.dirname(path.dirname(path.resolve(process.env.PILOT_ACCOUNTS_FILE))),'sanitized-fixture.json');const value=JSON.parse(fs.readFileSync(file));if(value.kind!=='SYNTHETIC_SANITIZED_PILOT'||value.source!=='EMPTY_COMMITTED_SCHEMA'||value.workplaceRecordsCopied!==0||value.workplaceConfigurationCopied!==0)throw Error('Verified synthetic fixture descriptor required');return value;}
async function login(browser,baseURL,httpCredentials,ignoreHTTPSErrors,index=0,viewport={width:1440,height:900}){fixture();const account=JSON.parse(fs.readFileSync(process.env.PILOT_ACCOUNTS_FILE))[index];const context=await browser.newContext({baseURL,httpCredentials,ignoreHTTPSErrors,viewport});const page=await context.newPage();await page.goto('/login');await page.locator('input[autocomplete="username"]').fill(account.username);await page.locator('input[autocomplete="current-password"]').fill(account.password);await page.locator('button[type="submit"]').click();await expect(page).not.toHaveURL(/\/login(?:\?|$)/);return {context,page};}
test('removed legacy pages and all dedicated APIs fail closed for anonymous and manager requests',async({browser,baseURL,httpCredentials,ignoreHTTPSErrors})=>{test.setTimeout(180000);const anon=await browser.newContext({baseURL,httpCredentials,ignoreHTTPSErrors}),{context}=await login(browser,baseURL,httpCredentials,ignoreHTTPSErrors);try{for(const request of [anon.request,context.request])for(const url of REMOVED){expect((await request.get(url,{maxRedirects:0})).status(),url+' GET').toBe(404);if(url.startsWith('/api/'))for(const method of ['post','patch'])expect((await request[method](url,{data:{action:'TEST-REMOVED-ROUTE-PROBE'},maxRedirects:0})).status(),url+' '+method).toBe(404);}}finally{await anon.close();await context.close();}});
test('every enabled module retains direct URL access and restricted grants still reject related APIs and pages',async({browser,baseURL,httpCredentials,ignoreHTTPSErrors})=>{test.setTimeout(120000);const {context}=await login(browser,baseURL,httpCredentials,ignoreHTTPSErrors),restricted=await login(browser,baseURL,httpCredentials,ignoreHTTPSErrors,2);try{for(const [id,row]of Object.entries(PAGES)){const url=row[0]+(id==='schedule'?'?branch=TEST&year=2098&month=6':id==='performance'||id==='eotm'||id==='reports'?'?branch=TEST&year=2098&month=6':'?branch=TEST&date=2098-06-15');const response=await context.request.get(url,{maxRedirects:5});expect(response.status(),id).toBe(200);const destination=new URL(response.url()).pathname;expect(destination===row[0]||destination.startsWith(row[0]+"/"),id+" canonical destination").toBe(true);}expect((await restricted.context.request.get('/api/operations/reports?branch=TEST&workDate=2098-06-15')).status()).toBe(403);expect((await restricted.context.request.post('/api/operations/daily',{data:{action:'previewRotation',branch:'TEST',date:'2098-06-15'}})).status()).toBe(403);for(const url of ['/operations/reports/operational']){const response=await restricted.context.request.get(url,{maxRedirects:0});expect(response.status(),url).toBe(307);expect(response.headers().location).toBe('/account?denied=1');}expect((await restricted.context.request.get('/api/operations/employees')).ok()).toBe(true);}finally{await context.close();await restricted.context.close();}});
for(const [width,height]of [[1366,768],[1440,900],[1920,1080]])for(const language of ['en','ar'])test('active desktop shell '+language+' '+width,async({browser,baseURL,httpCredentials,ignoreHTTPSErrors})=>{const {context,page}=await login(browser,baseURL,httpCredentials,ignoreHTTPSErrors,0,{width,height});try{await page.addInitScript(language=>{localStorage.setItem('bbLanguage',language);localStorage.setItem('bbTheme','classic');},language);for(const [url,active]of [['/opmanager','/opmanager'],['/operations/daily-preview?branch=TEST&date=2098-06-15','/operations/daily'],['/opmanager/settings/roster','/opmanager/settings']]){await page.goto(url,{waitUntil:'networkidle'});await expect(page.locator('html')).toHaveAttribute('dir',language==='ar'?'rtl':'ltr');await expect(page.locator('#operations-navigation a[aria-current="page"]')).toHaveAttribute('href',active);await expect(page.locator('a[href="/front"],a[href="/data"],a[href="/kitchen"],a[href="/manager"]')).toHaveCount(0);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);}const folder=path.resolve(process.env.PILOT_TEST_EVIDENCE);fs.mkdirSync(folder,{recursive:true});await page.screenshot({path:path.join(folder,'active-separation-'+language+'-'+width+'.png')});}finally{await context.close();}});

