require('../e2e/account-fixtures').installLanguageFixture();
const { test, expect } = require('@playwright/test');
const { PrismaClient } = require('@prisma/client');
const { assertIsolatedEnvironment } = require('../e2e/isolation');
const { readConfig, KEY } = require('../../lib/accounts/service');

const date = '2026-10-11';
const branch = 'MOT';
const api = `/api/operations/daily?date=${date}&branch=${branch}`;
const editorApi = `${api}&view=rotationEditor`;
const rosterUrl = `/operations/daily-preview?date=${date}`;
const reasons = {
  LOCKED: 'Locked assignment', CLOSED: 'Closed or historical roster',
  INACTIVE: 'Inactive employee', FRONT_ASSIGNMENT: 'Fixed front assignment',
  OVERLAPPING: 'Overlapping assignments need review', OUTSIDE_SHIFT: 'Outside employee shift',
  ABSENT: 'Employee is absent', BREAK: 'Employee break', EXCLUDED: 'Excluded from this shift',
  ROLE: 'Role not allowed', QUALIFICATION: 'Qualification required',
  MAX_COVERAGE: 'Maximum coverage reached', COMPONENT_CONFLICT: 'A shared location is already assigned',
  TEAM_LEADER: 'Fixed team leader assignment', HANDOVER_BREAK: 'AM handover break',
  PM_HANDOVER_SUPPORT_ONLY: 'AM support only after PM arrival',
  AFTER_HANDOVER_ONLY: 'Available after the handover break',
  DATA_EXIT_COVERAGE: 'Other locations must be covered before Data and Exit',
};
let db, fixtureCell, fixturePlan, adminId;

async function json(response) {
  expect(response.ok(), await response.text()).toBe(true);
  return response.json();
}
function cellLabel(cell) {
  return `Location for ${cell.employeeName} ${cell.startTime} to ${cell.endTime}`;
}
function sameCell(cell) {
  return cell.employeeId === fixtureCell.employeeId && cell.startTime === fixtureCell.startTime && cell.endTime === fixtureCell.endTime;
}
async function openRoster(page, { language = 'en', theme = 'classic', width = 1366, height = 768 } = {}) {
  await page.setViewportSize({ width, height });
  await page.addInitScript(({ language, theme }) => {
    localStorage.setItem('bbLanguage', language);
    localStorage.setItem('bbTheme', theme);
  }, { language, theme });
  await page.goto(rosterUrl, { waitUntil: 'networkidle' });
  await expect(page.locator('[data-operations-application]')).toHaveAttribute('dir', language === 'ar' ? 'rtl' : 'ltr');
  await expect(page.locator('.daily-operations-poster')).toBeVisible();
  await expect(page.locator('[data-roster-toolbar]')).toBeVisible();
}
async function openEditor(page) {
  const editor = (await json(await page.request.get(editorApi))).editor;
  await page.getByRole('button', { name: 'Edit rotations', exact: true }).click();
  await expect(page.locator('[data-rotation-editor]')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Finish editing rotations', exact: true })).toHaveAttribute('aria-pressed', 'true');
  return editor;
}
async function unrelatedSnapshot() {
  const models = ['opsSchedule', 'opsScheduleAssignment', 'opsWristbandStock', 'opsDailyTrip', 'opsDailyEvent'];
  return Promise.all(models.map(async model => [model, JSON.stringify(await db[model].findMany({ orderBy: { id: 'asc' } }))]));
}

test.beforeAll(async ({ request }) => {
  assertIsolatedEnvironment();
  db = new PrismaClient();
  adminId = (await db.user.findFirst({ where: { active: true, role: 'ADMIN' }, select: { id: true } })).id;
  let day = await db.opsOperationsDay.findFirst({ where: { workDate: date, branch }, orderBy: { version: 'desc' } });
  if (!day) day = await db.opsOperationsDay.create({ data: { workDate: date, branch } });
  await db.opsOperationsDay.update({ where: { id: day.id }, data: { status: 'OPEN' } });
  const last = await db.opsRotationPlan.findFirst({ where: { operationsDayId: day.id }, orderBy: { version: 'desc' } });
  await db.opsRotationPlan.updateMany({ where: { operationsDayId: day.id }, data: { status: 'SUPERSEDED' } });
  fixturePlan = await db.opsRotationPlan.create({ data: { operationsDayId: day.id, branch, version: (last?.version || 0) + 1, status: 'ACTIVE' } });
  const data = await json(await request.get(api));
  expect(data.schedule, 'Published schedule fixture is required').toBeTruthy();
  const member = data.team.find(member => member.working && !member.frontAssignment && !(member.isShiftLeader ?? member.employee.operationsTeamLeader) && member.employee.department === 'OPERATION' && (!member.liveDay || !member.attendance || ['PRESENT', 'LATE', 'EARLY_LEAVE', 'UNEXPECTED_PRESENT'].includes(member.attendance.status)));
  expect(member, 'An editable Operations employee is required').toBeTruthy();
  for (const position of data.positions.filter(position => position.active && position.requiresQualification)) {
    await db.employeeQualification.upsert({
      where: { employeeId_operationalPositionId: { employeeId: member.employeeId, operationalPositionId: position.id } },
      create: { employeeId: member.employeeId, operationalPositionId: position.id, status: 'QUALIFIED' },
      update: { status: 'QUALIFIED', effectiveDate: null, expiryDate: null },
    });
  }
  const editor = (await json(await request.get(editorApi))).editor;
  const cells = editor.cells.filter(cell => cell.employeeId === member.employeeId && !cell.blocked);
  fixtureCell = cells.find(cell => cell.options.some(option => option.id !== 'BREAK' && !option.reason && !option.requiresOverride));
  expect(fixtureCell, 'A legal initial location is required').toBeTruthy();
  const position = fixtureCell.options.find(option => option.id !== 'BREAK' && !option.reason && !option.requiresOverride);
  await db.opsRotationAssignment.create({ data: { rotationPlanId: fixturePlan.id, employeeId: fixtureCell.employeeId, operationalPositionId: position.id, startTime: fixtureCell.startTime, endTime: fixtureCell.endTime, source: 'AUTO' } });
  const lastCell = cells.filter(cell => cell.startTime !== fixtureCell.startTime).at(-1);
  expect(lastCell, 'A separate protected break cell is required').toBeTruthy();
  await db.opsBreakAssignment.create({ data: { rotationPlanId: fixturePlan.id, employeeId: lastCell.employeeId, startTime: lastCell.startTime, endTime: lastCell.endTime, status: 'PLANNED', note: 'Disposable UX break fixture' } });
  fixtureCell = (await json(await request.get(editorApi))).editor.cells.find(sameCell);
});

test.afterAll(async () => { await db?.$disconnect(); });

for (const language of ['en', 'ar']) for (const [size, width, height] of [['laptop', 1366, 768], ['desktop', 1920, 1080]]) for (const theme of ['classic', 'red', 'blue', 'orange']) {
  test(`${language} ${size} ${theme}: grouped toolbar fits and rotation lists put available locations first`, async ({ page }, testInfo) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await openRoster(page, { language, theme, width, height });
    const toolbar = page.locator('[data-roster-toolbar]');
    await expect(toolbar.getByRole('group')).toHaveCount(3);
    for (const [group, label] of [['date', 'Roster date and day navigation'], ['edit', 'Editing and settings'], ['export', 'Print and sharing']]) {
      await expect(toolbar.locator(`[data-roster-toolbar-group="${group}"]`)).toHaveAttribute('aria-label', label);
    }
    await expect(toolbar.getByLabel('Date', { exact: true })).toHaveValue(date);
    await expect(toolbar.locator('time')).toHaveAttribute('datetime', date);
    await expect(toolbar.locator('time')).toContainText('Sunday');
    await expect(toolbar.getByRole('link', { name: 'Settings', exact: true })).toHaveAttribute('href', '/settings?tab=template');
    await expect(toolbar.getByRole('link', { name: 'Back', exact: true })).toHaveAttribute('href', '/operations');
    for (const name of ['Yesterday', 'Tomorrow', 'Print', 'Generate random rotation', 'Edit rotations', 'WhatsApp', 'Copy to Clipboard']) {
      await expect(toolbar.getByRole('button', { name, exact: true })).toBeEnabled();
    }
    const actions = await toolbar.locator('button,a').evaluateAll(elements => elements.map(element => {
      const box = element.getBoundingClientRect();
      return { label: element.getAttribute('aria-label'), title: element.getAttribute('title'), icons: element.querySelectorAll('svg[aria-hidden="true"]').length, width: box.width, height: box.height, left: box.left, right: box.right, overflow: element.scrollWidth > element.clientWidth + 2 };
    }));
    expect(actions).toHaveLength(9);
    for (const action of actions) {
      expect(action.label).toBeTruthy(); expect(action.title).toBeTruthy(); expect(action.icons).toBe(1);
      expect(action.width).toBeGreaterThanOrEqual(40); expect(action.height).toBeGreaterThanOrEqual(40);
      expect(action.left).toBeGreaterThanOrEqual(0); expect(action.right).toBeLessThanOrEqual(width + 2); expect(action.overflow).toBe(false);
    }
    const layout = await toolbar.evaluate(element => {
      const groups = [...element.querySelectorAll('[data-roster-toolbar-group]')].map(group => {
        const box = group.getBoundingClientRect();
        return { left: box.left, right: box.right, bottom: box.bottom, overflow: group.scrollWidth > group.clientWidth + 2 };
      });
      return { overflow: element.scrollWidth > element.clientWidth + 2, direction: getComputedStyle(element).direction, groups };
    });
    expect(layout.overflow).toBe(false); expect(layout.direction).toBe('ltr');
    expect(layout.groups.every(group => !group.overflow)).toBe(true);
    for (let index = 1; index < layout.groups.length; index++) {
      expect(layout.groups[index].left).toBeGreaterThan(layout.groups[index - 1].right);
      expect(Math.abs(layout.groups[index].bottom - layout.groups[0].bottom)).toBeLessThan(2);
    }
    await expect(page.getByRole('button', { name: /Preview rotation generation|معاينة توليد الروتيشن/ })).toHaveCount(0);
    if (theme === 'classic') await toolbar.screenshot({ path: testInfo.outputPath(`roster-toolbar-${language}-${size}.png`) });
    const editor = await openEditor(page);
    const selects = await page.locator('.ops-rotation-select').evaluateAll(elements => elements.map(select => ({
      label: select.getAttribute('aria-label'), value: select.value, disabled: select.disabled, title: select.title,
      groups: [...select.querySelectorAll('optgroup')].map(group => ({
        label: group.label,
        options: [...group.querySelectorAll('option')].map(option => ({ value: option.value, disabled: option.disabled, text: option.textContent })),
      })),
    })));
    expect(selects.length).toBeGreaterThan(0);
    let unavailable = 0, breaks = 0;
    for (const select of selects) {
      const cell = editor.cells.find(cell => cellLabel(cell) === select.label);
      expect(cell, select.label).toBeTruthy();
      expect(select.disabled).toBe(Boolean(cell.blocked));
      if (cell.blocked === 'BREAK') { breaks++; expect(select.title).toBe(reasons.BREAK); }
      const available = cell.options.filter(option => !option.reason && !option.requiresOverride);
      const blocked = cell.options.filter(option => option.reason || option.requiresOverride);
      const availableGroup = select.groups.find(group => group.label === 'Available locations');
      const unavailableGroup = select.groups.find(group => group.label === 'Unavailable locations');
      if (available.length) expect(availableGroup?.options.map(option => option.value)).toEqual(available.map(option => option.id));
      if (blocked.length) {
        unavailable += blocked.length;
        expect(unavailableGroup?.options.map(option => option.value)).toEqual(blocked.map(option => option.id));
        for (const option of blocked) {
          const detail = unavailableGroup.options.filter(rendered => rendered.value === option.id);
          expect(detail).toHaveLength(1); expect(detail[0].disabled).toBe(true);
          expect(detail[0].text).toContain(option.label || option.code);
          if (option.reason) expect(detail[0].text).toContain(reasons[option.reason] || option.reason); else expect(detail[0].text).toMatch(/override/i);
        }
      }
      const options = select.groups.flatMap(group => group.options);
      expect(options.map(option => option.value)).toEqual([...available, ...blocked].map(option => option.id));
      expect(options.slice(0, available.length).every(option => !option.disabled)).toBe(true);
      expect(select.value).toBe(cell.currentPositionId);
    }
    expect(unavailable).toBeGreaterThan(0); expect(breaks).toBeGreaterThan(0);
    await page.getByRole('button', { name: 'Finish editing rotations', exact: true }).click();
    await expect(page.locator('[data-rotation-editor]')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Edit rotations', exact: true })).toHaveAttribute('aria-pressed', 'false');
    await page.emulateMedia({ media: 'print' }); await expect(toolbar).toBeHidden(); await page.emulateMedia({ media: 'screen' });
    expect(errors).toEqual([]);
  });
}

test('unavailable current locations retain their reason and explicit overrides regroup without saving', async ({ page }) => {
  await openRoster(page);
  const payload = await json(await page.request.get(editorApi));
  const cell = payload.editor.cells.find(sameCell);
  const current = cell.options.find(option => option.id === cell.currentPositionId);
  current.reason = 'MAX_COVERAGE';
  const override = cell.options.find(option => option.id === 'BREAK');
  override.requiresOverride = true;
  payload.editor.allowDisabledManualAssignments = true;
  await page.route('**/api/operations/daily?*', async route => {
    if (new URL(route.request().url()).searchParams.get('view') === 'rotationEditor') await route.fulfill({ json: payload });
    else await route.continue();
  });
  const changes = [];
  page.on('request', request => { if (request.method() === 'POST' && request.url().includes('/api/operations/daily')) changes.push(request.postDataJSON()); });
  await page.getByRole('button', { name: 'Edit rotations', exact: true }).click();
  const select = page.getByRole('combobox', { name: cellLabel(cell), exact: true });
  await expect(select).toHaveValue(current.id);
  const blockedCurrent = select.locator('optgroup[label="Unavailable locations"] option[data-rotation-current]');
  await expect(blockedCurrent).toHaveCount(1);
  await expect(blockedCurrent).toContainText(current.label);
  await expect(blockedCurrent).toContainText(reasons.MAX_COVERAGE);
  const blockedOverride = select.locator('optgroup[label="Unavailable locations"] option[value="BREAK"]');
  await expect(blockedOverride).toBeDisabled(); await expect(blockedOverride).toContainText('override');
  await page.getByRole('checkbox', { name: 'Allow explicit manual overrides for excluded locations in these edits', exact: true }).check();
  await expect(select.locator('optgroup[label="Available locations"] option[value="BREAK"]')).toBeEnabled();
  await expect(blockedOverride).toHaveCount(0);
  await expect(blockedCurrent).toContainText(reasons.MAX_COVERAGE);
  await expect(select).toHaveValue(current.id);
  expect(changes).toEqual([]);
});

for (const language of ['en', 'ar']) {
  test(`${language}: dialog shows old and new locations; cancellation leaves the roster untouched`, async ({ page }, testInfo) => {
    await openRoster(page, { language });
    const editor = await openEditor(page), cell = editor.cells.find(sameCell);
    const before = await db.opsRotationPlan.findUnique({ where: { id: fixturePlan.id }, include: { assignments: true, breaks: true } });
    const changes = [];
    page.on('request', request => { if (request.method() === 'POST' && request.url().includes('/api/operations/daily')) changes.push(request.postDataJSON()); });
    const select = page.getByRole('combobox', { name: cellLabel(cell), exact: true });
    await select.selectOption('BREAK');
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible(); await expect(dialog).toContainText(cell.employeeName);
    await expect(dialog).toHaveAttribute('dir','ltr');
    expect(await dialog.evaluate(element=>getComputedStyle(element).textAlign)).toBe('start');
    await expect(dialog).toContainText(`${cell.startTime}–${cell.endTime}`);
    await expect(dialog.locator('[data-rotation-change-from]')).toContainText(cell.options.find(option => option.id === cell.currentPositionId).label);
    await expect(dialog.locator('[data-rotation-change-to]')).toContainText(cell.options.find(option => option.id === 'BREAK').label);
    const save = dialog.getByRole('button', { name: 'Save change', exact: true });
    await expect(save).toBeDisabled();
    await dialog.locator('textarea').fill('   '); await expect(save).toBeDisabled();
    await dialog.locator('textarea').fill('Cancel regression check'); await expect(save).toBeEnabled();
    await dialog.screenshot({ path: testInfo.outputPath(`rotation-change-dialog-${language}.png`) });
    if (language === 'ar') await dialog.press('Escape'); else await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(dialog).toHaveCount(0); await expect(select).toHaveValue(cell.currentPositionId);
    expect(changes).toEqual([]);
    expect(await db.opsRotationPlan.findUnique({ where: { id: fixturePlan.id }, include: { assignments: true, breaks: true } })).toEqual(before);
    expect((await json(await page.request.get(editorApi))).editor.sourceFingerprint).toBe(editor.sourceFingerprint);
  });
}

test('saving a location change preserves the API contract, previous roster and unrelated operational data', async ({ page }) => {
  assertIsolatedEnvironment(); await openRoster(page);
  const editor = await openEditor(page), cell = editor.cells.find(sameCell);
  const untouched = await unrelatedSnapshot();
  const oldAssignments = await db.opsRotationAssignment.findMany({ where: { rotationPlanId: fixturePlan.id }, orderBy: { id: 'asc' } });
  await page.getByRole('combobox', { name: cellLabel(cell), exact: true }).selectOption('BREAK');
  const dialog = page.getByRole('dialog'), reason = 'Supervisor adjusted this hour to a break';
  await dialog.getByLabel('Reason for change', { exact: true }).fill(reason);
  const saved = page.waitForResponse(response => response.request().method() === 'POST' && response.url().includes('/api/operations/daily') && response.request().postDataJSON()?.action === 'changeRotationCell');
  await dialog.getByRole('button', { name: 'Save change', exact: true }).click();
  const response = await saved;
  expect(response.request().postDataJSON()).toEqual({ action: 'changeRotationCell', date, branch, employeeId: cell.employeeId, startTime: cell.startTime, endTime: cell.endTime, operationalPositionId: 'BREAK', sourceFingerprint: editor.sourceFingerprint, allowDisabled: false, reason });
  const result = await json(response);
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('status').filter({ hasText: 'Manual change saved' })).toContainText(`roster version ${fixturePlan.version + 1}`);
  expect(result.plan.version).toBe(fixturePlan.version + 1); expect(result.plan.id).not.toBe(fixturePlan.id);
  expect((await db.opsRotationPlan.findUnique({ where: { id: fixturePlan.id } })).status).toBe('SUPERSEDED');
  expect(await db.opsRotationAssignment.findMany({ where: { rotationPlanId: fixturePlan.id }, orderBy: { id: 'asc' } })).toEqual(oldAssignments);
  const snapshot = JSON.parse((await db.opsRotationPlan.findUnique({ where: { id: result.plan.id } })).generationSnapshotJson);
  expect(snapshot).toMatchObject({ action: 'MANUAL_CELL_CHANGE', previousPlanId: fixturePlan.id, fromPositionId: cell.currentPositionId, toPositionId: 'BREAK', reason });
  expect(await db.opsBreakAssignment.findFirst({ where: { rotationPlanId: result.plan.id, employeeId: cell.employeeId, startTime: cell.startTime, endTime: cell.endTime } })).toMatchObject({ note: reason, status: 'PLANNED' });
  const audit = await db.auditLog.findFirst({ where: { action: 'OPS_ROTATION_CELL_CHANGED' }, orderBy: { createdAt: 'desc' } });
  expect(JSON.parse(audit.metadata)).toMatchObject({ oldPlanId: fixturePlan.id, newPlanId: result.plan.id, fromPositionId: cell.currentPositionId, toPositionId: 'BREAK', monthlyScheduleUnchanged: true });
  expect(await unrelatedSnapshot()).toEqual(untouched);
  await page.reload({ waitUntil: 'networkidle' }); await openEditor(page);
  await expect(page.getByRole('combobox', { name: cellLabel(cell), exact: true })).toBeDisabled();
  await expect(page.getByRole('combobox', { name: cellLabel(cell), exact: true })).toHaveAttribute('title', reasons.BREAK);
});

test('toolbar permission guards preserve print/PDF alternatives and deny unauthorized edits or sharing', async ({ page }) => {
  assertIsolatedEnvironment(); const { config } = await readConfig(db);
  const original = structuredClone(config.accounts[adminId].overrides || {});
  const denied = ['rotations.assign', 'rotations.create', 'roster.print', 'roster.pdf', 'roster.share'];
  async function setOverrides(values) {
    const { config: latest } = await readConfig(db);
    latest.accounts[adminId].overrides = values; latest.revision++;
    await db.systemSetting.update({ where: { key: KEY }, data: { value: JSON.stringify(latest) } });
  }
  try {
    await setOverrides({ ...original, ...Object.fromEntries(denied.map(permission => [permission, null])) });
    await openRoster(page);
    const toolbar = page.locator('[data-roster-toolbar]');
    for (const name of ['Print', 'Generate random rotation', 'Edit rotations', 'WhatsApp', 'Copy to Clipboard']) {
      const control = toolbar.getByRole('button', { name, exact: true });
      await expect(control).toBeDisabled(); await expect(control).toHaveAttribute('title', 'You do not have permission for this action');
    }
    await expect(toolbar.getByRole('button', { name: 'Tomorrow', exact: true })).toBeEnabled();
    await expect(toolbar.getByRole('link', { name: 'Settings', exact: true })).toHaveAttribute('href', '/settings?tab=template');
    const forbidden = await page.request.post('/api/operations/daily', { data: { action: 'changeRotationCell', date, branch, employeeId: fixtureCell.employeeId, startTime: fixtureCell.startTime, endTime: fixtureCell.endTime, operationalPositionId: 'BREAK', reason: 'Denied edit must never save' } });
    expect(forbidden.status()).toBe(403);
    const forbiddenGeneration = await page.request.post('/api/operations/daily', { data: { action: 'generateRotation', date, branch, confirmed: true, reason: 'Denied generation must never save' } });
    expect(forbiddenGeneration.status()).toBe(403);
    await setOverrides({ ...original, ...Object.fromEntries(denied.map(permission => [permission, null])), 'roster.pdf': 'ALL' });
    await page.reload({ waitUntil: 'networkidle' });
    await expect(toolbar.getByRole('button', { name: 'Print', exact: true })).toBeEnabled();
    await expect(toolbar.getByRole('button', { name: 'Edit rotations', exact: true })).toBeDisabled();
  } finally { await setOverrides(original); }
});
