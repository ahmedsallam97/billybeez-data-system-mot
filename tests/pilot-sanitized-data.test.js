const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { DatabaseSync } = require('node:sqlite');
const { destination, prepare } = require('../deploy/pilot/prepare-sanitized-data.cjs');

test('sanitized generation refuses relative, workspace, existing and redirected workspace destinations', () => {
  const repo = path.resolve(__dirname, '..'), root = fs.mkdtempSync(path.join(os.tmpdir(), 'bb-sanitized-guard-'));
  assert.throws(() => destination(), /absolute NEW/);
  assert.throws(() => destination('relative'), /absolute NEW/);
  assert.throws(() => destination(path.join(repo, 'forbidden-sanitized-data')), /outside the source workspace/);
  assert.throws(() => destination(root), /already exists/);
  assert.equal(destination(path.join(root, 'new-generation')), path.join(fs.realpathSync(root), 'new-generation'));
});

test('empty-schema sanitized generation has only synthetic future data, test policies, no files and verified numeric evidence', { timeout: 90000 }, async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bb-sanitized-verify-'));
  const generation = path.join(root, 'generation'), fixture = await prepare(generation);
  assert.equal(fixture.source, 'EMPTY_COMMITTED_SCHEMA');
  assert.equal(fixture.workplaceRecordsCopied, 0); assert.equal(fixture.workplaceConfigurationCopied, 0);
  assert.equal(fixture.tableCount, 78); assert.equal(fixture.employees.length, 8);
  assert.deepEqual(fixture.sourceVerification.syntheticWeights, { dailyPerformance: 40, attendanceReliability: 30, recognition: 20, guestFeedback: 10 });
  assert.equal(fixture.sourceVerification.monthlyResult, 82.5);
  assert.deepEqual(fs.readdirSync(path.join(generation, 'employee-files')), []);
  const db = new DatabaseSync(path.join(generation, 'database/operations.db'));
  try {
    assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
    for (const row of db.prepare('SELECT name,branch,nationalId,phone,address FROM Employee').all()) {
      assert.match(row.name, /^TEST ONLY/); assert.equal(row.branch, 'TEST');
      for (const key of ['nationalId', 'phone', 'address']) assert.equal(row[key], null);
    }
    for (const row of db.prepare('SELECT name FROM User').all()) assert.match(row.name, /^TEST ONLY/);
    const access = JSON.parse(db.prepare('SELECT value FROM SystemSetting WHERE key=?').get('ACCOUNT_ACCESS_CONFIG').value);
    for (const row of Object.values(access.accounts)) assert.match(row.displayName, /^TEST ONLY/);
    for (const table of ['EmployeeDocument', 'EmployeeQualification', 'EmployeeGuestFeedback', 'EmployeeGuidanceRecord', 'EmployeeIncident', 'Order', 'OpsEotmCompetition']) assert.equal(db.prepare('SELECT count(*) AS count FROM "' + table + '"').get().count, 0);
    for (const [table, field] of [['OpsDailyTrip','workDate'], ['OpsDailyEvent','workDate'], ['OpsAttendanceDay','workDate'], ['OpsDailyEvaluationDay','evaluationDate'], ['OpsScheduleAssignment','workDate']]) {
      const rows = db.prepare('SELECT ' + field + ' AS date FROM ' + table).all(); assert.ok(rows.length);
      for (const row of rows) assert.equal(row.date, '2098-06-15');
    }
    const reports = db.prepare('SELECT value FROM SystemSetting WHERE key LIKE ?').all('OPS_OPERATIONAL_REPORT:%').map(row => JSON.parse(row.value));
    assert.equal(reports.length, 4);
    for (const report of reports) {
      assert.equal(report.branch, 'TEST'); assert.equal(report.workDate, '2098-06-15');
      assert.match(report.configSnapshot.processTemplate.code, /^TEST_/);
      assert.deepEqual(report.configSnapshot.processTemplate.steps.map(row => row.code), ['TEST_CHECK']);
      if (report.configSnapshot.surveyTemplate) assert.match(report.configSnapshot.surveyTemplate.code, /^TEST_/);
    }
    assert.equal(db.prepare('SELECT count(*) AS count FROM OpsEotmFormulaVersion WHERE code=?').get('TEST_ONLY_EOTM_2098').count, 1);
  } finally { db.close(); }
  await assert.rejects(prepare(generation), /already exists/);
});
