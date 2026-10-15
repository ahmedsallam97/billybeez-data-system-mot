require('../e2e/account-fixtures').installLanguageFixture();
const {test,expect}=require('@playwright/test');
const {PDFDocument}=require('pdf-lib');
const fs=require('node:fs');
const path=require('node:path');
for(const language of ['en','ar'])for(const [size,width,height] of [['desktop',1920,1080],['laptop',1366,768],['tablet',820,1180],['mobile',390,844]].filter(([,width])=>process.env.OPS_E2E_DESKTOP_ONLY!=='1'||width>=1366)){
 test(`${language} ${size}: settings sections and remaining dashboard editors`,async({page})=>{
  await page.setViewportSize({width,height});await page.addInitScript(lang=>localStorage.setItem('bbLanguage',lang),language);
  for(const category of ['navigation','appearance','attention']){
   await page.goto('/opmanager/settings?category='+category,{waitUntil:'networkidle'});
   await expect(page.getByRole('navigation',{name:language==='ar'?'أقسام الإعدادات':'Settings categories'})).toBeVisible();
   expect(await page.locator('main').evaluate(main=>[...main.querySelectorAll('button,input,select')].filter(el=>{const r=el.getBoundingClientRect();return r.width&&r.height&&(r.left<0||r.right>innerWidth+1||el.tagName==='BUTTON'&&el.scrollWidth>el.clientWidth+2);}).map(el=>el.textContent))).toEqual([]);
   await expect(page.getByRole('button',{name:language==='ar'?'فتح المعاينة':'Open preview',exact:true})).toHaveCount(0);
  }
 });
}
test('roster still exports as one unclipped A4 page',async({page})=>{
 await page.goto('/operations/daily-preview?date=2026-09-29',{waitUntil:'networkidle'});
 await expect(page.locator('.daily-operations-poster')).toBeVisible();await page.evaluate(()=>document.fonts.ready);
 await page.evaluate(()=>{document.body.dataset.dailyPreviewPrint='true';});await page.emulateMedia({media:'print'});
 const geometry=await page.locator('.daily-operations-poster').evaluate(el=>({width:el.getBoundingClientRect().width,scrollWidth:el.scrollWidth}));expect(geometry.scrollWidth).toBeLessThanOrEqual(Math.ceil(geometry.width)+1);
 const bytes=await page.pdf({preferCSSPageSize:true,printBackground:true});const pdf=await PDFDocument.load(bytes);
 expect(pdf.getPageCount()).toBe(1);expect(pdf.getPage(0).getWidth()).toBeCloseTo(595.28,0);expect(pdf.getPage(0).getHeight()).toBeCloseTo(841.89,0);
 fs.writeFileSync(path.resolve('tmp/component-layout-evidence/roster-a4.pdf'),bytes);
});
