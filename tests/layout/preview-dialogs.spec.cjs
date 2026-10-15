require('../e2e/account-fixtures').installLanguageFixture();
const {test,expect}=require('@playwright/test');
const path=require('node:path');
for(const language of ['en','ar'])for(const [size,width,height] of [['desktop',1920,1080],['laptop',1366,768],['tablet',820,1180],['mobile',390,844]].filter(([,width])=>process.env.OPS_E2E_DESKTOP_ONLY!=='1'||width>=1366)){
 test(`${language} ${size}: print preview controls stay reachable`,async({page})=>{
  await page.setViewportSize({width,height});
  await page.addInitScript(lang=>localStorage.setItem('bbLanguage',lang),language);
  await page.goto('/operations?tab=performance&section=hall',{waitUntil:'networkidle'});
  for(const [en,ar] of [['View winner design','عرض تصميم الفائز'],['View Hall design','عرض تصميم القاعة']]){
   await page.getByRole('button',{name:language==='ar'?ar:en,exact:true}).click();
   const dialog=page.getByRole('dialog');await expect(dialog).toBeVisible();
   await expect(dialog.locator('.recognition-artwork')).toBeVisible();
   await controlsFit(dialog);
   const canvas=dialog.getByRole('region');await expect(canvas).toBeVisible();
   await expect(dialog.getByRole('button',{name:language==='ar'?'ملاءمة المعاينة':'Fit preview',exact:true})).toHaveAttribute('aria-pressed','true');
   await expect.poll(()=>canvas.evaluate(el=>el.scrollWidth-el.clientWidth)).toBeLessThan(3);
   await dialog.getByRole('button',{name:language==='ar'?'الحجم الفعلي':'Actual size',exact:true}).click();
   // Panning the fixed-size printable artwork must not move the toolbar.
   await canvas.evaluate(el=>el.scrollLeft=el.scrollWidth);await controlsFit(dialog);
   await dialog.getByRole('button',{name:language==='ar'?'ملاءمة المعاينة':'Fit preview',exact:true}).click();
   await page.screenshot({path:path.resolve('tmp/component-layout-evidence',`${language}-${size}-${en==='View winner design'?'award':'hall'}-dialog.png`)});
   await dialog.getByRole('button',{name:language==='ar'?'إغلاق':'Close',exact:true}).click();
  }
  await page.goto('/operations?tab=employees',{waitUntil:'networkidle'});
  await page.getByRole('button',{name:'Print Profile',exact:true}).click();
  const profile=page.getByRole('dialog',{name:'Employee profile print preview'});
  await expect(profile.locator('iframe')).toBeVisible({timeout:60000});
  await controlsFit(profile);
  await page.screenshot({path:path.resolve('tmp/component-layout-evidence',`${language}-${size}-profile-preview.png`)});
  await profile.getByRole('button',{name:'Close preview',exact:true}).click();await expect(profile).toHaveCount(0);
 });
}
async function controlsFit(dialog){
 const bad=await dialog.evaluate(el=>[...el.querySelectorAll('button,a.button-link')].filter(button=>{const r=button.getBoundingClientRect();return r.left<0||r.right>innerWidth+1||button.scrollWidth>button.clientWidth+2||parseFloat(getComputedStyle(button).fontSize)<12;}).map(button=>button.textContent));
 expect(bad).toEqual([]);
}
