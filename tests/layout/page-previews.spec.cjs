const {openDisclosure}=require("./disclosures.cjs");
require('../e2e/account-fixtures').installLanguageFixture();
const {test,expect}=require('@playwright/test');
const fs=require('node:fs'),path=require('node:path');
const out=path.resolve('tmp/live-editor-audit');fs.mkdirSync(out,{recursive:true});
for(const language of ['en','ar'])for(const [name,width,height]of [['desktop',1920,1080],['laptop',1366,768]]){
 test(`${language} ${name}: only three distinct template editors, independent template routes, usable controls before optional previews`,async({page})=>{
  await page.setViewportSize({width,height});await page.addInitScript(lang=>localStorage.setItem('bbLanguage',lang),language);
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/opmanager/settings?category=live-editors',{waitUntil:'networkidle'});
  const nav=page.getByRole('navigation',{name:language==='ar'?'أقسام الإعدادات':'Settings categories'});await expect(page.getByRole('tablist',{name:language==='ar'?'القوالب المدعومة':'Supported templates'})).toHaveCount(0);
  for(const [id,en,ar,selector]of [['roster','Roster','الروستر','.daily-operations-poster'],['monthly','Employee of the Month','موظف الشهر','[data-recognition-kind="monthly"]'],['hall','Hall of Fame','قاعة المتميزين','[data-recognition-kind="hall"]']]){
   await nav.locator(`a[href="/opmanager/settings/live-editors/${id}"]`).click();await openDisclosure(page,id==='roster'?(language==='ar'?'المعاينة المباشرة للروستر':'Roster live preview'):(language==='ar'?'المعاينة المباشرة للجائزة':'Award live preview'));
   const preview=page.getByRole('complementary',{name:id==='roster'?(language==='ar'?'المعاينة المباشرة للروستر':'Roster live preview'):(language==='ar'?'المعاينة المباشرة للجائزة':'Award live preview')});await expect(preview.locator(selector)).toBeVisible();
   const controls=page.locator('[class*="TemplateEditor_controls"]').filter({visible:true}).first();const [p,c]=await Promise.all([preview.boundingBox(),controls.boundingBox()]);expect(c.y+c.height).toBeLessThanOrEqual(p.y+2);expect(Math.abs(p.width-c.width)).toBeLessThan(4);
   await expect(page.getByLabel('Preview artwork',{exact:true})).toHaveCount(0);await expect(page.locator('iframe')).toHaveCount(0);
   for(const section of await controls.getByRole('tab').all()){await section.click();await fit(page);}
   await preview.getByRole('button',{name:language==='ar'?'توسيع المعاينة':'Expand preview',exact:true}).click();await expect(page.getByRole('dialog').locator(selector)).toBeVisible();await fit(page);await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).toHaveCount(0);
   await page.screenshot({path:path.join(out,`${language}-${name}-${id}.png`),fullPage:true});
  }
  await page.goto('/operations?tab=schedule',{waitUntil:'networkidle'});await expect(page.getByRole('button',{name:language==='ar'?'تنزيل قالب الاستيراد':'Download Import Template',exact:true})).toBeVisible();await fit(page);
  await page.screenshot({path:path.join(out,`${language}-${name}-schedule.png`),fullPage:true});expect(errors).toEqual([]);
 });
}
async function fit(page){
 const result=await page.evaluate(()=>{const root=document.querySelector('dialog[open]')||document.querySelector('main');return{overflow:root.scrollWidth>root.clientWidth+2,bad:[...root.querySelectorAll('button,input:not([type=hidden]),select,textarea')].filter(el=>{const r=el.getBoundingClientRect();if(!r.width||!r.height||el.closest('[hidden],.record-table-scroll,.schedule-grid-scroll,[inert],.recognition-artwork,[class*=scroll]'))return false;return r.left< -2||r.right>innerWidth+2||(el.tagName==='BUTTON'&&el.scrollWidth>el.clientWidth+3);}).map(el=>el.getAttribute('aria-label')||el.textContent.slice(0,80))};});expect(result.overflow).toBe(false);expect(result.bad).toEqual([]);
}
test('generic preview route and choices are removed; all actual Operations modules still load',async({page,request})=>{
 expect((await request.get('/opmanager/preview?view=roster')).status()).toBe(404);
 for(const category of ['dashboard','navigation','roster','rules','master','safety']){await page.goto('/opmanager/settings?category='+category,{waitUntil:'networkidle'});await expect(page.locator('iframe')).toHaveCount(0);await expect(page.getByRole('button',{name:/Open preview|فتح المعاينة/,exact:true})).toHaveCount(0);}
 for(const tab of ['roster','schedule','daily','evaluation','employees','trips','birthdays','offers','stock','time','performance&section=appraisal','performance&section=eotm','performance&section=hall','performance&section=succession','performance&section=reports']){const response=await page.goto('/operations?tab='+tab+'&date=2026-10-07',{waitUntil:'networkidle'});expect(response.status(),tab).toBe(200);await expect(page.locator('main')).toBeVisible();}
});
