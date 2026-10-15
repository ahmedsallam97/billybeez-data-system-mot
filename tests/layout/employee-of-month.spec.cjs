require('../e2e/account-fixtures').installLanguageFixture();
const {test,expect}=require('@playwright/test');
const fs=require('node:fs'),path=require('node:path');
const folder=path.resolve('docs/audit-evidence/employee-of-month');fs.mkdirSync(folder,{recursive:true});
test('real October data, all-month counts, breakdowns and desktop/tablet RTL/LTR themes',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 for(const language of ['en','ar'])for(const [size,width,height] of [['desktop',1920,1080],['laptop',1366,768],['tablet',820,1180]].filter(([,width])=>process.env.OPS_E2E_DESKTOP_ONLY!=='1'||width>=1366))for(const theme of ['classic','red','blue','orange']){
  await page.setViewportSize({width,height});await page.addInitScript(({language,theme})=>{localStorage.setItem('bbLanguage',language);localStorage.setItem('bbTheme',theme);},{language,theme});
  await page.goto('/operations/employee-of-the-month?year=2026&month=10',{waitUntil:'networkidle'});
  const root=page.locator('[data-eotm-page]');await expect(root).toBeVisible();await expect(page.locator('h1').filter({hasText:language==='ar'?'موظف الشهر':'Employee of the Month'})).toHaveCount(1);
  await expect(root).not.toContainText('There are no appraisals in this month');await expect(root.locator('tbody tr')).toHaveCount(13);await expect(root).toContainText(language==='ar'?'مكونات المعادلة ناقصة':'Missing weighted components');
  expect(await root.evaluate(el=>el.scrollWidth<=el.clientWidth+2)).toBe(true);
  await expect(root.locator('button').filter({hasText:language==='ar'?'حساب نسخة المرشحين':'Calculate candidate snapshot'})).toBeDisabled();
  if(theme==='classic'||size==='laptop'&&language==='en'){await page.screenshot({path:path.join(folder,`october-${language}-${size}-${theme}.png`)});await root.locator('table').first().scrollIntoViewIfNeeded();await page.screenshot({path:path.join(folder,`results-${language}-${size}-${theme}.png`)});}
  await root.getByRole('button',{name:language==='ar'?'التفاصيل':'Breakdown',exact:true}).first().click();await expect(page.getByRole('dialog')).toContainText('2026-10');await expect(page.getByRole('dialog')).toContainText(language==='ar'?'المكونات':'components');
  if(theme==='classic'&&size==='laptop')await page.screenshot({path:path.join(folder,`breakdown-${language}.png`)});
  await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).toHaveCount(0);
 }
 await page.setViewportSize({width:1366,height:768});await page.addInitScript(()=>localStorage.setItem('bbLanguage','en'));await page.goto('/operations/employee-of-the-month?year=2026&month=10',{waitUntil:'networkidle'});
 await page.getByText('All recorded months and day counts',{exact:true}).click();await expect(page.getByText('2026-09',{exact:true})).toBeVisible();await expect(page.getByText('2026-10',{exact:true})).toBeVisible();await page.getByRole('button').filter({has:page.getByText('2026-09',{exact:true})}).click();await expect(page).toHaveURL(/year=2026.*month=9/);await expect(page.locator('[data-eotm-page] tbody tr')).toHaveCount(13);await page.screenshot({path:path.join(folder,'september-en-laptop.png')});await page.reload({waitUntil:'networkidle'});await expect(page.getByLabel('Month',{exact:true})).toHaveValue('9');
 expect(errors).toEqual([]);
});
test('preview-confirm refresh is idempotent, filters persist, and missing data stays distinct from service errors',async({page})=>{
 await page.addInitScript(()=>localStorage.setItem('bbLanguage','en'));await page.setViewportSize({width:1366,height:768});await page.goto('/operations/employee-of-the-month?year=2026&month=10',{waitUntil:'networkidle'});
 await page.getByRole('button',{name:'Preview recalculation',exact:true}).click();const dialog=page.getByRole('dialog');await expect(dialog.locator('tbody tr')).toHaveCount(13);await expect(dialog.getByRole('button',{name:'Confirm draft recalculation',exact:true})).toBeDisabled();await dialog.getByLabel('Recalculation reason',{exact:true}).fill('Review the daily-derived draft summaries without changing configured weights');await dialog.getByRole('button',{name:'Confirm draft recalculation',exact:true}).click();await expect(dialog).toHaveCount(0);await expect(page.getByRole('status').filter({hasText:'Monthly summaries refreshed'})).toBeVisible();
 await page.getByLabel('Status',{exact:true}).selectOption('ELIGIBLE');await expect(page.getByText('No results match this status filter.',{exact:true})).toBeVisible();await page.reload({waitUntil:'networkidle'});await expect(page.getByLabel('Status',{exact:true})).toHaveValue('ELIGIBLE');await page.getByRole('button',{name:'Reset status',exact:true}).click();await expect(page.locator('[data-eotm-page] tbody tr')).toHaveCount(13);
 await page.goto('/operations/employee-of-the-month?year=2025&month=1',{waitUntil:'networkidle'});await expect(page.getByText('No daily evaluations exist for this month.',{exact:true}).first()).toBeVisible();await page.screenshot({path:path.join(folder,'empty-en-laptop.png')});
 await page.route('**/api/operations/performance?*',route=>route.fulfill({status:500,contentType:'application/json',body:JSON.stringify({error:'Isolated calculation service failure'})}));await page.goto('/operations/employee-of-the-month?year=2026&month=10');await expect(page.locator('[data-eotm-page]').getByRole('alert')).toContainText('Isolated calculation service failure');await page.screenshot({path:path.join(folder,'error-en-laptop.png')});await page.unroute('**/api/operations/performance?*');await page.getByRole('button',{name:'Retry',exact:true}).click();await expect(page.locator('[data-eotm-page] tbody tr')).toHaveCount(13);
});
