require('../e2e/account-fixtures').installLanguageFixture();
const {test,expect}=require('@playwright/test');
const {PAGES}=require('../../lib/operations/page-routes');
test('familiar action icons keep accessible labels, tooltips and page destinations throughout the desktop application',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));let icons=0;
 for(const language of ['en','ar']){
  await page.addInitScript(language=>localStorage.setItem('bbLanguage',language),language);await page.setViewportSize({width:1366,height:768});
  for(const [id,[route]] of Object.entries(PAGES)){
   await page.goto(route,{waitUntil:'networkidle'});await expect(page.locator('h1').first()).toBeVisible();expect(new URL(page.url()).pathname).toBe(route);
   const controls=await page.locator('.bb-action-icon').evaluateAll(elements=>elements.map(el=>({label:el.getAttribute('aria-label'),title:el.getAttribute('title'),svg:el.querySelectorAll('svg').length,hidden:el.querySelector('.bb-action-sr-only')?.textContent,overflow:el.scrollWidth>el.clientWidth+2})));
   for(const c of controls){expect(c.label).toBeTruthy();expect(c.title).toBeTruthy();expect(c.svg).toBe(1);expect(c.hidden).toBeTruthy();expect(c.overflow).toBe(false);}icons+=controls.length;
  }
 }
 expect(icons).toBeGreaterThan(50);expect(errors).toEqual([]);
});
