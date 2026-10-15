const {test,expect}=require('@playwright/test');
const fs=require('node:fs'),path=require('node:path');
for(const language of ['en','ar'])test(`desktop login labels and recoverable network error: ${language}`,async({browser})=>{
 const context=await browser.newContext({storageState:{cookies:[],origins:[]},viewport:{width:1366,height:768}});
 try{
  const page=await context.newPage();await page.addInitScript(value=>localStorage.setItem('bbLanguage',value),language);
  await page.goto('http://127.0.0.1:3018/login',{waitUntil:'networkidle'});
  await expect(page.locator('main h1')).toHaveCount(1);
  const username=page.getByLabel(language==='ar'?'اسم المستخدم':'Username',{exact:true});
  const password=page.getByLabel(language==='ar'?'كلمة المرور':'Password',{exact:true});
  await username.fill('desktop-network-check');await password.fill('invalid-desktop-password');
  await page.route('**/api/auth/login',route=>route.abort('failed'));
  const submit=page.locator('form button[type=submit]');await submit.click();
  await expect(page.getByRole('alert')).toBeVisible();await expect(submit).toBeEnabled();
  await expect(username).toHaveValue('desktop-network-check');await expect(password).toHaveValue('invalid-desktop-password');
  await page.unroute('**/api/auth/login');await submit.click();await expect(page.getByRole('alert')).toBeVisible();await expect(submit).toBeEnabled();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2)).toBe(true);
  const folder=path.resolve('tmp/desktop-audit/states');fs.mkdirSync(folder,{recursive:true});await page.screenshot({path:path.join(folder,`login-error-${language}.png`)});
 }finally{await context.close();}
});
