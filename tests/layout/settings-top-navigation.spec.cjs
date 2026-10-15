const { test, expect } = require('@playwright/test');
const { PrismaClient } = require('@prisma/client');
const fs = require('node:fs');
const path = require('node:path');
const { createHmac, randomBytes } = require('node:crypto');
const { SETTINGS_PAGES, PERFORMANCE_SECTIONS, TEMPLATE_SECTIONS } = require('../../lib/operations/settings-routes');
const { assertIsolatedEnvironment } = require('../e2e/isolation');

const phase = process.env.SETTINGS_NAV_PHASE || 'after';
const evidence = path.resolve(process.env.SETTINGS_NAV_EVIDENCE_DIR || 'docs/settings-navigation-2026-10-13');
const folder = path.join(evidence, phase);
fs.mkdirSync(folder, { recursive: true });
const sizes = [[1366, 768], [1440, 900], [1920, 1080]];
const themes = ['classic', 'blue', 'orange', 'red'];
const prefix = '/opmanager/settings/';
const core = [
  ['master', 'operations'], ['access', 'access'], ['roles', 'access'],
  ['roster', 'operations'], ['rules', 'operations'], ['appearance', 'general'],
  ['live-editors/roster', 'templates'], ['live-editors/monthly', 'templates'], ['live-editors/hall', 'templates'],
];
const groupOf = route => core.find(row => row[0] === route)?.[1]
  || (route.startsWith('performance-settings') ? 'performance'
    : ['dashboard', 'navigation', 'attention'].includes(route) ? 'general' : 'access');
const allRoutes = [
  ...SETTINGS_PAGES.filter(row => !['performance-settings', 'live-editors'].includes(row[0])).map(row => row[0]),
  ...PERFORMANCE_SECTIONS.map(row => 'performance-settings/' + row[0]),
  ...TEMPLATE_SECTIONS.map(row => 'live-editors/' + row[0]),
];

function expectedTitle(route, language) {
  const [category, section] = route.split('/');
  const row = section ? (category === 'live-editors' ? TEMPLATE_SECTIONS : PERFORMANCE_SECTIONS).find(row => row[0] === section)
    : SETTINGS_PAGES.find(row => row[0] === category);
  return row[language === 'ar' ? 2 : 1];
}
async function preferences(page, language = 'en', theme = 'classic', width = 1440, height = 900) {
  await page.setViewportSize({ width, height });
  await page.addInitScript(({ language, theme }) => {
    localStorage.setItem('bbLanguage', language);
    localStorage.setItem('bbTheme', theme);
  }, { language, theme });
}
async function open(page, route, language = 'en') {
  await page.goto(prefix + route, { waitUntil: 'networkidle' });
  await expect(page.locator('html')).toHaveAttribute('dir', language === 'ar' ? 'rtl' : 'ltr');
  await expect(page.locator('html')).toHaveAttribute('data-theme', await page.evaluate(() => localStorage.getItem('bbTheme')));
  await expect(page.locator('[data-page-header] h1')).toHaveText(expectedTitle(route, language));
}
function navigation(page) { return page.locator('[data-settings-top-nav]'); }
function trigger(page, group) { return navigation(page).locator(`[data-settings-group="${group}"]`); }
async function assertTopLayout(page, route) {
  const nav = navigation(page), header = page.locator('[data-page-header]').first();
  await expect(nav).toBeVisible();
  await expect(nav).toContainText(await header.locator('h1').innerText());
  await expect(page.locator('#operations-navigation a[aria-current="page"]')).toHaveAttribute('href', '/opmanager/settings');
  await expect(header.locator('.ui-breadcrumb [aria-current="page"]')).toHaveText(await header.locator('h1').innerText());
  await expect(nav.getByRole('menu')).toHaveCount(0);
  await expect(trigger(page, groupOf(route))).toHaveAttribute('data-active', 'true');
  const metrics = await page.locator('[data-settings-frame]').evaluate(frame => {
    const nav = frame.querySelector('[data-settings-top-nav]');
    const header = frame.querySelector('[data-page-header]');
    const content = frame.querySelector('[data-settings-page-content]') || [...frame.children].find(node => node.contains(header));
    const box = node => { const rect = node.getBoundingClientRect(); return { x: rect.x, y: rect.y, width: rect.width, height: rect.height, bottom: rect.bottom }; };
    return { frame: box(frame), content: box(content), nav: box(nav), header: box(header), columns: getComputedStyle(frame).gridTemplateColumns,
      theme: document.documentElement.dataset.theme, direction: document.documentElement.dir,
      pageOverflow: document.documentElement.scrollWidth > innerWidth + 2,
      verticalSettingsNav: Boolean(frame.querySelector('nav:not([data-settings-top-nav]):not(.ui-breadcrumb):not(.ui-settings-section-index)')) };
  });
  expect(metrics.pageOverflow, route + ' must not overflow the desktop').toBe(false);
  expect(metrics.verticalSettingsNav, route + ' must not retain a secondary Settings sidebar').toBe(false);
  expect(metrics.content.width, route + ' must recover the Settings sidebar width').toBeGreaterThanOrEqual(metrics.frame.width - 2);
  expect(Math.abs(metrics.content.x - metrics.frame.x), route + ' must not leave a blank side column').toBeLessThanOrEqual(2);
  expect(metrics.nav.y, route + ' navigation must follow the page header').toBeGreaterThanOrEqual(metrics.header.bottom - 2);
  const clipped = await nav.locator('button').evaluateAll(buttons => buttons.filter(button => button.scrollWidth > button.clientWidth + 2).map(button => button.innerText));
  expect(clipped, route + ' group titles must not be cramped').toEqual([]);
  await trigger(page, groupOf(route)).click();
  const active = nav.locator('[aria-current="page"]');
  await expect(active).toHaveCount(1);
  await expect(active).toHaveAttribute('href', prefix + route);
  await page.keyboard.press('Escape');
  await expect(nav.getByRole('menu')).toHaveCount(0);
  return metrics;
}

if (phase === 'before') {
  for (const language of ['en', 'ar']) for (const [width, height] of sizes) test(`before Settings layout ${language} ${width}`, async ({ page }) => {
    await preferences(page, language, 'classic', width, height);
    for (const route of ['master', 'access']) {
      await open(page, route, language);
      const metrics = await page.locator('[data-settings-frame]').evaluate(frame => {
        const header = frame.querySelector('[data-page-header]');
        const content = [...frame.children].find(node => node.contains(header));
        const box = node => { const rect = node.getBoundingClientRect(); return { x: rect.x, width: rect.width }; };
        return { frame: box(frame), content: box(content), columns: getComputedStyle(frame).gridTemplateColumns };
      });
      fs.writeFileSync(path.join(folder, `${route}-${language}-${width}.json`), JSON.stringify(metrics, null, 2));
      await page.screenshot({ path: path.join(folder, `${route}-${language}-${width}.png`) });
    }
  });
} else {
  for (const language of ['en', 'ar']) for (const theme of themes) for (const [width, height] of sizes) test(`Settings desktop ${language} ${theme} ${width}`, async ({ page }) => {
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await preferences(page, language, theme, width, height);
    for (const [route] of core) {
      await open(page, route, language);
      const metrics = await assertTopLayout(page, route);
      const file = `${route.replaceAll('/', '-')}-${language}-${theme}-${width}`;
      fs.writeFileSync(path.join(folder, file + '.json'), JSON.stringify(metrics, null, 2));
      await page.screenshot({ path: path.join(folder, file + '.png') });
      // The section index remains in the content flow; it never reserves a side column.
      const sectionIndex = page.locator('.ui-settings-section-index');
      if (await sectionIndex.count()) {
        expect(await sectionIndex.evaluate(index => index.getBoundingClientRect().width >= index.parentElement.getBoundingClientRect().width - 2)).toBe(true);
      }
    }
    expect(errors).toEqual([]);
  });

  for (const language of ['en', 'ar']) test(`all enabled Settings destinations preserve route ownership ${language}`, async ({ page }) => {
    await preferences(page, language);
    for (const route of allRoutes.filter(route => !core.some(row => row[0] === route))) {
      await open(page, route, language);
      await assertTopLayout(page, route);
    }
    const nav = navigation(page); const hrefs = [];
    for (const group of ['general', 'operations', 'templates', 'performance', 'access']) {
      await trigger(page, group).click();
      hrefs.push(...await nav.getByRole('menuitem').evaluateAll(items => items.map(item => item.getAttribute('href'))));
      await page.keyboard.press('Escape');
    }
    expect(new Set(hrefs).size).toBe(hrefs.length);
    expect(hrefs.sort()).toEqual([...allRoutes.map(route => prefix + route), '/operations/log'].sort());
    expect(hrefs.some(href => /restaurant|kitchen|cashier|payment|order/.test(href))).toBe(false);
  });

  for (const language of ['en', 'ar']) test(`expanded primary sidebar preserves the recovered Settings width ${language}`, async ({ page }) => {
    for (const [width, height] of sizes) {
      await preferences(page, language, 'classic', width, height);
      for (const route of ['master', 'access']) {
        await open(page, route, language);
        await page.locator('#operations-navigation button[aria-controls="operations-navigation-items"]').click();
        await expect(page.locator('[data-operations-application]')).toHaveAttribute('data-navigation-open', 'true');
        await assertTopLayout(page, route);
        if (await page.locator('[data-operations-application]').getAttribute('data-navigation-open') !== 'true')
          await page.locator('#operations-navigation button[aria-controls="operations-navigation-items"]').click();
        await page.screenshot({ path: path.join(folder, `${route}-${language}-classic-${width}-primary-expanded.png`) });
      }
    }
  });

  for (const language of ['en', 'ar']) test(`group menus, keyboard, history, refresh and deep links ${language}`, async ({ page }) => {
    await preferences(page, language);
    await open(page, 'master', language);
    const operations = trigger(page, 'operations'), nav = navigation(page);
    await operations.click();
    await expect(operations).toHaveAttribute('aria-expanded', 'true');
    const menu = nav.getByRole('menu'); await expect(menu).toBeVisible();
    await page.screenshot({ path: path.join(folder, `operations-menu-${language}-classic-1440.png`) });
    await page.locator('[data-page-header] h1').click();
    await expect(nav.getByRole('menu')).toHaveCount(0);
    await operations.focus(); await page.keyboard.press('ArrowDown');
    const items = nav.getByRole('menuitem');
    await expect(items.first()).toBeFocused();
    await page.keyboard.press('End'); await expect(items.last()).toBeFocused();
    await page.keyboard.press('Home'); await expect(items.first()).toBeFocused();
    await page.keyboard.press('ArrowDown'); await expect(items.nth(1)).toBeFocused();
    await page.keyboard.press('ArrowUp'); await expect(items.first()).toBeFocused();
    await page.keyboard.press('Escape'); await expect(operations).toBeFocused();
    await expect(nav.getByRole('menu')).toHaveCount(0);
    const focusStyle = await operations.evaluate(node => ({ outline: getComputedStyle(node).outlineStyle, shadow: getComputedStyle(node).boxShadow }));
    expect(focusStyle.outline !== 'none' || focusStyle.shadow !== 'none').toBe(true);
    await operations.focus(); await page.keyboard.press('ArrowDown'); await page.keyboard.press('Tab');
    await expect(nav.getByRole('menu')).toHaveCount(0);
    const templates = trigger(page, 'templates');
    await templates.focus(); await page.keyboard.press('Enter');
    await expect(nav.getByRole('menuitem').first()).toBeFocused();
    await page.screenshot({ path: path.join(folder, `templates-menu-${language}-classic-1440.png`) });
    await page.keyboard.press('Escape');
    await templates.focus(); await page.keyboard.press('Space');
    await expect(nav.getByRole('menuitem').first()).toBeFocused();
    await page.keyboard.press('Escape');
    await trigger(page, 'performance').focus(); await page.keyboard.press('ArrowDown');
    await expect(nav.getByRole('menuitem').first()).toBeFocused();
    await page.screenshot({ path: path.join(folder, `performance-menu-${language}-classic-1440.png`) });
    await page.keyboard.press('Escape');
    await trigger(page, 'access').focus(); await page.keyboard.press('ArrowDown');
    await expect(nav.getByRole('menuitem').first()).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(nav.getByRole('menu')).toHaveCount(0);
    expect(await page.evaluate(() => Boolean(document.activeElement?.closest('[data-settings-top-nav]')))).toBe(false);
    await operations.click(); await nav.locator(`[href="${prefix}roster"]`).click();
    await expect(page).toHaveURL(prefix + 'roster');
    await expect(page.locator('[data-page-header] h1')).toHaveText(expectedTitle('roster', language));
    await page.goBack({ waitUntil: 'networkidle' }); await expect(page).toHaveURL(prefix + 'master');
    await page.goForward({ waitUntil: 'networkidle' }); await expect(page).toHaveURL(prefix + 'roster');
    await page.reload({ waitUntil: 'networkidle' }); await assertTopLayout(page, 'roster');
    await page.goto(prefix + 'performance-settings/appraisal?branch=MOT#preserved-filter', { waitUntil: 'networkidle' });
    await expect(page).toHaveURL(prefix + 'performance-settings/appraisal?branch=MOT#preserved-filter');
    await assertTopLayout(page, 'performance-settings/appraisal');
    await page.reload({ waitUntil: 'networkidle' });
    await expect(page).toHaveURL(prefix + 'performance-settings/appraisal?branch=MOT#preserved-filter');
  });

  test('existing Settings aliases preserve stable destinations and filter query parameters', async ({ page }) => {
    await preferences(page);
    for (const [old, destination] of [
      ['/opmanager/settings?category=master&branch=MOT', prefix + 'master?branch=MOT'],
      ['/settings?category=recognition&year=2026', prefix + 'live-editors/monthly?year=2026'],
      ['/opmanager/settings?category=performance-settings&section=appraisal&branch=MOT', prefix + 'performance-settings/appraisal?branch=MOT'],
    ]) {
      await page.goto(old, { waitUntil: 'networkidle' });
      await expect(page).toHaveURL(destination);
      await expect(navigation(page)).toBeVisible();
    }
  });

  for (const language of ['en', 'ar']) test(`On this page stays compact and navigates visible sections inside the current route ${language}`, async ({ page }) => {
    await preferences(page, language); await open(page, 'master', language);
    const index = page.locator('.ui-settings-section-index');
    await expect(index).toBeVisible();
    await expect(index).toHaveAttribute('data-expanded', 'false');
    expect((await index.boundingBox()).height).toBeLessThan(60);
    await expect(index.getByRole('link')).toHaveCount(0);
    await index.getByRole('button').click();
    await expect(index).toHaveAttribute('data-expanded', 'true');
    const validTargets = await index.getByRole('link').evaluateAll(links => links.length > 1 && links.every(link => {
      const target = document.getElementById(link.getAttribute('href').slice(1));
      if (!target?.getClientRects().length || target.closest('dialog')) return false;
      for (let parent = target.parentElement; parent; parent = parent.parentElement)
        if (parent.tagName === 'DETAILS' && !parent.open && !parent.querySelector(':scope > summary')?.contains(target)) return false;
      return true;
    }));
    expect(validTargets).toBe(true);
    const anchor = await index.getByRole('link').first().getAttribute('href');
    await index.getByRole('link').first().click();
    await expect(page).toHaveURL(prefix + 'master' + anchor);
    await expect(index).toHaveAttribute('data-expanded', 'false');
    await open(page, 'appearance', language);
    await expect(page.locator('.ui-settings-section-index')).toHaveCount(0);
  });

  test('Settings group navigation preserves a UI draft and guards an operational draft', async ({ page }) => {
    await preferences(page); await open(page, 'dashboard');
    const title = page.getByLabel('Dashboard title (English)', { exact: true });
    const original = await title.inputValue(); await title.fill('Unsaved top navigation regression');
    await trigger(page, 'general').click(); await navigation(page).locator(`[href="${prefix}appearance"]`).click();
    await expect(page).toHaveURL(prefix + 'appearance'); await expect(page.getByRole('dialog')).toHaveCount(0);
    await trigger(page, 'general').click(); await navigation(page).locator(`[href="${prefix}dashboard"]`).click();
    await expect(title).toHaveValue('Unsaved top navigation regression');
    await title.fill(original);
    await trigger(page, 'operations').click(); await navigation(page).locator(`[href="${prefix}rules"]`).click();
    const field = page.getByLabel('Late grace minutes', { exact: true });
    await field.fill(String(Number(await field.inputValue()) + 1));
    await trigger(page, 'operations').click(); await navigation(page).locator(`[href="${prefix}master"]`).click();
    await expect(page.getByRole('dialog')).toBeVisible(); await expect(page).toHaveURL(prefix + 'rules');
    await page.getByRole('button', { name: 'Keep editing', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(navigation(page).locator(`[href="${prefix}master"]`)).toBeFocused();
    await navigation(page).locator(`[href="${prefix}master"]`).click();
    await page.getByRole('button', { name: 'Discard changes and continue', exact: true }).click();
    await expect(page).toHaveURL(prefix + 'master');
  });

  test('authorized Settings entries remain independent and unauthorized direct routes and APIs stay denied', async ({ browser }) => {
    assertIsolatedEnvironment();
    const db = new PrismaClient(); let userId, session;
    try {
      const user = await db.user.create({ data: { name: 'Settings navigation permission fixture', username: 'settings-nav-' + randomBytes(8).toString('hex'), role: 'ADMIN', password: 'unused', active: true } });
      userId = user.id;
      await require('../e2e/account-fixtures').registerAccountFixture(db, user);
      const { readConfig, KEY, loadAccount } = require('../../lib/accounts/service');
      const { config } = await readConfig(db);
      const { PERMISSIONS } = require('../../lib/accounts/registry');
      config.accounts[user.id].overrides = Object.fromEntries(PERMISSIONS.map(item => [item.key, null]));
      Object.assign(config.accounts[user.id].overrides, { 'users.view': 'ALL' });
      await db.systemSetting.update({ where: { key: KEY }, data: { value: JSON.stringify(config) } });
      const loaded = await loadAccount(db, user); const now = Math.floor(Date.now() / 1000);
      const payload = Buffer.from(JSON.stringify({ sub: loaded.id, iat: now, exp: now + 3600, jti: randomBytes(16).toString('hex'), v: 1, sv: loaded.profile.sessionVersion || 0 })).toString('base64url');
      session = payload + '.' + createHmac('sha256', process.env.SESSION_SECRET).update(payload).digest('base64url');
    } finally { await db.$disconnect(); }
    const context = await browser.newContext({ baseURL: 'http://127.0.0.1:3018', storageState: { cookies: [], origins: [] } });
    try {
      await context.addCookies([{ name: process.env.AUTH_COOKIE_NAME, value: session, domain: '127.0.0.1', path: '/', httpOnly: true, sameSite: 'Strict' }]);
      const page = await context.newPage(); await preferences(page); await open(page, 'access');
      const nav = navigation(page);
      await expect(nav.locator('[data-settings-group]')).toHaveCount(1);
      await trigger(page, 'access').click();
      await expect(nav.getByRole('menuitem')).toHaveCount(1);
      await expect(nav.getByRole('menuitem')).toHaveAttribute('href', prefix + 'access');
      await page.keyboard.press('Escape');
      await page.screenshot({ path: path.join(folder, 'restricted-user-en-classic-1440.png') });
      for (const route of ['roles', 'master', 'live-editors/roster', 'performance-settings/reports', 'account-activity']) {
        await page.goto(prefix + route, { waitUntil: 'networkidle' });
        await expect(page).toHaveURL(/\/account\?denied=1$/);
      }
      for (const url of ['/api/operations/settings', '/api/operations/performance-settings']) expect((await context.request.get(url)).status()).toBe(403);
      expect((await context.request.get('/api/users')).ok()).toBe(true);
    } finally { await context.close(); }
  });

  for (const language of ['en', 'ar']) test(`populated role and manager account editors retain comfortable desktop controls ${language}`, async ({ page }) => {
    assertIsolatedEnvironment(); const ar = language === 'ar';
    const db = new PrismaClient();
    const key = require('../../lib/accounts/service').KEY;
    const before = (await db.systemSetting.findUnique({ where: { key } })).value;
    try {
      for (const [width, height] of sizes) {
        await preferences(page, language, 'classic', width, height);
        await open(page, 'roles', language);
        const select = page.getByLabel(ar ? 'اختر الدور' : 'Select role', { exact: true });
        const role = await select.locator('option').evaluateAll(options => {
          const chosen = options.find(option => option.value && /operation\s*manager/i.test(option.textContent))
            || options.find(option => option.value && !/inactive/i.test(option.textContent));
          return { value: chosen.value, label: chosen.textContent.trim() };
        });
        await select.selectOption(role.value);
        await expect(page.getByLabel(ar ? 'اسم الدور' : 'Role name', { exact: true })).toHaveValue(role.label);
        await page.screenshot({ path: path.join(folder, `roles-detail-${language}-classic-${width}.png`) });
        let editor = page.locator('[data-permission-editor]');
        let module = editor.locator('details[data-permission-module="employees"]');
        await module.locator('summary').click();
        await module.scrollIntoViewIfNeeded();
        expect(await editor.evaluate(node => node.scrollWidth <= node.clientWidth + 2)).toBe(true);
        await page.screenshot({ path: path.join(folder, `roles-permissions-panel-${language}-classic-${width}.png`) });
        await open(page, 'access', language);
        const manager = page.locator('tbody tr').filter({ hasText: /Operation Manager/ }).first();
        await manager.getByRole('button', { name: ar ? 'تعديل' : 'Edit', exact: true }).click();
        const form = page.locator('form').filter({ has: page.getByRole('heading', { name: ar ? 'تعديل الحساب' : 'Edit account', exact: true }) });
        await form.scrollIntoViewIfNeeded();
        expect(await form.evaluate(node => node.scrollWidth <= node.clientWidth + 2)).toBe(true);
        await page.screenshot({ path: path.join(folder, `manager-account-detail-${language}-classic-${width}.png`) });
        await form.getByRole('button', { name: ar ? 'تعديل الصلاحيات' : 'Edit permissions', exact: true }).click();
        editor = form.locator('[data-permission-editor]');
        module = editor.locator('details[data-permission-module="employees"]');
        await module.locator('summary').click();
        await module.scrollIntoViewIfNeeded();
        expect(await editor.evaluate(node => node.scrollWidth <= node.clientWidth + 2)).toBe(true);
        await page.screenshot({ path: path.join(folder, `manager-permissions-panel-${language}-classic-${width}.png`) });
        await form.getByRole('button', { name: ar ? 'إلغاء' : 'Cancel', exact: true }).click();
      }
      expect((await db.systemSetting.findUnique({ where: { key } })).value).toBe(before);
    } finally { await db.$disconnect(); }
  });
}
