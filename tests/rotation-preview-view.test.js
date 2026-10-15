const test = require('node:test'), assert = require('node:assert/strict');
const { applicationState, issueGroups, unusedGroups, exclusionGroups, rosterShifts, previewMetrics, locationName } = require('../lib/operations/rotation-preview-view');
const slot = (startTime, endTime, shiftCode = 'AM') => ({ startTime, endTime, shiftCode });
const base = () => ({ canApply: true, assignments: [{ employeeId: 'a', operationalPositionId: 'play', positionCode: 'PLAY', shiftCode: 'AM', startTime: '10:00', endTime: '11:00', source: 'AUTO' }], slots: [slot('10:00', '11:00'), slot('11:00', '12:00'), slot('13:00', '14:00')], employees: [{ id: 'a', name: 'Ali', shift: 'AM' }], locations: [{ id: 'play', code: 'PLAY', label: 'Playground', labelAr: 'منطقة اللعب' }], coverage: [], alerts: [], unassigned: [], excluded: [], breaks: [], protectedCount: 0 });
test('preview readiness mirrors existing apply checks without making partial shortages a new blocker', () => {
  const preview = base(); assert.equal(applicationState(preview).status, 'READY');
  preview.alerts = [{ code: 'POSITION_SHORTAGE', severity: 'CRITICAL' }, { code: 'VALID_LOCATION_CAPACITY_BLOCKED', severity: 'CRITICAL' }]; assert.equal(applicationState(preview).status, 'WARNINGS');
  for (const code of ['PHYSICAL_LOCATION_CONFLICT', 'HANDOVER_BREAK_CONFLICT', 'HANDOVER_SUPPORT_CONFLICT', 'DATA_EXIT_COVERAGE_CONFLICT']) assert.equal(applicationState({ ...preview, alerts: [{ code }] }).status, 'BLOCKED');
  assert.equal(applicationState({ ...preview, canApply: false }).reason, 'ROSTER_PROTECTED');
  assert.equal(applicationState({ ...preview, assignments: [{ ...preview.assignments[0], preserved: true }] }).reason, 'NO_AUTOMATIC_ASSIGNMENTS');
});
test('consecutive identical warnings merge into ranges while separate hours and staffing numbers stay separate', () => {
  const preview = base(); preview.alerts = [
    { code: 'POSITION_SHORTAGE', shiftCode: 'AM', positionCode: 'PLAY', startTime: '10:00', shortage: 1 },
    { code: 'POSITION_SHORTAGE', shiftCode: 'AM', positionCode: 'PLAY', startTime: '11:00', shortage: 1 },
    { code: 'POSITION_SHORTAGE', shiftCode: 'AM', positionCode: 'PLAY', startTime: '13:00', shortage: 1 },
    { code: 'POSITION_SHORTAGE', shiftCode: 'AM', positionCode: 'PLAY', startTime: '11:00', shortage: 2 },
  ]; const groups = issueGroups(preview); assert.equal(groups.length, 3); assert.deepEqual([groups[0].startTime, groups[0].endTime, groups[0].count], ['10:00', '12:00', 2]);
});
test('breaks are clearly distinct from unused employee time and do not cause a warning acknowledgment alone', () => {
  const preview = base(); preview.alerts = [{ code: 'UNASSIGNED_EMPLOYEES' }]; preview.unassigned = [{ employeeId: 'a', shift: 'AM', startTime: '11:00', endTime: '12:00', reason: 'BREAK' }]; preview.breaks = [{ employeeId: 'a', startTime: '11:00', endTime: '12:00', status: 'PLANNED' }];
  assert.equal(applicationState(preview).status, 'READY'); assert.equal(issueGroups(preview).length, 0); assert.equal(unusedGroups(preview).length, 0);
  assert.equal(rosterShifts(preview)[0].cells[0].slots[1].breakRow.status, 'PLANNED'); assert.equal(previewMetrics(preview).breakHours, 1);
  preview.unassigned.push({ employeeId: 'a', shift: 'AM', startTime: '13:00', endTime: '14:00', reason: 'NO_ELIGIBLE_CAPACITY' }); assert.equal(applicationState(preview).status, 'WARNINGS'); assert.equal(previewMetrics(preview).unusedHours, 1);
});
test('protected cells, required coverage, friendly labels and metrics retain the source response unchanged', () => {
  const preview = base(); preview.assignments.push({ ...preview.assignments[0], startTime: '11:00', endTime: '12:00', source: 'MANUAL', preserved: true, manualLock: true }); preview.protectedCount = 1;
  preview.coverage.push({ shift: 'AM', positionId: 'play', positionCode: 'PLAY', required: true, shortage: 2, startTime: '13:00', endTime: '14:00' });
  const snapshot = structuredClone(preview), grid = rosterShifts(preview); assert.equal(grid[0].cells[0].slots[1].protected, true); assert.equal(grid[0].shortages[0].shortage, 2); assert.equal(locationName(preview, 'PLAY', true), 'منطقة اللعب'); assert.equal(locationName(preview, 'play'), 'Playground'); assert.equal(previewMetrics(preview).proposedHours, 1); assert.equal(previewMetrics(preview).shortageHours, 2); assert.deepEqual(preview, snapshot);
});
test('exclusions are deduplicated into configured groups including independent wrong-shift locations', () => {
  const preview = base(); preview.locations.push({ id: 'night', code: 'NIGHT', label: 'Night only' }); preview.distributions = { rules: [{ id: 'zero', positionId: 'play', shift: 'AM', enabled: false, rank: 0 }, { id: 'night', positionId: 'night', shift: 'PM', enabled: true, rank: 1 }] };
  preview.excluded = [{ shift: 'AM', ruleId: 'zero', positionCode: 'PLAY', reason: 'DISABLED' }, { shift: 'AM', ruleId: 'zero', positionCode: 'PLAY', reason: 'DISABLED' }, { shift: 'AM', positionCode: 'OLD', reason: 'ARCHIVED' }, { shift: 'AM', positionCode: 'COMPOUND', reason: 'COMPONENT_ARCHIVED' }];
  const groups = exclusionGroups(preview); assert.equal(groups.find(row => row.category === 'PRIORITY_ZERO').locations.length, 1); assert.equal(groups.find(row => row.category === 'ARCHIVED').locations.length, 1); assert.equal(groups.find(row => row.category === 'INVALID_COMPOUND').locations.length, 1); assert.equal(groups.find(row => row.category === 'WRONG_SHIFT').locations[0].positionCode, 'NIGHT');
});
