const test = require('node:test'), assert = require('node:assert/strict');
const { authorizedReportIds, filterReportEvidence, redactReportEvidence } = require('../lib/operations/report-evidence-access');
const { defaultPerformanceSettings } = require('../lib/operations/performance-settings-config');

function report(id, reportType, employeeIds, branch = 'SOURCE') {
  return { schemaVersion: 1, id, reportType, branch, status: 'APPROVED', revision: 1, workDate: '2093-02-04', updatedAt: '2093-02-04T12:00:00Z', source: { id: 'booking-' + id }, history: [], configSnapshot: { effective: { value: defaultPerformanceSettings() } }, draft: { participants: employeeIds.map(employeeId => ({ employeeId })), steps: [], adjustments: [] } };
}

function permissionFixture() {
  const permissions = { 'reports.view': 'ALL', 'trips.view': 'TEAM', 'leadership.view': 'ALL' };
  const profile = { roleId: 'role-1', dataScope: 'ALL', allBranches: false, branches: ['SOURCE'], teamIds: ['allowed'], forcePasswordChange: false, archivedAt: null, overrides: {} };
  const actor = { id: 'reader', role: 'ADMIN', active: true, employeeId: null };
  const config = { version: 1, roles: [{ id: 'role-1', name: 'Super Admin', active: true, permissions }], accounts: { reader: profile } };
  const reports = [report('trip-visible', 'TRIP', ['allowed']), report('trip-denied-team', 'TRIP', ['other']), report('birthday-denied-module', 'BIRTHDAY', ['allowed']), report('shift-visible', 'SHIFT_LEADERSHIP', ['allowed']), report('wrong-branch', 'TRIP', ['allowed'], 'OTHER')];
  const db = {
    user: { findUnique: async () => actor },
    employee: { findMany: async ({ where }) => (where?.id?.in || ['allowed', 'other']).map(id => ({ id, branch: 'SOURCE' })) },
    opsSchedule: { findMany: async () => [] },
    systemSetting: {
      findUnique: async ({ where: { key } }) => ({ value: JSON.stringify(key === 'ACCOUNT_ACCESS_CONFIG' ? config : { branchCode: 'SOURCE' }) }),
      findMany: async ({ where }) => where.key.startsWith === 'OPS_OPERATIONAL_REPORT:' ? reports.map(row => ({ key: 'OPS_OPERATIONAL_REPORT:' + row.id, value: JSON.stringify(row) })) : [],
    },
  };
  return { db, user: { ...actor, profile, permissions } };
}

test('source visibility reuses real report module, employee-team and branch authorization', async () => {
  const { db, user } = permissionFixture();
  assert.deepEqual([...await authorizedReportIds(db, user, { branch: 'SOURCE' })].sort(), ['shift-visible', 'trip-visible']);
  assert.deepEqual([...await authorizedReportIds(db, user, { branch: 'OTHER' })], []);
  const denied = await authorizedReportIds({}, { permissions: { 'evaluations.view': 'ALL' } });
  assert.equal(denied.size, 0);
});

test('evaluation numeric scores survive while denied report adjustments and encoded monthly evidence are removed', async () => {
  const { db, user } = permissionFixture();
  const allowed = { id: 'award-visible', sourceReportId: 'trip-visible', points: 3, scoreSnapshot: { label: 'Visible award' } };
  const denied = { id: 'award-private', sourceReportId: 'birthday-denied-module', points: 2, scoreSnapshot: { comment: 'Restricted source details' } };
  const sourceEvents = [{ sourceType: 'OPERATIONAL_REPORT', sourceId: 'birthday-denied-module', metrics: { processReliability: 100 } }, { sourceType: 'RECOGNITION', sourceId: 'award-visible', sourceSnapshot: { reportId: 'trip-visible' } }];
  const payload = { employee: { dailyEvaluations: [{ finalScore: 45, baseFinalScore: 40, eventImpact: { points: 5, appliedPoints: 5, finalScore: 45, sourceAdjustments: [allowed, denied] } }], monthlyAppraisals: [{ totalScore: 90, sourceSnapshotJson: JSON.stringify({ sourceEvents }) }] }, monthlyView: { rows: [{ sourceEvidence: { recognition: { score: 50, mode: 'AUTOMATIC', sources: [{ reportId: 'trip-visible', score: 30 }, { reportId: 'birthday-denied-module', score: 20 }] } } }] } };
  const result = await redactReportEvidence(db, user, payload, { branch: 'SOURCE' });
  assert.equal(result.employee.dailyEvaluations[0].finalScore, 45); assert.equal(result.employee.dailyEvaluations[0].eventImpact.points, 5);
  assert.deepEqual(result.employee.dailyEvaluations[0].eventImpact.sourceAdjustments, [allowed]);
  assert.equal(result.employee.monthlyAppraisals[0].totalScore, 90); assert.equal(JSON.parse(result.employee.monthlyAppraisals[0].sourceSnapshotJson).sourceEvents.length, 1);
  const evidence = result.monthlyView.rows[0].sourceEvidence.recognition; assert.equal(evidence.score, 50); assert.equal(evidence.sourceRecordCount, 2); assert.equal(evidence.restrictedSourceCount, 1);
  assert.ok(!JSON.stringify(result).includes('Restricted source details')); assert.ok(!JSON.stringify(result).includes('birthday-denied-module'));
  assert.equal(payload.employee.dailyEvaluations[0].eventImpact.sourceAdjustments.length, 2, 'stored/input evidence remains unchanged');
});

test('users without report access receive aggregate results but no nested live or frozen event evidence', () => {
  const snapshot = { monthlySummary: { finalResult: 90, dailyDetails: [{ eventImpact: { finalScore: 45, sourceAdjustments: [{ sourceReportId: 'hidden', points: 5 }] } }], sourceEvidence: { guestFeedback: { score: 75, responseCount: 2, mode: 'AUTOMATIC', sources: [{ reportId: 'hidden', answers: [{ numericValue: 4 }] }] } } } };
  const result = filterReportEvidence({ sourceSnapshotJson: JSON.stringify(snapshot) }, new Set());
  const summary = JSON.parse(result.sourceSnapshotJson).monthlySummary;
  assert.equal(summary.finalResult, 90); assert.equal(summary.sourceEvidence.guestFeedback.score, 75); assert.equal(summary.sourceEvidence.guestFeedback.responseCount, 2);
  assert.deepEqual(summary.dailyDetails[0].eventImpact.sourceAdjustments, []); assert.deepEqual(summary.sourceEvidence.guestFeedback.sources, []);
  assert.ok(!result.sourceSnapshotJson.includes('hidden'));
});
