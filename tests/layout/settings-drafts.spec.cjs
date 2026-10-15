require('../e2e/account-fixtures').installLanguageFixture();
const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const { database } = require('../e2e/stabilization-helpers');

const evidence = path.resolve('docs/audit-evidence/settings-drafts');
const endpoint = '/api/operations/settings';
const chooseCategory = async (page, label) => {
  const nav=page.getByRole('navigation', {name:/Settings categories|أقسام الإعدادات/});
  if(label==='Live template editors'||label==='Performance & Reports'){const group=nav.locator('details').filter({has:nav.locator('summary').filter({hasText:label})});if(!await group.evaluate(el=>el.open))await group.locator('summary').click();await group.getByRole('link').first().click();}else await nav.getByRole('link',{name:label,exact:true}).click();
};
async function open(page, category = 'rules', language = 'en', theme = 'classic', width = 1366, height = 768) {
  await page.setViewportSize({ width, height });
  await page.addInitScript(({ language, theme }) => { localStorage.setItem('bbLanguage', language); localStorage.setItem('bbTheme', theme); }, { language, theme });
  await page.goto(`/opmanager/settings?category=${category}`, { waitUntil: 'networkidle' });
  await expect(page.getByRole('heading', { name: language === 'ar' ? 'إعدادات العمليات' : 'Operations settings', exact: true })).toBeVisible();
}
function group(page, heading) { return page.locator('article.panel, section.panel').filter({ has: page.getByRole('heading', { name: heading, exact: true }) }); }
function recordSnapshot() {
  return database(db => Object.fromEntries(['OpsSchedule', 'OpsScheduleAssignment', 'OpsRotationAssignment', 'OpsWristbandStock', 'OpsDailyTrip', 'OpsDailyEvent', 'Employee'].map(table => [table, db.prepare(`SELECT * FROM "${table}" ORDER BY id`).all()])));
}
async function configuration(page) {
  const response = await page.request.get('/api/operations/config'); expect(response.ok()).toBe(true); return response.json();
}

for (const language of ['en', 'ar']) for (const [size, width, height] of [['laptop', 1366, 768], ['desktop', 1920, 1080]]) for (const theme of ['classic', 'red', 'blue', 'orange']) {
  test(`${language} ${size} ${theme}: named draft status, category warning and cancellation`, async ({ page }) => {
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await open(page, 'rules', language, theme, width, height);
    const title = language === 'ar' ? 'الحضور' : 'Attendance';
    const attendance = group(page, title);
    const field = attendance.getByLabel(language === 'ar' ? 'سماح التأخير بالدقائق' : 'Late grace minutes', { exact: true });
    const original = await field.inputValue();
    await expect(attendance.locator('[data-setting-status]')).toHaveAttribute('data-setting-status', 'clean');
    if (theme === 'classic') { fs.mkdirSync(evidence, { recursive: true }); await page.screenshot({ path: path.join(evidence, `rules-after-${language}-${size}.png`) }); }
    await field.fill(String(Number(original) + 1));
    await expect(attendance.locator('[data-setting-status]')).toHaveAttribute('data-setting-status', 'dirty');
    await expect(page.locator('[data-settings-drafts]')).toContainText(title);
    if (theme === 'classic') { fs.mkdirSync(evidence, { recursive: true }); await attendance.screenshot({ path: path.join(evidence, `attendance-draft-${language}-${size}.png`) }); }
    await chooseCategory(page, language === 'ar' ? 'بيانات العمليات' : 'Operations data');
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible(); await expect(dialog).toContainText(title);
    await expect(page).toHaveURL(/\/settings\/rules$/);
    const bounds = await dialog.boundingBox(); expect(bounds.x).toBeGreaterThanOrEqual(0); expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
    expect(await dialog.evaluate(el => getComputedStyle(el).textAlign)).toBe('start');
    if (theme === 'classic') await page.screenshot({ path: path.join(evidence, `leave-warning-${language}-${size}.png`) });
    await dialog.getByRole('button', { name: language === 'ar' ? 'الرجوع للتعديل' : 'Keep editing', exact: true }).click();
    await expect(dialog).toHaveCount(0); await expect(field).toHaveValue(String(Number(original) + 1));
    await attendance.getByRole('button', { name: language === 'ar' ? 'إلغاء تغييرات الحضور' : 'Revert Attendance changes', exact: true }).click();
    await expect(field).toHaveValue(original); await expect(page.locator('[data-settings-drafts]')).toHaveCount(0);
    await chooseCategory(page, language === 'ar' ? 'بيانات العمليات' : 'Operations data');
    await expect(page).toHaveURL(/\/settings\/master$/); await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}

test('saving one rule group preserves other drafts and existing operational data; values survive reload', async ({ page }) => {
  await open(page);
  const before = recordSnapshot(), config = await configuration(page);
  const attendance = group(page, 'Attendance'), leave = group(page, 'Leave and overtime');
  const minutes = attendance.getByLabel('Late grace minutes', { exact: true });
  const hours = leave.getByLabel('Overtime hours per day', { exact: true });
  const newMinutes = Number(await minutes.inputValue()) + 1, newHours = Number(await hours.inputValue()) + 1;
  await minutes.fill(String(newMinutes)); await hours.fill(String(newHours));
  const response = page.waitForResponse(response => response.url().endsWith(endpoint) && response.request().method() === 'PATCH');
  await attendance.getByRole('button', { name: 'Save', exact: true }).click();
  const saved = await response; expect(saved.status()).toBe(200);
  expect(saved.request().postDataJSON()).toEqual({ key: 'OPS_ATTENDANCE_RULES', value: JSON.stringify({ ...config.settings.OPS_ATTENDANCE_RULES, lateGraceMinutes: newMinutes }) });
  await expect(attendance.locator('[data-setting-status]')).toHaveAttribute('data-setting-status', 'saved');
  await expect(hours).toHaveValue(String(newHours)); await expect(leave.locator('[data-setting-status]')).toHaveAttribute('data-setting-status', 'dirty');
  await expect(page.locator('[data-settings-drafts]')).toContainText('Leave and overtime');
  await expect(page.locator('[data-settings-drafts]')).not.toContainText('Attendance');
  expect((await configuration(page)).settings.OPS_LEAVE_RULES).toEqual(config.settings.OPS_LEAVE_RULES);
  await leave.getByRole('button', { name: 'Revert Leave and overtime changes' }).click();
  await page.reload({ waitUntil: 'networkidle' });
  await expect(group(page, 'Attendance').getByLabel('Late grace minutes', { exact: true })).toHaveValue(String(newMinutes));
  expect(recordSnapshot()).toEqual(before);
  expect((await page.request.patch(endpoint, { data: { key: 'OPS_ATTENDANCE_RULES', value: JSON.stringify(config.settings.OPS_ATTENDANCE_RULES) } })).ok()).toBe(true);
});

test('failed save retains edits and supports a real retry; saving blocks discard', async ({ page }) => {
  await open(page, 'roster');
  fs.mkdirSync(evidence, { recursive: true }); await page.screenshot({ path: path.join(evidence, 'roster-settings-after-en-laptop.png') });
  const config = await configuration(page), branch = group(page, 'Branch and timezone');
  const field = branch.getByLabel('Branch name', { exact: true });
  const original = await field.inputValue(); await field.fill(`${original} UX check`);
  await page.route('**/api/operations/settings', route => route.request().method() === 'PATCH' ? route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Temporarily unavailable' }) }) : route.continue());
  await branch.getByRole('button', { name: 'Save branch' }).click();
  await expect(branch.locator('[data-setting-status]')).toHaveAttribute('data-setting-status', 'error');
  await expect(field).toHaveValue(`${original} UX check`);
  await expect(page.locator('[data-settings-drafts]')).toContainText('Branch');
  await page.unroute('**/api/operations/settings');
  let release; const wait = new Promise(resolve => release = resolve);
  await page.route('**/api/operations/settings', async route => { if (route.request().method() === 'PATCH') await wait; await route.continue(); });
  await branch.getByRole('button', { name: 'Save branch' }).click();
  await expect(branch.locator('[data-setting-status]')).toHaveAttribute('data-setting-status', 'saving');
  await chooseCategory(page, 'Evaluation & operating rules');
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Discard changes and continue' })).toBeDisabled();
  release(); await expect(branch.locator('[data-setting-status]')).toHaveAttribute('data-setting-status', 'saved');
  await page.getByRole('button', { name: 'Keep editing' }).click();
  await page.unroute('**/api/operations/settings');
  await page.reload({ waitUntil: 'networkidle' }); await expect(group(page, 'Branch and timezone').getByLabel('Branch name', { exact: true })).toHaveValue(`${original} UX check`);
  expect((await page.request.patch(endpoint, { data: { key: 'OPS_BRANCH_CONFIG', value: JSON.stringify(config.settings.OPS_BRANCH_CONFIG) } })).ok()).toBe(true);
});

test('links, reload and browser back protect drafts; confirmed discard navigates without changing saved data', async ({ page }) => {
  await open(page, 'rules'); await page.getByRole('link', { name: /View dashboard/ }).click();
  await page.getByRole('link', { name: 'Settings', exact: true }).first().click();
  await chooseCategory(page, 'Evaluation & operating rules');
  const field = group(page, 'Attendance').getByLabel('Late grace minutes', { exact: true });
  const original = await field.inputValue(); const config = await configuration(page);
  await field.fill(String(Number(original) + 1));
  await page.getByRole('link', { name: /View dashboard/ }).click();
  await expect(page.getByRole('dialog')).toBeVisible(); await page.keyboard.press('Escape');
  await expect(field).toHaveValue(String(Number(original) + 1));
  const reloadDialog = page.waitForEvent('dialog');
  await page.evaluate(() => { setTimeout(() => location.reload(), 0); });
  const warning = await reloadDialog; expect(warning.type()).toBe('beforeunload'); await warning.dismiss();
  await expect(field).toHaveValue(String(Number(original) + 1));
  await page.evaluate(() => history.back());
  await expect(page.getByRole('dialog')).toBeVisible(); await expect(page).toHaveURL(/settings\/rules/);
  await page.getByRole('button', { name: 'Keep editing' }).click(); await expect(field).toHaveValue(String(Number(original) + 1));
  await page.evaluate(() => history.back()); await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Discard changes and continue' }).click();
  await expect(page).toHaveURL(/\/opmanager$/); await page.goForward({ waitUntil: 'networkidle' });
  await expect(page).toHaveURL(/\/opmanager\/settings/);
  expect((await configuration(page)).settings.OPS_ATTENDANCE_RULES).toEqual(config.settings.OPS_ATTENDANCE_RULES);
});

test('record form saves keep the new values and establish a clean revert baseline', async ({ page }) => {
  await open(page, 'roster');
  const config = await configuration(page); const shift = config.shifts[0];
  const form = page.locator('form.ops-inline-setting').filter({ has: page.locator(`input[name="code"][value="${shift.code}"]`) });
  const field = form.locator('input[name="label"]'); const original = await field.inputValue();
  await field.fill(`${original} UX`); await expect(form.locator('[data-setting-status]')).toHaveAttribute('data-setting-status', 'dirty');
  await form.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(form.locator('[data-setting-status]')).toHaveAttribute('data-setting-status', 'saved'); await expect(field).toHaveValue(`${original} UX`);
  await field.fill('Uncommitted'); await form.getByRole('button', { name: new RegExp('Revert Shift times') }).click(); await expect(field).toHaveValue(`${original} UX`);
  const response = await page.request.post('/api/operations/config', { data: { action: 'saveShift', code: shift.code, label: shift.label, labelAr: shift.labelAr || '', startTime: shift.startTime, endTime: shift.endTime } }); expect(response.ok()).toBe(true);
});

test('browser forward can be cancelled or confirmed without leaving stale page content', async ({ page }) => {
  await open(page, 'rules'); await page.getByRole('link', { name: /View dashboard/ }).click(); await expect(page).toHaveURL(/\/opmanager$/);
  await page.goBack({ waitUntil: 'networkidle' }); await expect(page).toHaveURL(/settings\?\/settings\/rules$/);
  const field = group(page, 'Attendance').getByLabel('Late grace minutes', { exact: true }); const original = await field.inputValue();
  await field.fill(String(Number(original) + 1)); await page.evaluate(() => history.forward());
  await expect(page.getByRole('dialog')).toBeVisible(); await expect(page).toHaveURL(/settings\?\/settings\/rules$/);
  await page.getByRole('button', { name: 'Keep editing' }).click(); await expect(field).toHaveValue(String(Number(original) + 1));
  await page.evaluate(() => history.forward()); await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Discard changes and continue' }).click(); await expect(page).toHaveURL(/\/opmanager$/);
  await expect(page.getByRole('heading', { name: 'Operations settings', exact: true })).toHaveCount(0);
  await page.goBack({ waitUntil: 'networkidle' }); await expect(field).toHaveValue(original);
});

test('catalogue revert restores buffered text and category discard clears only abandoned local edits', async ({ page }) => {
  await open(page, 'master');
  const config = await configuration(page); const meals = page.getByRole('textbox', { name: 'Meals', exact: true });
  const initial = await meals.inputValue(); await meals.fill(`${initial}\nUX meal`);
  await page.getByRole('button', { name: 'Revert Catalogues changes' }).click(); await expect(meals).toHaveValue(initial);
  await meals.fill(`${initial}\nUX meal`); await chooseCategory(page, 'Evaluation & operating rules');
  await page.getByRole('button', { name: 'Discard changes and continue' }).click();
  await expect(page).toHaveURL(/\/settings\/rules$/); await chooseCategory(page, 'Operations data'); await expect(meals).toHaveValue(initial);
  expect((await configuration(page)).settings.OPS_PLANNING_CATALOGS).toEqual(config.settings.OPS_PLANNING_CATALOGS);
});

test('UI category changes keep their shared draft; rotation and template edits are protected', async ({ page }) => {
  await open(page, 'dashboard'); const input = page.getByLabel('Dashboard title (English)', { exact: true }); const original = await input.inputValue();
  await input.fill(`${original} UX`); await chooseCategory(page, 'Appearance'); await expect(page.getByRole('dialog')).toHaveCount(0);
  await chooseCategory(page, 'Dashboard'); await expect(input).toHaveValue(`${original} UX`);
  await chooseCategory(page, 'Schedule, shifts & team'); await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.locator('[data-rotation-settings]').getByRole('checkbox', { name: /In PM, prefer enabled combined locations/ }).click();
  await chooseCategory(page, 'Evaluation & operating rules'); await expect(page.getByRole('dialog')).toContainText('Rotation distributions');
  await page.getByRole('button', { name: 'Discard changes and continue' }).click();
  await expect(page.locator('[data-settings-drafts]')).toContainText('UI preferences');
  await chooseCategory(page, 'Live template editors');
  await page.getByRole('textbox', { name: 'Title', exact: true }).fill('Roster design draft');
  await chooseCategory(page, 'Evaluation & operating rules'); await expect(page.getByRole('dialog')).toContainText('Roster design'); await page.keyboard.press('Escape');
});

test('operational location forms and performance drafts cannot disappear on category changes', async ({ page }) => {
  await open(page, 'roster');
  const positionsBefore = (await configuration(page)).positions;
  const rotation = page.locator('[data-rotation-settings]');
  await rotation.getByRole('button', { name: 'Add Location', exact: true }).click();
  const code = rotation.getByLabel('Location code', { exact: true }); await code.fill('UX_DRAFT');
  await chooseCategory(page, 'Evaluation & operating rules');
  await expect(page.getByRole('dialog')).toContainText('Operational location'); await page.keyboard.press('Escape');
  await expect(code).toHaveValue('UX_DRAFT');
  await rotation.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible(); await page.getByRole('button', { name: 'Discard changes and continue' }).click();
  await expect(code).toHaveCount(0); expect((await configuration(page)).positions).toEqual(positionsBefore);
  await chooseCategory(page, 'Performance & Reports');
  const minutes = page.getByLabel('Completion deadline after event end (minutes)', { exact: true }).first();
  const original = await minutes.inputValue(); await minutes.fill(String(Number(original) + 1));
  await chooseCategory(page, 'Evaluation & operating rules'); await expect(page.getByRole('dialog')).toContainText('Performance configuration');
  await page.keyboard.press('Escape'); await expect(minutes).toHaveValue(String(Number(original) + 1));
  await chooseCategory(page, 'Evaluation & operating rules'); await page.getByRole('button', { name: 'Discard changes and continue' }).click();
  await chooseCategory(page, 'Performance & Reports'); await expect(minutes).toHaveValue(original);
});

test('save controls and direct settings APIs retain independent permission enforcement', async ({ browser }) => {
  const { PrismaClient } = require('@prisma/client'); const { createHmac, randomBytes } = require('node:crypto');
  const { registerAccountFixture } = require('../e2e/account-fixtures'); const service = require('../../lib/accounts/service');
  const db = new PrismaClient(); let context;
  try {
    const user = await db.user.create({ data: { name: 'Settings read only UX fixture', username: `settings-ux-${Date.now()}`, password: 'unusable', role: 'ADMIN' } });
    await registerAccountFixture(db, user); const { config } = await service.readConfig(db);
    for (const key of ['branches.configure', 'settings.configure', 'appearance.configure', 'editors.templates']) config.accounts[user.id].overrides[key] = null;
    config.revision++; await db.systemSetting.update({ where: { key: service.KEY }, data: { value: JSON.stringify(config) } });
    const now = Math.floor(Date.now() / 1000), payload = Buffer.from(JSON.stringify({ sub: user.id, iat: now, exp: now + 3600, jti: randomBytes(16).toString('base64url'), v: 1 })).toString('base64url');
    const signature = createHmac('sha256', process.env.SESSION_SECRET).update(payload).digest('base64url');
    context = await browser.newContext({ storageState: { cookies: [{ name: process.env.AUTH_COOKIE_NAME, value: `${payload}.${signature}`, domain: '127.0.0.1', path: '/', expires: now + 3600, httpOnly: true, secure: false, sameSite: 'Strict' }], origins: [] } });
    const page = await context.newPage(); await open(page, 'roster'); const configBefore = await configuration(page);
    const branch = group(page, 'Branch and timezone'); await branch.getByLabel('Branch name', { exact: true }).fill('Read-only draft');
    await expect(branch.getByRole('button', { name: 'Save branch' })).toBeDisabled();
    expect((await page.request.patch(endpoint, { data: { key: 'OPS_BRANCH_CONFIG', value: JSON.stringify({ ...configBefore.settings.OPS_BRANCH_CONFIG, branchName: 'Denied change' }) } })).status()).toBe(403);
    expect((await page.request.patch(endpoint, { data: { key: 'OPS_ATTENDANCE_RULES', value: JSON.stringify({ lateGraceMinutes: 15 }) } })).status()).toBe(403);
    expect((await configuration(page)).settings.OPS_BRANCH_CONFIG).toEqual(configBefore.settings.OPS_BRANCH_CONFIG);
    await branch.getByRole('button', { name: 'Revert Branch changes' }).click(); await expect(page.locator('[data-settings-drafts]')).toHaveCount(0);
  } finally { await context?.close(); await db.$disconnect(); }
});
