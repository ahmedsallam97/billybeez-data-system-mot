const test = require('node:test');
const assert = require('node:assert/strict');
const {
  SETTINGS_PAGES, TEMPLATE_SECTIONS, PERFORMANCE_SECTIONS,
  settingsNavigationGroups, settingsPath, legacySettingsPath,
} = require('../lib/operations/settings-routes');

test('top Settings navigation reuses each enabled route once with its existing permission', () => {
  const groups = settingsNavigationGroups({ 'settings.view': 'ALL', 'users.view': 'ALL', 'roles.view': 'ALL', 'users.activity': 'ALL', 'audit.view': 'ALL' });
  assert.deepEqual(groups.map(group => group.id), ['general', 'operations', 'templates', 'performance', 'access']);
  const pages = groups.flatMap(group => group.pages);
  assert.equal(new Set(pages.map(page => page.href)).size, pages.length);
  const expected = SETTINGS_PAGES.flatMap(row => {
    const sections = row[0] === 'live-editors' ? TEMPLATE_SECTIONS : row[0] === 'performance-settings' ? PERFORMANCE_SECTIONS : null;
    return sections ? sections.map(section => [settingsPath(row[0], section[0]), row[5]]) : [[settingsPath(row[0]), row[5]]];
  }).concat([['/operations/log', 'audit.view']]);
  assert.deepEqual(pages.map(page => [page.href, page.permission]).sort(), expected.sort());
  assert.deepEqual(groups.find(group => group.id === 'templates').pages.map(page => page.href), [
    '/opmanager/settings/live-editors/roster', '/opmanager/settings/live-editors/monthly', '/opmanager/settings/live-editors/hall',
  ]);
  assert.ok(pages.filter(page => page.href.startsWith('/opmanager/settings/')).every(page => page.persist === 'dashboard-ui'));
});

test('authorization filters whole groups and independent Access destinations', () => {
  assert.deepEqual(settingsNavigationGroups({}), []);
  for (const [permission, destination] of [
    ['users.view', '/opmanager/settings/access'], ['roles.view', '/opmanager/settings/roles'],
    ['users.activity', '/opmanager/settings/account-activity'], ['audit.view', '/operations/log'],
  ]) {
    const groups = settingsNavigationGroups({ [permission]: 'ALL' });
    assert.equal(groups.length, 1);
    assert.equal(groups[0].id, 'access');
    assert.deepEqual(groups[0].pages.map(page => page.href), [destination]);
  }
  const settingsOnly = settingsNavigationGroups({ 'settings.view': 'ALL' });
  assert.deepEqual(settingsOnly.map(group => group.id), ['general', 'operations', 'templates', 'performance']);
});

test('existing Settings alias destinations and filter compatibility stay intact', () => {
  assert.equal(legacySettingsPath(new URLSearchParams('category=recognition&year=2026')), '/opmanager/settings/live-editors/monthly?year=2026');
  assert.equal(legacySettingsPath({ category: 'access', accessTab: 'roles', branch: 'MOT' }), '/opmanager/settings/roles?branch=MOT');
  assert.equal(legacySettingsPath({ category: 'performance-settings', section: 'appraisal', branch: 'MOT' }), '/opmanager/settings/performance-settings/appraisal?branch=MOT');
  assert.equal(legacySettingsPath({ category: 'template', employeeId: '123' }), '/opmanager/settings/live-editors/roster?employeeId=123');
});
