require('../e2e/account-fixtures').installLanguageFixture();
const { test, expect } = require('@playwright/test');
const { evidence } = require('../e2e/stabilization-helpers');
const { assertIsolatedEnvironment } = require('../e2e/isolation');
const { roleState } = require('../e2e/stabilization-helpers');
const palettes = { classic: { top: 'rgb(48, 24, 72)', accent:'rgb(48, 24, 72)', active:'rgb(247, 206, 74)' }, blue: { top: 'rgb(18, 52, 81)', accent:'rgb(18, 52, 81)', active:'rgb(213, 234, 255)' }, orange: { top:'rgb(91, 41, 15)', accent:'rgb(91, 41, 15)', active:'rgb(255, 219, 182)' }, red: { top:'rgb(83, 23, 42)', accent:'rgb(83, 23, 42)', active:'rgb(255, 214, 228)' } };
for (const language of ['en','ar']) for (const theme of ['classic','blue','orange','red']) test(`${language} ${theme}: complete shell, responsive direction, profile and persisted preferences`, async ({ page }) => {
  assertIsolatedEnvironment(); test.setTimeout(240000);
  const errors=[]; page.on('pageerror', error=>errors.push(error.message));
  await page.addInitScript(({ language, theme })=>{ if(!localStorage.getItem('shellTestSeeded')){localStorage.setItem('bbLanguage',language);localStorage.setItem('bbTheme',theme);localStorage.setItem('shellTestSeeded','1');} },{language,theme});
  const dir=language==='ar'?'rtl':'ltr';
  for (const viewport of [{width:1920,height:1080},{width:1366,height:768},{width:820,height:1024},{width:390,height:844}].filter(v=>process.env.OPS_E2E_DESKTOP_ONLY!=='1'||v.width>=1366)) {
    await page.setViewportSize(viewport); await page.goto('/opmanager',{waitUntil:'networkidle'});
    await expect(page.locator('html')).toHaveAttribute('lang',language); await expect(page.locator('html')).toHaveAttribute('dir',dir);
    await expect(page.locator('[data-operations-application]')).toHaveAttribute('dir',dir);
    await expect(page.locator('.topbar')).toHaveCSS('background-color',palettes[theme].top);
    await expect(page.locator('main h1').first()).toHaveCSS('color',palettes[theme].accent);
    const card=page.locator('[data-card=attendance]'); if(await card.count()) { await expect(card).toHaveCSS('background-color',await page.evaluate(()=>{const h=getComputedStyle(document.documentElement).getPropertyValue('--theme-primary-soft').trim();return 'rgb('+[1,3,5].map(i=>parseInt(h.slice(i,i+2),16)).join(', ')+')';})); await expect(card.locator('svg').first()).toHaveCSS('color',await page.evaluate(()=>{const hex=getComputedStyle(document.documentElement).getPropertyValue('--theme-card-icon-fg').trim();return 'rgb('+[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)).join(', ')+')';})); }
    const rail=page.locator('#operations-navigation'),mobile=viewport.width<=620;
    if(mobile){await expect(rail).toBeHidden();await page.locator('header').getByRole('button',{name:/☰/}).click();}
    await expect(rail).toBeVisible();
    let box=await rail.boundingBox(); if(dir==='rtl') expect(box.x+box.width).toBeCloseTo(viewport.width,0);else expect(box.x).toBe(0);
    if(!mobile){ expect(box.width).toBe(64); const main=await page.locator('main').boundingBox(); if(dir==='rtl')expect(main.x+main.width).toBeLessThanOrEqual(box.x+1);else expect(main.x).toBeGreaterThanOrEqual(box.width); }
    expect(await rail.evaluate(e=>getComputedStyle(e).backgroundImage)).toContain('linear-gradient');
    await expect(rail.locator('a[aria-current=page]')).toHaveCSS('background-color',palettes[theme].active);
    const inactive=rail.locator('a:not([aria-current])').first(); await inactive.hover();await expect(inactive).not.toHaveCSS('background-color','rgba(0, 0, 0, 0)');
    if(!mobile){await inactive.focus(); await expect(page.getByRole('tooltip')).toBeVisible();const tip=await page.getByRole('tooltip').boundingBox();if(dir==='rtl')expect(tip.x+tip.width).toBeLessThan(box.x);else expect(tip.x).toBeGreaterThan(box.width);await rail.getByRole('button',{name:/navigation rail|شريط التنقل/}).click();await expect(rail.locator('a b').first()).toBeVisible();}
    await page.locator('.navbar-profile').getByRole('button',{name:/User account|الحساب الشخصي/}).click();
    const menu=page.locator('#shell-profile-menu');await expect(menu).toBeVisible();await expect(menu).toHaveAttribute('dir',dir);await expect(menu.locator('header strong')).not.toBeEmpty();
    const menuBox=await menu.boundingBox();expect(menuBox.x).toBeGreaterThanOrEqual(0);expect(menuBox.x+menuBox.width).toBeLessThanOrEqual(viewport.width);expect(menuBox.y).toBeGreaterThanOrEqual(0);expect(menuBox.y+menuBox.height).toBeLessThanOrEqual(viewport.height);
    await expect(menu.getByRole('button',{name:/Logout|تسجيل خروج/})).toHaveCSS('background-color','rgb(176, 8, 48)');
    await page.keyboard.press('Escape');await expect(menu).toHaveCount(0);await expect(page.locator('.navbar-profile').getByRole('button',{name:/User account|الحساب الشخصي/})).toBeFocused();
    if(mobile) await page.keyboard.press('Escape');else await rail.getByRole('button',{name:/navigation rail|شريط التنقل/}).click();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);expect(await page.locator('main').evaluate(e=>e.scrollWidth<=e.clientWidth+1)).toBeTruthy();
    await page.screenshot({path:evidence(`shell-${language}-${theme}-${viewport.width}.png`)});
  }
  // Remove initializer so reload must actually use the preferences saved by controls.
  const switcher=page.locator('.topbar .preference-icons');await switcher.getByRole('button').first().click();
  const nextLanguage=language==='ar'?'en':'ar';await expect(page.locator('html')).toHaveAttribute('lang',nextLanguage);
  const nextTheme=['classic','red','blue','orange'][(['classic','red','blue','orange'].indexOf(theme)+1)%4];await switcher.getByRole('button').nth(1).click();await expect(page.locator('html')).toHaveAttribute('data-theme',nextTheme);
  const saved=await page.evaluate(()=>({language:localStorage.getItem('bbLanguage'),theme:localStorage.getItem('bbTheme')}));expect(saved).toEqual({language:nextLanguage,theme:nextTheme});
  // A fresh page has no addInitScript, exercising true refresh/navigation persistence.
  const fresh=await page.context().newPage();await fresh.goto('/opmanager/settings?category=navigation',{waitUntil:'networkidle'});await expect(fresh.locator('html')).toHaveAttribute('lang',nextLanguage);await expect(fresh.locator('html')).toHaveAttribute('data-theme',nextTheme);await fresh.reload();await expect(fresh.locator('html')).toHaveAttribute('dir',nextLanguage==='ar'?'rtl':'ltr');await fresh.close();
  expect(errors).toEqual([]);
});
test('manager profile menu exposes only supported actions and records no operational writes',async({browser})=>{
  const context=await browser.newContext({storageState:roleState('MANAGER'),viewport:{width:1366,height:768}});const page=await context.newPage();const writes=[];page.on('request',r=>{if(r.url().includes('/api/')&&!['GET','HEAD'].includes(r.method()))writes.push(r.url());});
  await page.goto('/opmanager',{waitUntil:'networkidle'});await page.getByRole('button',{name:/الحساب الشخصي|User account/}).click();await expect(page.locator('#shell-profile-menu').getByRole('link',{name:/الإعدادات|Settings/,exact:true})).toHaveAttribute('href','/opmanager/settings');await expect(page.locator('#shell-profile-menu')).not.toContainText(/Permissions|الصلاحيات/);expect(writes).toEqual([]);await context.close();
});
test('theme tokens reach module controls and leave roster print colors unchanged',async({page})=>{
  test.setTimeout(180000);
  await page.addInitScript(()=>{localStorage.setItem('bbTheme','blue');localStorage.setItem('bbLanguage','en');});
  await page.goto('/operations?tab=schedule',{waitUntil:'networkidle'});
  await expect(page.getByRole('button',{name:'Download Import Template',exact:true})).toHaveCSS('background-color',palettes.blue.accent);
  await expect(page.getByRole('button',{name:'Import XLSX',exact:true})).toHaveCSS('color',palettes.blue.accent);
  await expect(page.getByLabel('Schedule revision')).toBeEnabled({timeout:60000});
  await expect(page.locator('.schedule-grid-table th').first()).toHaveCSS('background-color',palettes.blue.accent);
  await page.goto('/opmanager/settings?category=navigation',{waitUntil:'networkidle'});
  await expect(page.locator('nav[aria-label="Settings categories"] a[aria-current=page]')).toHaveCSS('color',palettes.blue.accent);
  await page.goto('/operations?tab=stock',{waitUntil:'networkidle'});
  await expect(page.locator('main h1')).toHaveCSS('color',palettes.blue.accent);
  await page.goto('/operations/daily-preview?date=2026-09-29',{waitUntil:'networkidle'});
  await expect(page.locator('.daily-operations-poster')).toBeVisible();
  await page.emulateMedia({media:'print'});
  let original;
  for(const theme of ['classic','blue','orange','red']) {
    await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);
    const colors=await page.locator('.daily-operations-poster').evaluate(root=>[root,...root.querySelectorAll('h1,h2,h3,th,td')].map(e=>{const s=getComputedStyle(e);return [s.color,s.backgroundColor,s.borderColor]}));
    if(original)expect(colors).toEqual(original);else original=colors;
  }
  await expect(page.locator('#operations-navigation')).toBeHidden();
});
