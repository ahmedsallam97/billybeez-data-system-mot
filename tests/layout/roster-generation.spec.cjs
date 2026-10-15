require('../e2e/account-fixtures').installLanguageFixture();
const { test, expect } = require('@playwright/test');
const { PrismaClient } = require('@prisma/client');
const { PDFDocument } = require('pdf-lib');
const { assertIsolatedEnvironment } = require('../e2e/isolation');
const fs = require('node:fs'), path = require('node:path');
const folder = path.resolve('docs/audit-evidence/roster-generation');
fs.mkdirSync(folder, { recursive: true });
const date = '2026-10-11', branch = 'MOT';
let db, fixture, protectedCells;
async function json(response) { expect(response.ok(), await response.text()).toBe(true); return response.json(); }
async function open(page, language = 'en', width = 1366, height = 768) {
  await page.setViewportSize({ width, height });
  await page.addInitScript(language => localStorage.setItem('bbLanguage', language), language);
  await page.goto(`/operations/daily-preview?date=${date}`, { waitUntil: 'networkidle' });
  await expect(page.locator('.daily-operations-poster')).toBeVisible();
}
test.beforeAll(async ({ request }) => {
  assertIsolatedEnvironment(); db = new PrismaClient();
  let day = await db.opsOperationsDay.findFirst({ where: { workDate: date, branch }, orderBy: { version: 'desc' } });
  if (!day) day = await db.opsOperationsDay.create({ data: { workDate: date, branch } });
  await db.opsOperationsDay.update({ where: { id: day.id }, data: { status: 'OPEN' } });
  const last = await db.opsRotationPlan.findFirst({ where: { operationsDayId: day.id }, orderBy: { version: 'desc' } });
  await db.opsRotationPlan.updateMany({ where: { operationsDayId: day.id }, data: { status: 'SUPERSEDED' } });
  fixture = await db.opsRotationPlan.create({ data: { operationsDayId: day.id, branch, version: (last?.version || 0) + 1, status: 'ACTIVE' } });
  const preview = (await json(await request.post('/api/operations/daily', { data: { action: 'previewRotation', date, branch } }))).preview;
  expect(preview.canApply).toBe(true); expect(preview.assignments.length).toBeGreaterThan(2);
  protectedCells = [];
  for (const [index, assignment] of preview.assignments.slice(0, 2).entries()) {
    protectedCells.push(await db.opsRotationAssignment.create({ data: { rotationPlanId: fixture.id, employeeId: assignment.employeeId, operationalPositionId: assignment.operationalPositionId, startTime: assignment.startTime, endTime: assignment.endTime, source: index ? 'AUTO' : 'MANUAL', manualLock: Boolean(index), overrideReason: index ? null : 'Disposable protected manual cell' } }));
  }
});
test.afterAll(async () => { await db?.$disconnect(); });

for (const [language, width, height] of [['en', 1366, 768], ['ar', 1920, 1080]]) {
  test(`${language}: generation button prepares a real proposal; closing does not save`, async ({ page }) => {
    await open(page, language, width, height);
    const before = await db.opsRotationPlan.findMany({ where: { operationsDayId: fixture.operationsDayId }, include: { assignments: true, breaks: true }, orderBy: { id: 'asc' } });
    const button = page.getByRole('button', { name: 'Generate random rotation', exact: true });
    await expect(button).toBeEnabled(); await expect(button.locator('svg')).toHaveCount(1);
    await page.locator('[data-roster-toolbar]').screenshot({ path: path.join(folder, `toolbar-${language}.png`) });
    await button.click(); const dialog = page.getByRole('dialog', { name: 'Generate random rotation' });
    await expect(dialog).toBeVisible(); await expect(dialog).toHaveAttribute('dir', 'ltr');
    await expect(dialog.locator('[data-rotation-preview-result]')).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Generate rotation', exact: true })).toBeDisabled();
    expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth + 2)).toBe(true);
    await dialog.screenshot({ path: path.join(folder, `generation-dialog-${language}.png`) });
    if (language === 'ar') await dialog.press('Escape'); else await dialog.getByRole('button', { name: 'Close rotation generation' }).click();
    await expect(dialog).toHaveCount(0); await expect(button).toBeFocused();
    expect(await db.opsRotationPlan.findMany({ where: { operationsDayId: fixture.operationsDayId }, include: { assignments: true, breaks: true }, orderBy: { id: 'asc' } })).toEqual(before);
    await expect(page.getByRole('button', { name: /Preview rotation generation/ })).toHaveCount(0);
  });
}

test('confirmed generation retries an error, preserves protected cells and refreshes the roster', async ({ page }) => {
  await open(page); const unchanged = await Promise.all(['opsScheduleAssignment', 'opsWristbandStock', 'opsDailyTrip', 'opsDailyEvent'].map(async model => [model, JSON.stringify(await db[model].findMany({ orderBy: { id: 'asc' } }))]));
  let fail = true;
  await page.route('**/api/operations/daily', async route => {
    if (route.request().postDataJSON()?.action === 'generateRotation' && fail) { fail = false; await route.fulfill({ status: 503, json: { error: 'Temporary generation failure; please retry.' } }); }
    else await route.continue();
  });
  await page.getByRole('button', { name: 'Generate random rotation', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Generate random rotation' });
  await expect(dialog.locator('[data-rotation-preview-result]')).toBeVisible();
  const reason = 'Manager confirmed generation from the roster toolbar';
  await dialog.getByLabel('Regeneration reason', { exact: true }).fill(reason);
  await dialog.getByRole('checkbox', { name: /I reviewed the assignments/ }).check();
  const apply = dialog.getByRole('button', { name: 'Generate rotation', exact: true });
  await apply.click(); await expect(dialog.getByRole('alert')).toContainText('Temporary generation failure');
  await expect(dialog.getByLabel('Regeneration reason', { exact: true })).toHaveValue(reason);
  expect((await db.opsRotationPlan.findUnique({ where: { id: fixture.id } })).status).toBe('ACTIVE');
  const response = page.waitForResponse(r => r.url().endsWith('/api/operations/daily') && r.request().postDataJSON()?.action === 'generateRotation');
  await apply.click(); const saved = await response, result = await json(saved);
  expect(saved.request().postDataJSON()).toMatchObject({ action: 'generateRotation', date, branch, confirmed: true, replaceManual: false, reason });
  expect(saved.request().postDataJSON().previewFingerprint).toMatch(/^[a-f0-9]{64}$/);
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('status').filter({ hasText: 'Rotation generated' })).toContainText(`roster version ${fixture.version + 1}`);
  expect(result.plan.version).toBe(fixture.version + 1);
  for (const cell of protectedCells) expect(result.plan.assignments).toContainEqual(expect.objectContaining({ employeeId: cell.employeeId, operationalPositionId: cell.operationalPositionId, startTime: cell.startTime, endTime: cell.endTime, source: cell.source, manualLock: cell.manualLock }));
  expect(await db.opsRotationAssignment.findMany({ where: { rotationPlanId: fixture.id }, orderBy: { id: 'asc' } })).toEqual([...protectedCells].sort((a,b) => a.id.localeCompare(b.id)));
  for (const [model, snapshot] of unchanged) expect(JSON.stringify(await db[model].findMany({ orderBy: { id: 'asc' } }))).toBe(snapshot);
  const apiRoster = await json(await page.request.get(`/api/operations/roster?date=${date}`));
  expect(apiRoster.rotation.id).toBe(result.plan.id);
  await page.reload({ waitUntil: 'networkidle' });
  await expect(page.locator('.ops-row .rotation-strong')).not.toHaveCount(0);
});

test('closed rosters cannot be regenerated; dates without a published schedule disable generation', async ({ page }) => {
  await db.opsOperationsDay.update({ where: { id: fixture.operationsDayId }, data: { status: 'CLOSED' } });
  try {
    await open(page); await page.getByRole('button', { name: 'Generate random rotation', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Generate random rotation' });
    await expect(dialog.locator('[data-rotation-preview-result]')).toBeVisible();
    await expect(dialog).toContainText('application is blocked');
    await dialog.getByLabel('Regeneration reason', { exact: true }).fill('Closed roster must remain unchanged');
    await dialog.getByRole('checkbox', { name: /I reviewed the assignments/ }).check();
    await expect(dialog.getByRole('button', { name: 'Generate rotation', exact: true })).toBeDisabled();
    const preview = (await json(await page.request.post('/api/operations/daily', { data: { action: 'previewRotation', date, branch } }))).preview;
    const before = await db.opsRotationPlan.count({ where: { operationsDayId: fixture.operationsDayId } });
    expect((await page.request.post('/api/operations/daily', { data: { action: 'generateRotation', date, branch, confirmed: true, previewFingerprint: preview.sourceFingerprint, reason: 'Cannot bypass closed roster guard' } })).ok()).toBe(false);
    expect(await db.opsRotationPlan.count({ where: { operationsDayId: fixture.operationsDayId } })).toBe(before);
    await dialog.getByRole('button', { name: 'Close rotation generation' }).click();
  } finally { await db.opsOperationsDay.update({ where: { id: fixture.operationsDayId }, data: { status: 'OPEN' } }); }
  await page.goto('/operations/daily-preview?date=2030-01-01', { waitUntil: 'networkidle' });
  await expect(page.getByRole('heading', { name: 'No published schedule covers this date' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Generate random rotation', exact: true })).toBeDisabled();
});

for (const workDate of ['2026-09-29', date]) for (const language of ['en', 'ar']) {
  test(`${language} ${workDate}: A4 print uses the full page and readable row heights`, async ({ page }) => {
    await open(page, language);
    await page.goto(`/operations/daily-preview?date=${workDate}`, { waitUntil: 'networkidle' });
    await expect(page.locator('.daily-operations-poster')).toBeVisible(); await page.evaluate(() => document.fonts.ready);
    // A4's printable content is 200mm wide; inspect actual print width, not the desktop viewport.
    await page.setViewportSize({ width: 756, height: 1123 });
    await page.evaluate(() => { document.body.dataset.dailyPreviewPrint = 'true'; }); await page.emulateMedia({ media: 'print' });
    const geometry = await page.locator('.daily-operations-poster').evaluate(el => {
      const poster = el.getBoundingClientRect(), table = el.querySelector('.ops-table').getBoundingClientRect(), footer = el.querySelector('.ops-footer').getBoundingClientRect();
      return { height: poster.height, width: poster.width, scrollWidth: el.scrollWidth, tableRatio: table.height / poster.height, footerRatio: (footer.bottom - poster.top) / poster.height, rows: [...el.querySelectorAll('.ops-row')].map(row => ({ height: row.getBoundingClientRect().height, font: parseFloat(getComputedStyle(row.querySelector('strong')).fontSize) })), singleWords: [...el.querySelectorAll('.ops-row>i')].filter(cell => /^[A-Za-z]+$/.test(cell.textContent.trim())).map(cell => { const range = document.createRange(); range.selectNodeContents(cell); return { text: cell.textContent, lines: new Set([...range.getClientRects()].map(rect => Math.round(rect.y))).size, overflow: cell.scrollWidth > cell.clientWidth + 1 }; }) };
    });
    expect(geometry.height).toBeGreaterThan(1070); expect(geometry.tableRatio).toBeGreaterThan(.4); expect(geometry.footerRatio).toBeGreaterThan(.95);
    expect(geometry.scrollWidth).toBeLessThanOrEqual(Math.ceil(geometry.width) + 1);
    expect(geometry.rows.every(row => row.height >= 28 && row.font >= 10)).toBe(true);
    expect(geometry.singleWords.every(word => word.lines <= 1 && !word.overflow)).toBe(true);
    const bytes = await page.pdf({ preferCSSPageSize: true, printBackground: true }); const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBe(1); expect(pdf.getPage(0).getWidth()).toBeCloseTo(595.28, 0); expect(pdf.getPage(0).getHeight()).toBeCloseTo(841.89, 0);
    if (language === 'en') fs.writeFileSync(path.join(folder, `roster-print-after-${workDate}.pdf`), bytes);
    fs.writeFileSync(path.join(folder, `print-geometry-${workDate}-${language}.json`), JSON.stringify(geometry, null, 2));
    await page.emulateMedia({ media: 'screen' });
  });
}
