const test = require("node:test");
const assert = require("node:assert/strict");
const { defaultPerformanceSettings } = require("../lib/operations/performance-settings-config");
const {
  REPORT_PREFIX,
  changeOperationalReport,
  calculateAndStoreSuitability,
  ensureAutomaticShiftLeadershipReports,
  getApprovedEventAdjustments,
  getOperationalReports,
  prepareOperationalReport,
} = require("../lib/operations/operational-report-service");

function copy(value) { return value == null ? value : JSON.parse(JSON.stringify(value)); }

function configuredSettings(points = 1) {
  const value = defaultPerformanceSettings({
    criteria: { id: "criteria-v1", criteria: [{ code: "SAFETY", label: "Safety", category: "DAILY", maxScore: 10, active: true, sortOrder: 1, reasons: [] }] },
    appraisalFormula: { id: "formula-v1", code: "FORMULA", label: "Formula", effectiveFrom: "2026-01-01", configJson: JSON.stringify({ dailyPerformance: 100 }) },
  });
  value.processTemplates = [{
    code: "TRIP_PROCESS", reportType: "TRIP", version: 1, active: true, label: "Trip", labelAr: "رحلة", instructions: "", instructionsAr: "", branches: ["*"], effectiveFrom: "2026-01-01", effectiveTo: null,
    steps: [{ code: "DELIVERY", order: 1, active: true, label: "Delivery", labelAr: "التنفيذ", instructions: "", instructionsAr: "", required: true, responsibleEmployeeRequired: false, evidenceRequired: false, branches: ["*"] }],
  }];
  value.rewards.performanceLevels.find((item) => item.code === "PLUS_1").points = points;
  return value;
}

function envelope(first, second) {
  return {
    schemaVersion: 1,
    scope: { type: "GLOBAL", branch: null },
    revision: second ? 2 : 1,
    draft: null,
    publications: [
      { id: "publication-1", version: 1, effectiveFrom: "2000-01-01", publishedAt: "2026-01-01T00:00:00.000Z", publishedBy: "admin", reason: "Initial report policy", baseGlobalRef: null, value: first, systemGenerated: false },
      ...(second ? [{ id: "publication-2", version: 2, effectiveFrom: "2027-02-01", publishedAt: "2027-01-20T00:00:00.000Z", publishedBy: "admin", reason: "Revised event points", baseGlobalRef: null, value: second, systemGenerated: false }] : []),
    ],
    resets: [],
  };
}

function mockDatabase() {
  const first = configuredSettings(1);
  const settings = new Map([
    ["OPS_BRANCH_CONFIG", { key: "OPS_BRANCH_CONFIG", value: JSON.stringify({ branchCode: "MOT" }) }],
    ["OPS_EVALUATION_RULES", { key: "OPS_EVALUATION_RULES", value: JSON.stringify(first.evaluation.rules) }],
    ["OPS_PERFORMANCE_CONFIG:GLOBAL", { key: "OPS_PERFORMANCE_CONFIG:GLOBAL", value: JSON.stringify(envelope(first)) }],
  ]);
  const users = new Map([
    ["manager", { id: "manager", role: "MANAGER", active: true, employeeId: "manager-employee", employee: { id: "manager-employee", branch: "MOT" } }],
    ["reviewer", { id: "reviewer", role: "MANAGER", active: true, employeeId: "reviewer-employee", employee: { id: "reviewer-employee", branch: "MOT" } }],
  ]);
  const employees = [
    { id: "manager-employee", active: true, employmentStatus: "ACTIVE", branch: "MOT", operationsTeamLeader: true },
    { id: "reviewer-employee", active: true, employmentStatus: "ACTIVE", branch: "MOT", operationsTeamLeader: true },
    { id: "worker", active: true, employmentStatus: "ACTIVE", branch: "MOT", operationsTeamLeader: true },
  ];
  const trips = [
    { id: "trip-1", branch: "MOT", workDate: "2027-01-15", name: "School One", startTime: "09:00", endTime: "12:00", status: "PLANNED" },
    { id: "trip-2", branch: "MOT", workDate: "2027-02-15", name: "School Two", startTime: "09:00", endTime: "12:00", status: "PLANNED" },
  ];
  const audits = [];
  const criteria = { id: "criteria-v1", code: "CRITERIA", label: "Criteria", effectiveFrom: "2026-01-01", active: true, createdAt: "2026-01-01", criteria: first.evaluation.criteria };
  const formula = { id: "formula-v1", code: "FORMULA", label: "Formula", effectiveFrom: "2026-01-01", active: true, createdAt: "2026-01-01", configJson: JSON.stringify({ dailyPerformance: 100 }) };
  const db = {
    _settings: settings,
    _audits: audits,
    _publishSecond() { settings.get("OPS_PERFORMANCE_CONFIG:GLOBAL").value = JSON.stringify(envelope(first, configuredSettings(2))); },
    user: { async findUnique({ where }) { return copy(users.get(where.id) || null); } },
    employee: {
      async findMany({ where }) { return copy(employees.filter((item) => where.id.in.includes(item.id))); },
      async findUnique({ where }) { return copy(employees.find((item) => item.id === where.id) || null); },
    },
    opsDailyTrip: {
      async findFirst({ where }) { return copy(trips.find((item) => item.id === where.id && item.status !== "CANCELLED") || null); },
      async findMany({ where }) { return copy(trips.filter((item) => item.branch === where.branch && item.workDate === where.workDate && item.startTime === where.startTime && item.name === where.name && item.status !== "CANCELLED").map((item) => ({ id: item.id }))); },
    },
    opsDailyEvent: { async findFirst() { return null; } },
    opsOperationsDay: { async findUnique() { return null; } },
    opsShiftDefinition: { async findUnique() { return null; } },
    opsSchedule: { async findFirst() { return null; }, async findMany() { return []; } },
    opsScheduleAssignment: { async findMany({ where }) { return copy((where.employeeId?.in || ['worker']).map((employeeId) => ({ employeeId, shiftCode: "AM", code: "AM" }))); } },
    opsEvaluationCriteriaVersion: { async findMany() { return copy([criteria]); } },
    opsAppraisalFormulaVersion: { async findMany() { return copy([formula]); } },
    auditLog: { async create({ data }) { const row = { id: `audit-${audits.length + 1}`, ...copy(data) }; audits.push(row); return copy(row); } },
    systemSetting: {
      async findUnique({ where }) { return copy(settings.get(where.key) || null); },
      async findMany({ where } = {}) { const rows = [...settings.values()]; return copy(where?.key?.startsWith ? rows.filter((row) => row.key.startsWith(where.key.startsWith)) : rows); },
      async create({ data }) { if (settings.has(data.key)) { const error = new Error("unique"); error.code = "P2002"; throw error; } const row = copy(data); settings.set(row.key, row); return copy(row); },
      async updateMany({ where, data }) { const row = settings.get(where.key); if (!row || row.value !== where.value) return { count: 0 }; settings.set(where.key, { ...row, ...copy(data) }); return { count: 1 }; },
    },
    async $transaction(callback) { return callback(db); },
  };
  return db;
}

function reportDraft() {
  return {
    everythingPlanned: true,
    summary: "The trip ran to plan",
    participants: [{ employeeId: "worker", role: "TRIP_TEAM_LEADER", primaryLeader: true, isTeamLeader: true, startTime: "09:00", endTime: "12:00" }],
    adjustments: [{ employeeId: "worker", levelCode: "PLUS_1", comment: "Strong delivery", evidence: [] }],
    unresolvedIssues: [],
    attachments: [],
  };
}

test('read-only report preparation exposes only active branch/date template choices and creation pins the selected process and survey revisions', async () => {
  const db = mockDatabase(), stored = db._settings.get('OPS_PERFORMANCE_CONFIG:GLOBAL'), configured = JSON.parse(stored.value), value = configured.publications[0].value;
  const originalProcess = copy(value.processTemplates[0]);
  value.processTemplates = [
    { ...originalProcess, effectiveTo: '2027-01-14' },
    { ...copy(originalProcess), version: 2, effectiveFrom: '2027-01-15', label: 'Current trip process' },
    { ...copy(originalProcess), code: 'TRIP_ALTERNATIVE', label: 'Alternative trip process' },
    { ...copy(originalProcess), code: 'OTHER_BRANCH_PROCESS', branches: ['OTHER'] },
    { ...copy(originalProcess), code: 'INACTIVE_PROCESS', active: false },
    { ...copy(originalProcess), code: 'FUTURE_PROCESS', effectiveFrom: '2028-01-01' },
    { ...copy(originalProcess), code: 'NO_BRANCH_STEPS', steps: originalProcess.steps.map(step => ({ ...step, branches: ['OTHER'] })) },
  ];
  const survey = copy(value.surveyTemplates.find(item => item.reportType === 'TRIP'));
  const questions = [{ code: 'FIXTURE_SERVICE', active: true, order: 1, required: false, text: 'Fixture-only service rating', textAr: 'تقييم خدمة للاختبار فقط', choices: [{ code: 'GOOD', active: true, label: 'Good', labelAr: 'جيد', numericValue: 4, commentRequired: false, followUpSuggested: false }] }];
  questions[0].choices.push({ code: 'POOR', active: true, label: 'Poor', labelAr: 'ضعيف', numericValue: 1, commentRequired: false, followUpSuggested: false });
  value.surveyTemplates = [
    { ...copy(survey), code: 'SURVEY_A', active: true, branches: ['MOT'], effectiveTo: '2027-01-14', questions: copy(questions) },
    { ...copy(survey), code: 'SURVEY_A', active: true, version: 2, branches: ['MOT'], effectiveFrom: '2027-01-15', effectiveTo: null, questions: copy(questions) },
    { ...copy(survey), code: 'SURVEY_B', active: true, branches: ['*'], questions: copy(questions) },
    { ...copy(survey), code: 'INACTIVE_SURVEY', active: false, questions: [] },
    { ...copy(survey), code: 'OTHER_BRANCH_SURVEY', active: true, branches: ['OTHER'], questions: copy(questions) },
    { ...copy(survey), code: 'FUTURE_SURVEY', active: true, effectiveFrom: '2028-01-01', questions: copy(questions) },
  ];
  stored.value = JSON.stringify(configured);
  const input = { user: { id: 'manager' }, reportType: 'TRIP', sourceId: 'trip-1', branch: 'MOT' };
  const prepared = await prepareOperationalReport(db, input);
  assert.deepEqual(prepared.templates.process.map(item => item.code).sort(), ['TRIP_ALTERNATIVE', 'TRIP_PROCESS']);
  assert.deepEqual(prepared.templates.survey.map(item => item.code).sort(), ['SURVEY_A', 'SURVEY_B']);
  assert.equal(prepared.templates.process.find(item => item.code === 'TRIP_PROCESS').version, 2);
  assert.equal(prepared.templates.survey.find(item => item.code === 'SURVEY_A').version, 2);
  assert.ok(!prepared.templates.process.some(item => Object.hasOwn(item, 'steps')), 'choice DTO does not expose the full configuration');
  assert.equal(db._audits.length, 0); assert.ok(![...db._settings.keys()].some(key => key.startsWith(REPORT_PREFIX)));
  await assert.rejects(changeOperationalReport(db, { ...input, action: 'create', draft: reportDraft() }), error => error.code === 'PROCESS_TEMPLATE_AMBIGUOUS');
  await assert.rejects(changeOperationalReport(db, { ...input, action: 'create', templateCode: 'TRIP_PROCESS', draft: reportDraft() }), error => error.code === 'SURVEY_TEMPLATE_AMBIGUOUS');
  const created = await changeOperationalReport(db, { ...input, action: 'create', templateCode: 'TRIP_PROCESS', surveyTemplateCode: 'SURVEY_A', draft: reportDraft() });
  assert.equal(created.report.configSnapshot.processTemplate.code, 'TRIP_PROCESS'); assert.equal(created.report.configSnapshot.processTemplate.version, 2);
  assert.equal(created.report.configSnapshot.surveyTemplate.code, 'SURVEY_A'); assert.equal(created.report.configSnapshot.surveyTemplate.version, 2);
  const { reportError } = require('../lib/operations/report-copy');
  assert.match(reportError({ code: 'SURVEY_TEMPLATE_AMBIGUOUS' }, false), /Choose a survey/);
  assert.match(reportError({ code: 'SURVEY_TEMPLATE_AMBIGUOUS' }, true), /اختر قالب استبيان/);
});

test("submitted and reviewed report phases retain the draft and independent approval audit", async () => {
  const db = mockDatabase();
  let result = await changeOperationalReport(db, { user: { id: "manager" }, action: "create", reportType: "TRIP", sourceId: "trip-1", draft: { ...reportDraft(), guestComments: "A genuine guest comment", unresolvedIssues: [{ category: "SUPERVISOR", employeeId: "worker", description: "Supervisor requested a different meal time", action: "Checked the booking", leaderIntervention: "Called the supervisor", resolved: true, resolution: "Agreed the recorded meal time" }] } });
  result = await changeOperationalReport(db, { user: { id: "manager" }, action: "submit", id: result.report.id, expectedRevision: result.report.revision });
  assert.equal(result.report.status, "SUBMITTED");
  assert.equal(result.report.draft.unresolvedIssues[0].resolution, "Agreed the recorded meal time");
  await assert.rejects(() => changeOperationalReport(db, { user: { id: "manager" }, action: "review", id: result.report.id, expectedRevision: result.report.revision }), { code: "INDEPENDENT_REPORT_REVIEW_REQUIRED" });
  result = await changeOperationalReport(db, { user: { id: "reviewer" }, action: "review", id: result.report.id, expectedRevision: result.report.revision });
  assert.equal(result.report.status, "REVIEWED");
  assert.equal(result.report.reviewedBy, "reviewer");
  result = await changeOperationalReport(db, { user: { id: "reviewer" }, action: "approve", id: result.report.id, expectedRevision: result.report.revision });
  assert.equal(result.report.status, "APPROVED");
  assert.equal(result.report.draft.guestComments, "A genuine guest comment");
  assert.deepEqual(result.report.history.map(row => row.action), ["CREATED", "submit", "review", "approve"]);
});

test("event impact is derived once, preserves daily base and reverses cancelled or reopened report evidence", async () => {
  const db = mockDatabase();
  const { eventImpactForDaily } = require("../lib/operations/operational-report-service");
  let report = (await changeOperationalReport(db, { user: { id: "manager" }, action: "create", reportType: "TRIP", sourceId: "trip-1", draft: reportDraft() })).report;
  report = (await changeOperationalReport(db, { user: { id: "reviewer" }, action: "approve", id: report.id, expectedRevision: report.revision })).report;
  const first = await eventImpactForDaily(db, { employeeId: "worker", branch: "MOT", date: report.workDate, baseScore: 8, maxScore: 10 });
  assert.equal(first.baseFinalScore, 8); assert.equal(first.finalScore, 9); assert.equal(first.sourceAdjustments.length, 1);
  assert.deepEqual(await eventImpactForDaily(db, { employeeId: "worker", branch: "MOT", date: report.workDate, baseScore: 8, maxScore: 10 }), first);
  report = (await changeOperationalReport(db, { user: { id: "reviewer" }, action: "cancel", id: report.id, expectedRevision: report.revision, reason: "Booking report was cancelled by its manager" })).report;
  assert.equal(report.status, "CANCELLED"); assert.equal(report.draft.adjustments[0].status, "REVERSED");
  const reversed = await eventImpactForDaily(db, { employeeId: "worker", branch: "MOT", date: report.workDate, baseScore: 8, maxScore: 10 });
  assert.equal(reversed.finalScore, 8); assert.equal(reversed.sourceAdjustments.length, 0);
  assert.equal(db._audits.at(-1).action, "OPS_OPERATIONAL_REPORT_CANCELLED");
});

test("approved event points cannot target an employee outside the actual report team", async () => {
  const db = mockDatabase();
  const draft = reportDraft(); draft.participants = [];
  await assert.rejects(() => changeOperationalReport(db, { user: { id: "manager" }, action: "create", reportType: "TRIP", sourceId: "trip-1", draft }), { code: "ADJUSTMENT_PARTICIPANT_REQUIRED" });
  assert.equal([...db._settings.keys()].filter(key => key.startsWith(REPORT_PREFIX)).length, 0);
});

test("daily event overlay removes attendance duplicate, honors existing monthly cap and maximum score", async () => {
  const db = mockDatabase();
  const policy = JSON.parse(db._settings.get("OPS_PERFORMANCE_CONFIG:GLOBAL").value);
  Object.assign(policy.publications[0].value.rewards, { attendanceScoringEnabled: true, attendanceMayCreateAdditionalEventImpact: true, absenceDeduction: 2, maximumMonthlyEventBonus: 0.5 });
  db._settings.get("OPS_PERFORMANCE_CONFIG:GLOBAL").value = JSON.stringify(policy);
  const draft = reportDraft(); draft.adjustments[0].absent = true;
  let report = (await changeOperationalReport(db, { user: { id: "manager" }, action: "create", reportType: "TRIP", sourceId: "trip-1", draft })).report;
  report = (await changeOperationalReport(db, { user: { id: "reviewer" }, action: "approve", id: report.id, expectedRevision: 1 })).report;
  const { eventImpactForDaily } = require("../lib/operations/operational-report-service");
  const impact = await eventImpactForDaily(db, { employeeId: "worker", branch: "MOT", date: report.workDate, baseScore: 9.75, maxScore: 10 });
  assert.equal(impact.points, 0.5); assert.equal(impact.appliedPoints, 0.25); assert.equal(impact.finalScore, 10);
  assert.equal(impact.sourceAdjustments[0].attendanceExcluded, true);
  assert.equal(report.draft.adjustments[0].scoreSnapshot.approvedPoints, -1);
});

test("read-only report preparation uses the published branch roster, AM trip leader and attendance provenance", async () => {
  const db = mockDatabase();
  const { prepareOperationalReport } = require("../lib/operations/operational-report-service");
  db.opsSchedule.findMany = async () => [{ id: "published", version: 2 }];
  db._settings.set("OPS_SCHEDULE_STATE:published", { key: "OPS_SCHEDULE_STATE:published", value: JSON.stringify({ branch: "MOT", revision: 4, dayResponsibilities: { "2027-01-15": { TRIP: "worker" } } }) });
  db.opsShiftDefinition.findMany = async () => [{ code: "AM", startTime: "10:00", endTime: "18:00" }, { code: "PM", startTime: "15:00", endTime: "23:00" }];
  db.opsScheduleAssignment.findMany = async () => [{ id: "morning-row", employeeId: "worker", shiftCode: "AM", code: "AM", employee: { id: "worker", name: "Worker" } }, { id: "night-row", employeeId: "reviewer-employee", shiftCode: "PM", code: "PM", employee: { id: "reviewer-employee", name: "Night employee" } }];
  db.opsAttendanceRecord = { async findMany() { return [{ id: "attendance-row", employeeId: "worker", attendanceDayId: "attendance-day", status: "LATE", actualIn: "10:05", actualOut: "18:00", lateMinutes: 5, version: 1, attendanceDay: { status: "FINALIZED", version: 2 } }]; } };
  const before = db._settings.size;
  const result = await prepareOperationalReport(db, { user: { id: "manager" }, reportType: "TRIP", sourceId: "trip-1", branch: "MOT" });
  assert.equal(result.context.schedule.id, "published"); assert.equal(result.context.schedule.revision, 4);
  assert.deepEqual(result.suggestedParticipants.map(row => row.employeeId), ["worker"]);
  assert.equal(result.suggestedParticipants[0].primaryLeader, true);
  assert.equal(result.context.employees[0].attendance.id, "attendance-row");
  assert.equal(db._settings.size, before); assert.equal(db._audits.length, 0);
});

test("birthday participant maximum is enforced while source date/time and input details stay intact", async () => {
  const db = mockDatabase();
  const birthday = { id: "birthday-1", name: "Birthday booking", childName: "Child", eventType: "BIRTHDAY", branch: "MOT", workDate: "2027-01-15", startTime: "16:00", endTime: "18:00", status: "PLANNED" };
  db.opsDailyEvent.findFirst = async () => copy(birthday);
  const policy = JSON.parse(db._settings.get("OPS_PERFORMANCE_CONFIG:GLOBAL").value);
  const value = policy.publications[0].value;
  value.processTemplates.push({ ...copy(value.processTemplates[0]), code: "BIRTHDAY_PROCESS", reportType: "BIRTHDAY" });
  db._settings.get("OPS_PERFORMANCE_CONFIG:GLOBAL").value = JSON.stringify(policy);
  const draft = { ...reportDraft(), adjustments: [], participants: ["worker", "manager-employee", "reviewer-employee"].map(employeeId => ({ employeeId, role: "BIRTHDAY_HOST", responsibleHost: true })) };
  await assert.rejects(() => changeOperationalReport(db, { user: { id: "manager" }, action: "create", reportType: "BIRTHDAY", sourceId: birthday.id, draft }), { code: "BIRTHDAY_RESPONSIBLE_LIMIT" });
  draft.participants = draft.participants.slice(0, 2);
  const created = await changeOperationalReport(db, { user: { id: "manager" }, action: "create", reportType: "BIRTHDAY", sourceId: birthday.id, draft });
  assert.equal(created.report.source.snapshot.startTime, birthday.startTime);
  assert.equal(created.report.source.snapshot.endTime, birthday.endTime);
  assert.equal(created.report.draft.participants.length, 2);
});

test("cancelling the live booking excludes its approved points and blocks later report approval", async () => {
  const db = mockDatabase();
  let report = (await changeOperationalReport(db, { user: { id: "manager" }, action: "create", reportType: "TRIP", sourceId: "trip-1", draft: reportDraft() })).report;
  report = (await changeOperationalReport(db, { user: { id: "reviewer" }, action: "approve", id: report.id, expectedRevision: 1 })).report;
  db.opsDailyTrip.findFirst = async () => null;
  assert.deepEqual(await getApprovedEventAdjustments(db, { employeeId: "worker", branch: "MOT" }), []);
  report = (await changeOperationalReport(db, { user: { id: "manager" }, action: "reopen", id: report.id, expectedRevision: report.revision, reason: "Source booking has been cancelled" })).report;
  await assert.rejects(() => changeOperationalReport(db, { user: { id: "reviewer" }, action: "approve", id: report.id, expectedRevision: report.revision }), { code: "REPORT_SOURCE_NOT_FOUND" });
});

test("new reports use changed settings while approved report score snapshots remain unchanged", async () => {
  const db = mockDatabase();
  let first = await changeOperationalReport(db, { user: { id: "manager" }, action: "create", reportType: "TRIP", sourceId: "trip-1", draft: reportDraft(), reason: "Create the first Trip report", now: "2027-01-15T13:00:00.000Z" });
  await assert.rejects(() => changeOperationalReport(db, { user: { id: "manager" }, action: "approve", id: first.report.id, expectedRevision: first.report.revision, reason: "Attempt self approval" }), (error) => error.code === "INDEPENDENT_REPORT_REVIEW_REQUIRED");
  first = await changeOperationalReport(db, { user: { id: "reviewer" }, action: "approve", id: first.report.id, expectedRevision: first.report.revision, reason: "Approve the first Trip report", now: "2027-01-15T14:00:00.000Z" });
  assert.equal(first.report.locked, true);
  assert.equal(first.report.draft.adjustments[0].scoreSnapshot.appliedPoints, 1);

  db._publishSecond();
  let second = await changeOperationalReport(db, { user: { id: "manager" }, action: "create", reportType: "TRIP", sourceId: "trip-2", draft: reportDraft(), reason: "Create the second Trip report", now: "2027-02-15T13:00:00.000Z" });
  second = await changeOperationalReport(db, { user: { id: "reviewer" }, action: "approve", id: second.report.id, expectedRevision: second.report.revision, reason: "Approve the second Trip report", now: "2027-02-15T14:00:00.000Z" });
  assert.equal(second.report.draft.adjustments[0].scoreSnapshot.appliedPoints, 2);

  const firstReloaded = (await getOperationalReports(db, { user: { id: "manager" }, id: first.report.id })).reports[0];
  assert.equal(firstReloaded.configSnapshot.effective.publicationId, "publication-1");
  assert.equal(firstReloaded.draft.adjustments[0].scoreSnapshot.appliedPoints, 1);
  const adjustments = await getApprovedEventAdjustments(db, { employeeId: "worker", branch: "MOT", startDate: "2027-01-01", endDate: "2027-12-31" });
  assert.deepEqual(adjustments.map((item) => item.points), [1, 2]);
});

test("report compare-and-swap rejects stale writes and source identity is unique", async () => {
  const db = mockDatabase();
  const created = await changeOperationalReport(db, { user: { id: "manager" }, action: "create", reportType: "TRIP", sourceId: "trip-1", draft: reportDraft(), reason: "Create a report for CAS testing" });
  await assert.rejects(() => changeOperationalReport(db, { user: { id: "manager" }, action: "saveDraft", id: created.report.id, expectedRevision: 99, draft: reportDraft(), reason: "Attempt a stale report write" }), (error) => error.code === "REPORT_CONFLICT");
  await assert.rejects(() => changeOperationalReport(db, { user: { id: "manager" }, action: "create", reportType: "TRIP", sourceId: "trip-1", draft: reportDraft(), reason: "Attempt a duplicate report" }), (error) => error.code === "REPORT_ALREADY_EXISTS");
  assert.equal([...db._settings.keys()].filter((key) => key.startsWith(REPORT_PREFIX)).length, 1);
});

test("automatic leadership drafts use the selected calendar, preserve repeat opens and snapshot ready times", async () => {
  const db = mockDatabase();
  const day = { id: "day-1", branch: "MOT", workDate: "2027-01-15", status: "OPEN" };
  const key = "OPS_PERFORMANCE_CONFIG:GLOBAL";
  const policy = JSON.parse(db._settings.get(key).value);
  const value = policy.publications[0].value;
  value.shiftLeadership.active = true;
  value.shiftLeadership.enabledBranches = ["MOT"];
  value.shiftLeadership.selectedDates = [day.workDate];
  value.shiftLeadership.requiredWeekdays = [];
  value.shiftLeadership.shiftCodes = ["AM"];
  value.shiftLeadership.automaticReportCreation = true;
  value.shiftLeadership.reportDueTime = "18:30";
  value.processTemplates.push({ ...copy(value.processTemplates[0]), code: "SHIFT_PROCESS", reportType: "SHIFT_LEADERSHIP" });
  db._settings.get(key).value = JSON.stringify(policy);
  db.opsOperationsDay.findUnique = async () => copy(day);
  db.opsShiftDefinition.findUnique = async () => ({ code: "AM", active: true, startTime: "10:00", endTime: "18:00" });
  db.opsSchedule.findFirst = async () => ({ id: "published", version: 1 });
  db.opsSchedule.findMany = async () => [{ id: 'published', version: 1 }];
  db._settings.set('OPS_SCHEDULE_STATE:published', {key:'OPS_SCHEDULE_STATE:published',value:JSON.stringify({branch:'MOT',revision:1,dayResponsibilities:{[day.workDate]:{AM:'worker'}}})});
  const originalFindMany=db.employee.findMany;
  db.employee.findMany=async args=>(await originalFindMany(args)).map(row=>({...row,operationsTeamLeader:false}));
  const input = { user: { id: "manager" }, day };
  const first = await ensureAutomaticShiftLeadershipReports(db, input);
  assert.deepEqual(first, { created: ["SHIFT_LEADERSHIP:MOT:2027-01-15:AM"], existing: [], warnings: [] });
  const stored = (await getOperationalReports(db, { user: input.user, id: first.created[0] })).reports[0];
  assert.equal(stored.status, "DRAFT");
  assert.equal(stored.draft.participants[0].employeeId, 'worker');
  assert.equal(stored.draft.participants[0].primaryLeader, true);
  assert.equal(stored.configSnapshot.leadershipRequirement.requiredReadyTime, "09:45");
  assert.equal(stored.configSnapshot.leadershipRequirement.dueTime, "18:30");
  const second = await ensureAutomaticShiftLeadershipReports(db, input);
  assert.deepEqual(second, { created: [], existing: first.created, warnings: [] });
  assert.equal(db._audits.filter(row => row.action === "OPS_OPERATIONAL_REPORT_CREATED").length, 1);
  assert.deepEqual(await ensureAutomaticShiftLeadershipReports(db, { ...input, day: { ...day, workDate: "2027-01-16" } }), { created: [], existing: [], warnings: [] });
  assert.deepEqual(await ensureAutomaticShiftLeadershipReports(db, { ...input, day: { ...day, status: "CLOSED" } }), { created: [], existing: [], warnings: [] });
});

test("automatic leadership creation reports scheduling failures without creating partial reports", async () => {
  const db = mockDatabase();
  const policy = JSON.parse(db._settings.get("OPS_PERFORMANCE_CONFIG:GLOBAL").value);
  Object.assign(policy.publications[0].value.shiftLeadership, { active: true, enabledBranches: ["MOT"], selectedDates: ["2027-01-15"], requiredWeekdays: [], shiftCodes: ["AM"], automaticReportCreation: true });
  db._settings.get("OPS_PERFORMANCE_CONFIG:GLOBAL").value = JSON.stringify(policy);
  const day = { id: "day-1", branch: "MOT", workDate: "2027-01-15", status: "OPEN" };
  db.opsOperationsDay.findUnique = async () => copy(day);
  db.opsShiftDefinition.findUnique = async () => ({ code: "AM", active: true, startTime: "10:00", endTime: "18:00" });
  const result = await ensureAutomaticShiftLeadershipReports(db, { user: { id: "manager" }, day });
  assert.equal(result.warnings[0].code, "SHIFT_SCHEDULE_REQUIRED");
  assert.equal([...db._settings.keys()].filter(key => key.startsWith(REPORT_PREFIX)).length, 0);
});

test("branch-specific process steps stay in the historical template but do not block another branch", async () => {
  const db = mockDatabase();
  const policy = JSON.parse(db._settings.get("OPS_PERFORMANCE_CONFIG:GLOBAL").value);
  policy.publications[0].value.processTemplates[0].steps.push({ code: "OTHER_BRANCH", order: 2, active: true, label: "Other branch evidence", labelAr: "دليل الفرع الآخر", instructions: "", instructionsAr: "", required: true, evidenceRequired: true, responsibleEmployeeRequired: true, branches: ["OTHER"] });
  db._settings.get("OPS_PERFORMANCE_CONFIG:GLOBAL").value = JSON.stringify(policy);
  const created = await changeOperationalReport(db, { user: { id: "manager" }, action: "create", reportType: "TRIP", sourceId: "trip-1", draft: reportDraft() });
  assert.equal(created.report.configSnapshot.processTemplate.steps.length, 2);
  assert.deepEqual(created.report.draft.steps.map(step => step.code), ["DELIVERY"]);
  const approved = await changeOperationalReport(db, { user: { id: "reviewer" }, action: "approve", id: created.report.id, expectedRevision: 1 });
  assert.equal(approved.report.status, "APPROVED");
});

test("completion deadlines are captured from event end and preserved with the report", async () => {
  const db = mockDatabase();
  const policy = JSON.parse(db._settings.get("OPS_PERFORMANCE_CONFIG:GLOBAL").value);
  policy.publications[0].value.reports.TRIP.completionDeadlineMinutes = 45;
  db._settings.get("OPS_PERFORMANCE_CONFIG:GLOBAL").value = JSON.stringify(policy);
  const created = await changeOperationalReport(db, { user: { id: "manager" }, action: "create", reportType: "TRIP", sourceId: "trip-1", draft: reportDraft() });
  assert.deepEqual(created.report.configSnapshot.deadline, { localDateTime: "2027-01-15T12:45", timezone: "Africa/Cairo", anchor: "SOURCE_END", completionDeadlineMinutes: 45 });
  db._publishSecond();
  const saved = (await getOperationalReports(db, { user: { id: "manager" }, id: created.report.id })).reports[0];
  assert.deepEqual(saved.configSnapshot.deadline, created.report.configSnapshot.deadline);
});

test("overlapping approved operational assignments require a permitted documented override", async () => {
  const db = mockDatabase();
  const created = await changeOperationalReport(db, { user: { id: "manager" }, action: "create", reportType: "TRIP", sourceId: "trip-1", draft: reportDraft() });
  await changeOperationalReport(db, { user: { id: "reviewer" }, action: "approve", id: created.report.id, expectedRevision: 1 });
  db.opsDailyTrip.findFirst = async () => ({ id: "other-trip", branch: "MOT", workDate: "2027-01-15", name: "Another booking", startTime: "09:00", endTime: "12:00", status: "PLANNED" });
  const other = await changeOperationalReport(db, { user: { id: "manager" }, action: "create", reportType: "TRIP", sourceId: "other-trip", draft: reportDraft() });
  await assert.rejects(() => changeOperationalReport(db, { user: { id: "reviewer" }, action: "approve", id: other.report.id, expectedRevision: 1 }), error => error.code === "REPORT_STAFFING_INVALID");
  const saved = await changeOperationalReport(db, { user: { id: "manager" }, action: "saveDraft", id: other.report.id, expectedRevision: 1, draft: { ...other.report.draft, staffingOverride: { reason: "Manager verified split coverage for the simultaneous bookings" } } });
  const approved = await changeOperationalReport(db, { user: { id: "reviewer" }, action: "approve", id: saved.report.id, expectedRevision: 2 });
  assert.equal(approved.report.status, "APPROVED");
  assert.match(approved.report.draft.staffingOverride.reason, /split coverage/);
});

test("a linked manager cannot calculate or override their own suitability", async () => {
  const db = mockDatabase();
  await assert.rejects(() => calculateAndStoreSuitability(db, { user: { id: "manager" }, employeeId: "manager-employee", branch: "MOT", profileCode: "TRIP_STAFF", asOfDate: "2027-01-15", events: [] }), error => error.code === "INDEPENDENT_SUITABILITY_REVIEW_REQUIRED");
  assert.equal(db._audits.length, 0);
});
