// Creates synthetic data from an EMPTY schema. Never opens or copies a workplace DB.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { randomBytes } = require('node:crypto');
const bcrypt = require('bcryptjs');
const { DatabaseSync } = require('node:sqlite');
const { PrismaClient } = require('@prisma/client');
const BRANCH = 'TEST', DATE = '2098-06-15', START = '2098-06-01';

function destination(input) {
  if (!input || !path.isAbsolute(input)) throw new Error('An explicit absolute NEW generation path is required');
  const target = path.resolve(input), repo = fs.realpathSync(path.resolve(__dirname, '../..'));
  const existingParent = fs.realpathSync(path.dirname(target));
  const resolved = path.join(existingParent, path.basename(target));
  if (resolved.toLowerCase() === repo.toLowerCase() || resolved.toLowerCase().startsWith(repo.toLowerCase() + path.sep)) throw new Error('Sanitized generation must be outside the source workspace');
  if (fs.existsSync(resolved)) throw new Error('Destination already exists; refusing reset, overwrite or reuse');
  return resolved;
}

async function prepare(input) {
  const root = destination(input), database = path.join(root, 'database/operations.db');
  fs.mkdirSync(path.dirname(database), { recursive: true });
  fs.mkdirSync(path.join(root, 'employee-files'));
  // Windows schema engine expects an existing SQLite file at an absolute URI.
  new DatabaseSync(database).close();
  const databaseUrl = 'file:' + database.replaceAll('\\', '/');
  // db push initializes only the committed model schema. It never invokes seed.js.
  const schema = spawnSync(process.execPath, [require.resolve('prisma/build/index.js'), 'db', 'push', '--skip-generate', '--schema', path.resolve(__dirname, '../../prisma/schema.prisma')], {
    cwd: path.resolve(__dirname, '../..'), env: { ...process.env, DATABASE_URL: databaseUrl, DATABASE_PROVIDER: 'sqlite' }, encoding: 'utf8', windowsHide: true,
  });
  if (schema.status !== 0) throw new Error('Empty schema initialization failed: ' + String(schema.stderr || schema.stdout).slice(-2000));
  require('../../scripts/migrate-operations-sqlite').migrate(database);
  const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const fixture = { schemaVersion: 1, kind: 'SYNTHETIC_SANITIZED_PILOT', branch: BRANCH, date: DATE, year: 2098, month: 6, source: 'EMPTY_COMMITTED_SCHEMA', workplaceRecordsCopied: 0, workplaceConfigurationCopied: 0, recordsAreTestOnly: true };
  try {
    const set = (key, value) => db.systemSetting.create({ data: { key, value: JSON.stringify(value), description: 'TEST ONLY — sanitized pilot fixture' } });
    await set('OPS_BRANCH_CONFIG', { branchCode: BRANCH, branchName: 'TEST ONLY — Sanitized Pilot', timezone: 'UTC', sanitizedPilot: true });
    const raw = [];
    for (const label of ['SETUP ADMIN', 'INDEPENDENT REVIEWER']) raw.push(await db.user.create({ data: { name: 'TEST ONLY ' + label, username: 'test-only-' + label.toLowerCase().replaceAll(' ', '-'), password: bcrypt.hashSync(randomBytes(32).toString('base64url'), 12), role: 'ADMIN', active: true } }));
    const accounts = require('../../lib/accounts/service');
    await accounts.migrateAccounts(db);
    // The compatibility migration may supply a primary-account display label.
    // Replace every generated profile name with the synthetic user name.
    const accessRow = await db.systemSetting.findUnique({ where: { key: 'ACCOUNT_ACCESS_CONFIG' } });
    const access = JSON.parse(accessRow.value);
    for (const row of raw) access.accounts[row.id].displayName = row.name;
    await db.systemSetting.update({ where: { key: accessRow.key }, data: { value: JSON.stringify(access) } });
    const admin = await accounts.loadAccount(db, raw[0]), reviewer = await accounts.loadAccount(db, raw[1]);
    const employees = [];
    for (let i = 0; i < 8; i++) {
      const shift = i < 4 ? 'AM' : 'PM', local = i % 4;
      const employee = await db.employee.create({ data: { name: 'TEST ONLY Operator ' + String(i + 1).padStart(2, '0'), nameEn: 'TEST ONLY Operator ' + String(i + 1).padStart(2, '0'), nameAr: 'موظف تجريبي فقط ' + (i + 1), operationalName: 'TEST Operator ' + (i + 1), branch: BRANCH, department: local === 0 ? 'CASHIER' : 'OPERATION', jobTitle: local === 0 ? 'Front Cashier' : 'TEST Operator', operationsTeamLeader: local === 1, hireDate: new Date(START), personalNotes: 'SYNTHETIC TEST RECORD — not a real employee' } });
      employees.push({ ...employee, shift });
    }
    fixture.employees = employees.map(row => ({ id: row.id, name: row.name, shift: row.shift }));
    for (const [index, [code, startTime, endTime]] of [['AM', '10:00', '18:00'], ['PM', '15:00', '23:00']].entries()) {
      await db.opsShiftDefinition.create({ data: { code, label: 'TEST ONLY ' + code, labelAr: 'شيفت تجريبي ' + code, startTime, endTime, colorKey: code, sortOrder: index + 1 } });
      await db.opsScheduleCode.create({ data: { code, label: 'TEST ONLY ' + code, category: 'WORKING', colorKey: code, countsAsWorking: true, sortOrder: index + 1 } });
    }
    const positions = [];
    for (const [code, order, active] of [['TEST_A', 1, true], ['TEST_B', 2, true], ['TEST_C', 3, true], ['TEST_ZERO', 0, true], ['TEST_ARCHIVED', 4, false]]) positions.push(await db.opsOperationalPosition.create({ data: { code, label: 'TEST ONLY ' + code, labelAr: 'موقع تجريبي ' + code, requiresQualification: false, active, sortOrder: order, color: '#dbeafe' } }));
    await set('OPS_CASHIER_CONFIG', { jobTitles: ['Front Cashier'], amEmployeeId: employees[0].id, pmEmployeeId: employees[4].id });
    await set('OPS_ROTATION_RULES', { slotsPerShift: 8, mandatoryPositionCodes: [], highlightedPositionCodes: [], excludeCashiers: true, earlyTripRule: { enabled: false } });
    const rules = ['AM', 'PM'].flatMap(shift => positions.map((position, index) => ({ id: 'TEST_' + shift + '_' + position.code, positionId: position.id, shift, enabled: (shift === 'AM' ? [0, 1] : [1, 2]).includes(index), rank: index === 3 ? 0 : index + 1, required: false, min: 0, target: 1, max: 1, roles: [], weekdays: [], qualificationRequired: false, effectiveFrom: START, effectiveTo: '2098-06-30', startTime: null, endTime: null })));
    await require('../../lib/operations/rotation-distributions').saveDistributions(db, { user: admin, branch: BRANCH, positions, value: { schemaVersion: 1, branch: BRANCH, rules, handover: { enabled: false, outgoingShift: 'AM', incomingShift: 'PM', breakMinutes: 60, supportPositionCodes: [] }, coverageBeforeDataExit: false }, expectedRevision: 0 });
    const schedule = await db.opsSchedule.create({ data: { year: 2098, month: 6, operationalYear: 2098, operationalMonth: 6, periodStart: START, periodEnd: '2098-06-30', version: 1, status: 'PUBLISHED', publishedAt: new Date() } });
    await set('OPS_SCHEDULE_STATE:' + schedule.id, { branch: BRANCH, revision: 0, dayResponsibilities: {} });
    for (const employee of employees) await db.opsScheduleAssignment.create({ data: { scheduleId: schedule.id, employeeId: employee.id, workDate: DATE, code: employee.shift, shiftCode: employee.shift, source: 'SYNTHETIC_SANITIZED_PILOT' } });
    fixture.scheduleId = schedule.id;

    const config = require('../../lib/operations/performance-settings-service');
    const state = await config.getPerformanceSettingsState(db, 'GLOBAL'), value = structuredClone(state.effective.value);
    // Deliberately different synthetic policy. No workplace rules are read or copied.
    value.evaluation.criteria = [{ code: 'TEST_SERVICE', label: 'TEST ONLY synthetic service', labelAr: 'خدمة تجريبية فقط', category: 'DAILY_EVALUATION', maxScore: 10, active: true, sortOrder: 1, reasons: [] }];
    value.monthlyAppraisal.formulaParameters = { dailyPerformance: 40, attendanceReliability: 30, recognition: 20, guestFeedback: 10 };
    value.monthlyAppraisal.employeeOfMonth.minimumDailyEvaluations = 1;
    value.monthlyAppraisal.employeeOfMonth.activeEmployeesOnly = true;
    value.rewards.performanceLevels = [{ code: 'TEST_PLUS_2', label: 'TEST ONLY +2', labelAr: 'تجريبي فقط +٢', points: 2, active: true, evidenceRequired: false, commentRequired: true, approvalRequired: true }, { code: 'TEST_ZERO', label: 'TEST ONLY 0', labelAr: 'تجريبي فقط صفر', points: 0, active: true, evidenceRequired: false, commentRequired: false, approvalRequired: false }];
    value.rewards.latenessBands = [];
    value.monthlyAppraisal.sources = require('../../lib/operations/performance-source-config').monthlySourceConfig();
    Object.assign(value.monthlyAppraisal.sources.recognition, { active: true, includedReportTypes: ['TRIP', 'BIRTHDAY', 'SHIFT_LEADERSHIP'], levels: [{ levelCode: 'TEST_PLUS_2', points: 2 }], monthlyCap: 8, branches: [BRANCH] });
    Object.assign(value.monthlyAppraisal.sources.guestFeedback, { active: true, eligibleTemplates: ['TEST_TRIP_SURVEY', 'TEST_BIRTHDAY_SURVEY'], includeDirectFeedback: false, ratingMinimum: 0, ratingMaximum: 4, minimumResponses: 1, branches: [BRANCH] });
    value.processTemplates = ['TRIP', 'BIRTHDAY', 'SHIFT_LEADERSHIP'].map(type => ({ code: 'TEST_' + type + '_PROCESS', reportType: type, version: 1, active: true, label: 'TEST ONLY ' + type + ' checklist', labelAr: 'قائمة تجريبية فقط', instructions: 'SYNTHETIC DEMONSTRATION ONLY — not a workplace process', instructionsAr: 'عرض تجريبي فقط', branches: [BRANCH], effectiveFrom: START, effectiveTo: null, steps: [{ code: 'TEST_CHECK', order: 1, active: true, label: 'TEST ONLY check', labelAr: 'تحقق تجريبي فقط', instructions: 'Synthetic example', instructionsAr: 'مثال تجريبي', required: true, responsibleEmployeeRequired: false, evidenceRequired: false, branches: [BRANCH] }] }));
    value.surveyTemplates = ['TRIP', 'BIRTHDAY'].map(type => ({ code: 'TEST_' + type + '_SURVEY', reportType: type, version: 1, active: true, label: 'TEST ONLY synthetic rating', labelAr: 'تقييم تجريبي فقط', paperImageRequired: false, branches: [BRANCH], effectiveFrom: START, effectiveTo: null, questions: [{ code: 'TEST_RATING', order: 1, active: true, text: 'TEST ONLY demonstration rating', textAr: 'درجة عرض تجريبي فقط', required: true, choices: [{ code: 'TEST_GOOD', label: 'TEST ONLY good', labelAr: 'تجريبي جيد', numericValue: 3, active: true, order: 1, commentRequired: false, followUpSuggested: false }, { code: 'TEST_POOR', label: 'TEST ONLY poor', labelAr: 'تجريبي ضعيف', numericValue: 0, active: true, order: 2, commentRequired: false, followUpSuggested: false }] }] }));
    value.staffing.requireAvailability = true;
    value.succession.paths = []; value.succession.competencies = [];
    Object.assign(value.shiftLeadership, { active: true, enabledBranches: [BRANCH], selectedDates: [DATE], requiredWeekdays: [], shiftCodes: ['AM', 'PM'], automaticReportCreation: true });
    let saved = await config.changePerformanceSettings(db, { user: admin, scope: 'GLOBAL', action: 'saveDraft', expectedRevision: state.revision, value, reason: 'TEST ONLY synthetic sanitized pilot configuration' });
    await config.changePerformanceSettings(db, { user: admin, scope: 'GLOBAL', action: 'publish', expectedRevision: saved.state.revision, effectiveFrom: START, reason: 'TEST ONLY synthetic future demonstration configuration' });
    const effective = await config.getEffectivePerformanceSettings(db, { branch: BRANCH, date: DATE });
    await db.opsEotmFormulaVersion.create({ data: { code: 'TEST_ONLY_EOTM_2098', label: 'TEST ONLY synthetic award policy', effectiveFrom: START, effectiveTo: '2098-06-30', active: true, configJson: JSON.stringify({ minimumAppraisalScore: 0, synthetic: true, demonstrationOnly: true }) } });
    const evaluationDay = await db.opsDailyEvaluationDay.create({ data: { evaluationDate: DATE, criteriaVersionId: effective.value.evaluation.criteriaVersionId, status: 'CLOSED', teamNote: 'TEST ONLY synthetic daily evaluations', closedBy: admin.id, closedAt: new Date() } });
    await config.capturePerformanceSettingsSnapshot(db, { kind: 'EVALUATION_DAY', recordId: evaluationDay.id, branch: BRANCH, date: DATE });
    const attendance = await db.opsAttendanceDay.create({ data: { workDate: DATE, status: 'FINALIZED' } });
    for (const employee of employees) {
      await db.opsAttendanceRecord.create({ data: { attendanceDayId: attendance.id, employeeId: employee.id, status: 'PRESENT', expectedCode: employee.shift, note: 'TEST ONLY synthetic attendance', lateMinutes: 0 } });
      await db.opsEmployeeDailyEvaluation.create({ data: { dailyEvaluationDayId: evaluationDay.id, employeeId: employee.id, maxScore: 10, finalScore: 8, status: 'REVIEWED', supervisorNote: 'TEST ONLY synthetic rating' } });
    }
    const trip = await db.opsDailyTrip.create({ data: { branch: BRANCH, workDate: DATE, name: 'TEST ONLY synthetic school booking', startTime: '10:00', endTime: '12:00', expectedChildren: 12, notes: 'SYNTHETIC TEST BOOKING — not a real guest event' } });
    const birthday = await db.opsDailyEvent.create({ data: { branch: BRANCH, workDate: DATE, eventType: 'BIRTHDAY', name: 'TEST ONLY synthetic birthday', childName: 'TEST ONLY child', startTime: '16:00', endTime: '18:00', expectedGuests: 8, notes: 'SYNTHETIC TEST BOOKING' } });
    fixture.tripId = trip.id; fixture.birthdayId = birthday.id;
    const duties = require('../../lib/operations/day-responsibilities');
    const loaded = await duties.loadResponsibilities(db, admin, { branch: BRANCH, date: DATE, scheduleId: schedule.id });
    const selected = await duties.saveResponsibilities(db, admin, { branch: BRANCH, date: DATE, scheduleId: schedule.id, expectedRevision: loaded.previous.state.revision, values: { AM: employees[1].id, PM: employees[5].id, TRIP: employees[1].id, BIRTHDAY: employees[5].id } });
    fixture.shiftReportIds = selected.leadershipReports.created;
    const reports = require('../../lib/operations/operational-report-service');
    let report = await reports.changeOperationalReport(db, { user: admin, action: 'create', reportType: 'TRIP', sourceId: trip.id, branch: BRANCH, surveyTemplateCode: 'TEST_TRIP_SURVEY', draft: { participants: [{ employeeId: employees[1].id, primaryLeader: true }], steps: [{ code: 'TEST_CHECK', completed: true }], survey: { answers: [{ questionCode: 'TEST_RATING', choiceCode: 'TEST_GOOD' }] }, adjustments: [{ employeeId: employees[1].id, levelCode: 'TEST_PLUS_2', comment: 'TEST ONLY synthetic approved award', evidence: [] }] } });
    report = await reports.changeOperationalReport(db, { user: reviewer, action: 'approve', id: report.report.id, expectedRevision: report.report.revision, reason: 'TEST ONLY independent synthetic report review' });
    fixture.approvedTripReportId = report.report.id;
    const draft = await reports.changeOperationalReport(db, { user: admin, action: 'create', reportType: 'BIRTHDAY', sourceId: birthday.id, branch: BRANCH, surveyTemplateCode: 'TEST_BIRTHDAY_SURVEY' });
    fixture.birthdayReportId = draft.report.id;
    const summary = await require('../../lib/operations/monthly-summary').previewMonthlyAppraisal(db, { employeeId: employees[1].id, branch: BRANCH, year: 2098, month: 6 });
    if (summary.summary.sourceEvidence.recognition.score !== 25 || summary.summary.sourceEvidence.guestFeedback.score !== 75 || summary.result.totalScore !== 82.5) throw new Error('Synthetic daily/monthly source fixture verification failed');
    const calculated = await require('../../lib/operations/appraisal-calculation').calculateAndStoreAppraisal(db, { user: admin, branch: BRANCH, employeeId: employees[1].id, year: 2098, month: 6, reason: 'TEST ONLY synthetic monthly flow demonstration' });
    fixture.monthlyAppraisalId = calculated.appraisal.id;
    fixture.sourceEmployeeId = employees[1].id;
    fixture.formulaVersionId = effective.value.monthlyAppraisal.formulaVersionId;
    fixture.sourceVerification = { rawDailyScore: 8, derivedDailyScore: 10, maximumDailyScore: 10, recognition: 25, guestFeedback: 75, syntheticWeights: value.monthlyAppraisal.formulaParameters, monthlyResult: 82.5, monthlyStatus: 'DRAFT' };
    await set('SANITIZED_PILOT_FIXTURE', fixture);
    await db.auditLog.create({ data: { userId: admin.id, action: 'SANITIZED_PILOT_CREATED', summary: 'TEST ONLY pilot created from empty schema without workplace data or configuration', metadata: JSON.stringify({ source: fixture.source, workplaceRecordsCopied: 0, workplaceConfigurationCopied: 0 }) } });
    await db.$disconnect();
    const sql = new DatabaseSync(database);
    try {
      if (sql.prepare('PRAGMA integrity_check').get().integrity_check !== 'ok' || sql.prepare('PRAGMA foreign_key_check').all().length) throw new Error('Sanitized database integrity failed');
      fixture.tableCount = sql.prepare("SELECT count(*) AS count FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").get().count;
      if (sql.prepare('SELECT count(*) AS count FROM EmployeeDocument').get().count) throw new Error('Sanitized fixture must contain no employee files');
    } finally { sql.close(); }
    fs.writeFileSync(path.join(root, '.operations-pilot-volume'), JSON.stringify({ stage: 'pilot', sanitized: true, source: 'EMPTY_COMMITTED_SCHEMA', createdAt: new Date().toISOString() }), { flag: 'wx' });
    fs.writeFileSync(path.join(root, 'sanitized-fixture.json'), JSON.stringify(fixture, null, 2), { flag: 'wx' });
    return fixture;
  } finally { await db.$disconnect(); }
}
if (require.main === module) prepare(process.argv[2]).then(result => console.log(JSON.stringify({ sanitized: true, branch: result.branch, date: result.date, employees: result.employees.length, tables: result.tableCount, sourceVerification: result.sourceVerification, workplaceRecordsCopied: 0, workplaceConfigurationCopied: 0 }, null, 2))).catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { destination, prepare };
