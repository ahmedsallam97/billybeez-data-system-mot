require('../e2e/account-fixtures').installLanguageFixture();
const {test,expect}=require('@playwright/test');
const path=require('node:path');
const codes=['UNIFORM','POSITION','SAFETY','BEHAVIOR','GUEST'];
const criteria=codes.map(code=>({id:code,code,label:code,maxScore:10,reasons:[{id:code+'-reason',label:'Operational safety and service review'}]}));
for(const language of ['en','ar'])for(const [size,width,height]of [['desktop',1920,1080],['laptop',1366,768],['tablet',820,1180],['tablet-768',768,1024],['mobile',390,844]].filter(([,width])=>process.env.OPS_E2E_DESKTOP_ONLY!=='1'||width>=1366)){
 test(`${language} ${size}: evaluation editor fields and actions fit`,async({page})=>{
  await page.setViewportSize({width,height});await page.addInitScript(lang=>localStorage.setItem('bbLanguage',lang),language);
  // A representative open evaluation exercises layout without creating business records.
  await page.route('**/api/operations/evaluations?date=*',route=>route.fulfill({json:{criteriaVersion:{criteria},rules:{penaltyDeduction:25,guidanceDeduction:15},team:[{id:'layout-employee'}],day:{status:'OPEN',criteriaVersion:{criteria},evaluations:[{id:'layout-evaluation',employeeId:'layout-employee',employee:{name:'Operations employee with a longer display name'},status:'DEFAULT_FULL',maxScore:50,exceptions:[]}]}}}));
  await page.goto('/operations?tab=evaluation&date=2026-09-27',{waitUntil:'networkidle'});
  await page.getByRole('button',{name:language==='ar'?'جزاءات وتوجيه':'Actions & notes',exact:true}).first().click();
  const dialog=page.getByRole('dialog');await expect(dialog).toBeVisible();await expect(dialog.getByLabel('UNIFORM deduction')).toBeVisible();
  expect(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
  expect(await dialog.evaluate(el=>{const outer=el.getBoundingClientRect();return [...el.querySelectorAll('button,input,select,textarea')].filter(control=>{const r=control.getBoundingClientRect();return r.left<outer.left||r.right>outer.right||control.tagName==='BUTTON'&&control.scrollWidth>control.clientWidth+2;}).map(control=>control.getAttribute('aria-label')||control.textContent);})).toEqual([]);
  await page.screenshot({path:path.resolve('tmp/component-layout-evidence',`${language}-${size}-evaluation-editor.png`)});
  await dialog.getByRole('button',{name:language==='ar'?'إغلاق':'Close',exact:true}).click();await expect(dialog).toHaveCount(0);
 });
}
