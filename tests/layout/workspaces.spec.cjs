const {openDisclosure}=require("./disclosures.cjs");
require('../e2e/account-fixtures').installLanguageFixture();
const {test,expect}=require('@playwright/test');
const fs=require('node:fs');
const path=require('node:path');
const out=path.resolve('tmp/component-layout-evidence');fs.mkdirSync(out,{recursive:true});
const sizes=[['desktop',1920,1080],['laptop',1366,768],['tablet',820,1180],['mobile',390,844]].filter(([,width])=>process.env.OPS_E2E_DESKTOP_ONLY!=='1'||width>=1366);
for(const language of ['en','ar'])for(const [size,width,height]of sizes){
 test(`${language} ${size}: editors and operational component geometry`,async({page})=>{
  await page.setViewportSize({width,height});
  await page.addInitScript(lang=>localStorage.setItem('bbLanguage',lang),language);
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  const results=[];
  for(const category of ['template','recognition','dashboard','roster','master','rules','safety']){
   await page.goto('/opmanager/settings?category='+category,{waitUntil:'networkidle'});
   await expect(page.locator('main')).toBeVisible();
   if(['template','recognition'].includes(category)){
    const editor=page.locator('[class*="TemplateEditor"][class*="controls"]').filter({visible:true}).first();
    const label=category==='template'?(language==='ar'?'المعاينة المباشرة للروستر':'Roster live preview'):(language==='ar'?'المعاينة المباشرة للجائزة':'Award live preview');
    await openDisclosure(page,label);const preview=page.getByRole('complementary',{name:label,exact:true});
    await expect(editor.getByRole('tablist')).toBeVisible();
    await expect(preview.locator('.daily-operations-poster,.recognition-artwork')).toBeVisible();
    await page.evaluate(()=>document.fonts.ready);
    const e=await editor.boundingBox(),p=await preview.boundingBox();
    expect(Math.abs(e.width-p.width)).toBeLessThan(4);
    await expect.poll(async()=>{const [a,b]=await Promise.all([editor.boundingBox(),preview.boundingBox()]);return a.y+a.height<=b.y+2;}).toBe(true);
    expect(await editor.evaluate(el=>el.scrollHeight<=el.clientHeight+2)).toBe(true);
    const title=category==='template'?editor.getByLabel(language==='ar'?'العنوان':'Title',{exact:true}):null;
    const originalTitle=title?await title.inputValue():null;
    if(title)await title.fill(originalTitle+' · layout check');
    const tabs=editor.getByRole('tab');
    for(let i=0;i<await tabs.count();i++){await tabs.nth(i).click();await expect(editor.getByRole('tabpanel')).toBeVisible();await audit(page,`${category}-tab-${i}`,results);
     if(category==='recognition'&&i===2){
      const photo=editor.getByRole('complementary',{name:language==='ar'?'معاينة قص الصورة':'Photo crop preview',exact:true});
      await photo.getByRole('button',{name:language==='ar'?'توسيع المعاينة':'Expand preview',exact:true}).click();await expect(page.getByRole('dialog')).toBeVisible();await audit(page,'photo-expanded',results);await page.keyboard.press('Escape');
     }}
    await tabs.nth(category==='recognition'?1:0).click();
    if(title){await expect(title).toHaveValue(originalTitle+' · layout check');await title.fill(originalTitle);}
    const expand=preview.getByRole('button',{name:language==='ar'?'توسيع المعاينة':'Expand preview',exact:true});
    await expand.click();const dialog=page.getByRole('dialog');await expect(dialog).toBeVisible();
    expect((await dialog.boundingBox()).width).toBeGreaterThan(width-45);
    await audit(page,`${category}-expanded`,results);
    await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);await expect(expand).toBeFocused();await expect(preview.locator('.daily-operations-poster,.recognition-artwork')).toBeVisible();
   }
   await audit(page,category,results);
   if(['template','recognition'].includes(category)){await page.locator('[data-preview-panel]').filter({visible:true}).last().scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,`${language}-${size}-${category}.png`),fullPage:true});}
  }
  for(const tab of ['employees','schedule','daily','evaluation','roster','time','performance','stock','trips','birthdays','offers','performance&section=succession','performance&section=hall','performance&section=reports']){
   await page.goto('/operations?tab='+tab+'&date=2026-09-20&year=2026&month=10',{waitUntil:'networkidle'});await audit(page,tab,results);
   if(tab==='daily'){await page.locator('main').evaluate(el=>el.scrollTop=0);await page.screenshot({path:path.join(out,`${language}-${size}-daily.png`)});}
  }
  fs.writeFileSync(path.join(out,`${language}-${size}.json`),JSON.stringify({width,height,language,results,errors},null,2));
  expect(errors).toEqual([]);
 });
}
async function audit(page,name,results){
 const findings=await page.evaluate(()=>{
  const main=document.querySelector('main');const root=document.querySelector('dialog[open]')||main;
  const visible=el=>{const r=el.getBoundingClientRect();return r.width&&r.height&&getComputedStyle(el).visibility!=='hidden'&&!el.closest('[hidden]');};
  const controls=[...root.querySelectorAll('button,input:not([type=hidden]),select,textarea,[role=tab],.button-link')].filter(visible);
  const bad=controls.filter(el=>{
   if(el.closest('.record-table-scroll,.schedule-grid-scroll,.employee-table,[role=region],.recognition-artwork,[inert],[class*=scroll]'))return false;
   const r=el.getBoundingClientRect();return r.left < -2 || r.right > innerWidth+2 || (r.width<24 && !['checkbox','radio'].includes(el.type)) || (el.tagName==='BUTTON' && el.scrollWidth>el.clientWidth+3);
  }).map(el=>({tag:el.tagName,text:(el.textContent||el.getAttribute('aria-label')||'').trim().slice(0,75),width:Math.round(el.getBoundingClientRect().width),class:el.className}));
  return {documentOverflow:document.documentElement.scrollWidth>innerWidth+2,mainOverflow:main.scrollWidth>main.clientWidth+2,bad};
 });results.push({name,...findings});
 expect.soft(findings.documentOverflow,`${name}: document overflow`).toBe(false);
 expect.soft(findings.mainOverflow,`${name}: workspace overflow`).toBe(false);
 expect.soft(findings.bad,`${name}: cropped or squeezed controls`).toEqual([]);
}
