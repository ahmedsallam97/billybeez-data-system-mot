require('../e2e/account-fixtures').installLanguageFixture();
const {test,expect}=require('@playwright/test');
const {PAGES}=require('../../lib/operations/page-routes');
const {SETTINGS_PAGES,PERFORMANCE_SECTIONS,TEMPLATE_SECTIONS}=require('../../lib/operations/settings-routes');
for(const language of ['en','ar'])test(`current page headers and breadcrumbs follow interface language: ${language}`,async({page})=>{
  test.setTimeout(240000);await page.setViewportSize({width:1366,height:768});
  await page.addInitScript(value=>localStorage.setItem('bbLanguage',value),language);
  const routes=[...Object.values(PAGES).map(row=>row[0]),'/operations/daily-preview','/account',...SETTINGS_PAGES.map(([id])=>'/opmanager/settings/'+id),...PERFORMANCE_SECTIONS.map(([id])=>'/opmanager/settings/performance-settings/'+id),...TEMPLATE_SECTIONS.map(([id])=>'/opmanager/settings/live-editors/'+id)];
  for(const url of [...new Set(routes)]){
    await page.goto(url+'?date=2026-10-11',{waitUntil:'networkidle'});
    const title=page.locator('[data-page-header] h1');await expect(title,url).toHaveCount(1);
    if(language==='ar')await expect(title,url).toContainText(/[\u0600-\u06ff]/);
    else expect(await title.innerText(),url).not.toMatch(/[\u0600-\u06ff]/);
    const breadcrumb=page.locator('.ui-breadcrumb [aria-current=page]');
    if(await breadcrumb.count())await expect(breadcrumb,url).toHaveText(await title.innerText());
    expect(await page.locator('html').getAttribute('dir')).toBe(language==='ar'?'rtl':'ltr');
  }
});
test('language switching translates employee forms while preserving enum values and roster artwork',async({page})=>{
  await page.setViewportSize({width:1440,height:900});await page.addInitScript(()=>localStorage.setItem('bbLanguage','en'));
  const result=await page.request.get('/api/operations/employees').then(r=>r.json());
  const employee=(result.employees||result.data||[]).find(row=>row.active);expect(employee).toBeTruthy();
  await page.goto('/operations/employees?employeeId='+employee.id,{waitUntil:'networkidle'});
  await page.getByRole('button',{name:'Training & Qualifications',exact:true}).click();
  const form=page.locator('form').filter({has:page.getByRole('button',{name:'Add training',exact:true})});
  await form.getByLabel('Training name',{exact:true}).fill('Preserved language draft');
  await form.getByLabel('Record status',{exact:true}).selectOption('IN_PROGRESS');
  await page.getByRole('button',{name:'Switch language',exact:true}).first().click();
  await expect(page.locator('html')).toHaveAttribute('dir','rtl');
  await expect(form.getByLabel('اسم التدريب',{exact:true})).toHaveValue('Preserved language draft');
  await expect(form.getByLabel('حالة السجل',{exact:true})).toHaveValue('IN_PROGRESS');
  await expect(form.locator('option[value=IN_PROGRESS]')).toHaveText('قيد التنفيذ');
  await page.goto('/operations/daily-preview?date=2026-10-11',{waitUntil:'networkidle'});
  await expect(page.locator('[data-page-header] h1')).toHaveText('الروستر اليومي');
  await expect(page.getByRole('region',{name:'مسؤولو اليوم',exact:true})).toBeVisible();
  await expect(page.locator('.daily-operations-poster')).toContainText('Morning Shift');
  expect(await page.locator('.daily-operations-poster').innerText()).not.toMatch(/[\u0600-\u06ff]/);
  await page.getByRole('button',{name:'توليد روتيشن عشوائي',exact:true}).click();
  const dialog=page.getByRole('dialog');await expect(dialog).toHaveAttribute('dir','rtl');
  await expect(dialog.getByRole('heading',{name:'توليد روتيشن عشوائي',exact:true})).toBeVisible();
  await dialog.getByRole('button',{name:'إغلاق توليد الروتيشن',exact:true}).click();
  await page.getByRole('button',{name:'تغيير اللغة',exact:true}).first().click();
});
