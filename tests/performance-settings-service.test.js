const test = require("node:test");
const assert = require("node:assert/strict");
const { defaultPerformanceSettings } = require("../lib/operations/performance-settings-config");
const {
  CONFIG_PREFIX,
  LEGACY_BASELINE_KEY,
  authorizePerformanceSettingsScope,
  capturePerformanceSettingsSnapshot,
  changePerformanceSettings,
  getEffectivePerformanceSettings,
  getPerformanceSettingsState,
  readPerformanceSettingsSnapshot,
} = require("../lib/operations/performance-settings-service");

function copy(value) { return value == null ? value : JSON.parse(JSON.stringify(value)); }

function mockDatabase() {
  const criteriaV1 = {
    id: "criteria-v1",
    code: "DAILY-V1",
    label: "Daily V1",
    effectiveFrom: "2026-01-01",
    effectiveTo: null,
    active: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    criteria: [{ id: "criterion-1", code: "SAFETY", label: "Safety", labelAr: "السلامة", category: "DAILY_EVALUATION", maxScore: 10, active: true, sortOrder: 10, reasons: [{ id: "reason-1", code: "UNSAFE", label: "Unsafe", labelAr: "غير آمن", active: true, sortOrder: 10 }] }],
  };
  const formulaV1 = { id: "formula-v1", code: "MONTHLY-V1", label: "Monthly V1", effectiveFrom: "2026-01-01", effectiveTo: null, active: true, createdAt: "2026-01-01T00:00:00.000Z", configJson: JSON.stringify({ dailyPerformance: 70, attendanceReliability: 20, recognition: 5, guestFeedback: 5 }) };
  const settings = new Map([
    ["OPS_EVALUATION_RULES", { key: "OPS_EVALUATION_RULES", value: JSON.stringify({ defaultScoreMode: "FULL_UNREVIEWED", penaltyDeduction: 25, guidanceDeduction: 15, requireReasonForDeduction: true, requireReviewBeforeClose: true }) }],
    ["OPS_BRANCH_CONFIG", { key: "OPS_BRANCH_CONFIG", value: JSON.stringify({ branchCode: "MOT" }) }],
  ]);
  const criteriaVersions = [criteriaV1];
  const formulas = [formulaV1];
  const audits = [];
  const users = new Map([
    ["admin", { id: "admin", role: "ADMIN", active: true, employeeId: null, employee: null }],
    ["manager", { id: "manager", role: "MANAGER", active: true, employeeId: "employee-manager", employee: { id: "employee-manager", branch: "MOT" } }],
    ["manager-unlinked", { id: "manager-unlinked", role: "MANAGER", active: true, employeeId: null, employee: null }],
    ["reviewer", { id: "reviewer", role: "MANAGER", active: true, employeeId: "employee-reviewer", employee: { id: "employee-reviewer", branch: "MOT" } }],
    ["reviewer-2", { id: "reviewer-2", role: "MANAGER", active: true, employeeId: "employee-reviewer-2", employee: { id: "employee-reviewer-2", branch: "MOT" } }],
    ["other-manager", { id: "other-manager", role: "MANAGER", active: true, employeeId: "employee-other", employee: { id: "employee-other", branch: "OTHER" } }],
  ]);
  let criteriaCounter = 1;
  let formulaCounter = 1;

  const db = {
    _settings: settings,
    _criteriaVersions: criteriaVersions,
    _formulas: formulas,
    _audits: audits,
    _users: users,
    systemSetting: {
      async findUnique({ where }) { return copy(settings.get(where.key) || null); },
      async findMany({ where } = {}) {
        let rows = [...settings.values()];
        if (where?.key?.startsWith) rows = rows.filter((row) => row.key.startsWith(where.key.startsWith));
        return copy(rows);
      },
      async create({ data }) {
        if (settings.has(data.key)) { const error = new Error("unique"); error.code = "P2002"; throw error; }
        const row = { ...copy(data), createdAt: "2026-10-08T00:00:00.000Z", updatedAt: "2026-10-08T00:00:00.000Z" };
        settings.set(row.key, row);
        return copy(row);
      },
      async updateMany({ where, data }) {
        const row = settings.get(where.key);
        if (!row || row.value !== where.value) return { count: 0 };
        settings.set(where.key, { ...row, ...copy(data), updatedAt: "2026-10-08T00:00:01.000Z" });
        return { count: 1 };
      },
      async upsert({ where, create }) {
        if (settings.has(where.key)) return copy(settings.get(where.key));
        const row = { ...copy(create), createdAt: "2026-10-08T00:00:00.000Z", updatedAt: "2026-10-08T00:00:00.000Z" };
        settings.set(row.key, row);
        return copy(row);
      },
    },
    opsEvaluationCriteriaVersion: {
      async findMany() { return copy(criteriaVersions); },
      async create({ data }) {
        const row = {
          id: `criteria-new-${criteriaCounter++}`,
          ...copy(data),
          createdAt: "2026-10-08T00:00:00.000Z",
          criteria: data.criteria.create.map((criterion, index) => ({ id: `new-criterion-${criteriaCounter}-${index}`, ...copy(criterion), reasons: copy(criterion.reasons.create) })),
        };
        delete row.criteria.create;
        criteriaVersions.push(row);
        return copy(row);
      },
    },
    opsAppraisalFormulaVersion: {
      async findMany() { return copy(formulas); },
      async create({ data }) { const row = { id: `formula-new-${formulaCounter++}`, ...copy(data), createdAt: "2026-10-08T00:00:00.000Z" }; formulas.push(row); return copy(row); },
    },
    opsDailyEvaluationDay: {
      async findMany() { return [{ id: "legacy-day", evaluationDate: "2026-09-30", criteriaVersionId: criteriaV1.id, criteriaVersion: copy(criteriaV1) }]; },
    },
    opsMonthlyAppraisal: {
      async findMany() { return [{ id: "legacy-appraisal", year: 2026, month: 9, version: 1, formulaVersionId: formulaV1.id, formulaVersion: copy(formulaV1), employee: { branch: "MOT" } }]; },
    },
    employee: {
      async findMany() { return [{ branch: "MOT" }, { branch: "OTHER" }]; },
    },
    user: {
      async findUnique({ where }) { return copy(users.get(where.id) || null); },
    },
    auditLog: {
      async create({ data }) { const row = { id: `audit-${audits.length + 1}`, ...copy(data) }; audits.push(row); return copy(row); },
    },
    async $transaction(callback) { return callback(db); },
  };
  return db;
}

test("read state is query-only and materializes defaults only on explicit writes", async () => {
  const db = mockDatabase();
  const state = await getPerformanceSettingsState(db, "GLOBAL");
  assert.equal(state.revision, 0);
  assert.equal(state.effective.source, "DEFAULT");
  assert.equal(state.effective.value.evaluation.criteriaVersionId, "criteria-v1");
  assert.equal(state.effective.value.monthlyAppraisal.formulaVersionId, "formula-v1");
  assert.equal([...db._settings.keys()].filter((key) => key.startsWith(CONFIG_PREFIX)).length, 0);

  const config = copy(state.effective.value);
  config.evaluation.rules.penaltyDeduction = 7;
  const saved = await changePerformanceSettings(db, { user: { id: "admin" }, action: "saveDraft", scope: "GLOBAL", value: config, expectedRevision: 0, reason: "Prepare revised evaluation rules", now: "2026-10-08T12:00:00.000Z" });
  assert.equal(saved.state.revision, 2);
  assert.equal(saved.state.draft.value.evaluation.rules.penaltyDeduction, 7);
  assert.ok(db._settings.has(`${CONFIG_PREFIX}GLOBAL`));
  assert.equal(db._settings.has(LEGACY_BASELINE_KEY), false);
});

test("publish pins immutable criteria/formula versions and baselines legacy records before change", async () => {
  const db = mockDatabase();
  const initial = await getPerformanceSettingsState(db, "GLOBAL");
  const config = copy(initial.effective.value);
  config.evaluation.rules.penaltyDeduction = 7;
  const saved = await changePerformanceSettings(db, { user: { id: "admin" }, action: "saveDraft", scope: "GLOBAL", value: config, expectedRevision: 0, reason: "Prepare revised evaluation rules", now: "2026-10-08T12:00:00.000Z" });
  const published = await changePerformanceSettings(db, { user: { id: "admin" }, action: "publish", scope: "GLOBAL", expectedRevision: saved.state.revision, effectiveFrom: "2027-01-01", reason: "Publish the approved evaluation rules", now: "2026-10-08T13:00:00.000Z" });

  assert.equal(published.state.revision, 3);
  assert.equal(published.state.effective.value.evaluation.rules.penaltyDeduction, 7);
  assert.notEqual(published.state.effective.value.evaluation.criteriaVersionId, "criteria-v1");
  assert.notEqual(published.state.effective.value.monthlyAppraisal.formulaVersionId, "formula-v1");
  assert.equal(db._criteriaVersions.length, 2);
  assert.equal(db._formulas.length, 2);
  assert.ok(db._settings.has(LEGACY_BASELINE_KEY));

  const beforeEffective = await getEffectivePerformanceSettings(db, { date: "2026-12-31" });
  const afterEffective = await getEffectivePerformanceSettings(db, { date: "2027-01-01" });
  assert.equal(beforeEffective.value.evaluation.rules.penaltyDeduction, 25);
  assert.equal(afterEffective.value.evaluation.rules.penaltyDeduction, 7);

  const legacyDay = await readPerformanceSettingsSnapshot(db, { kind: "EVALUATION_DAY", recordId: "legacy-day", date: "2026-09-30" });
  assert.equal(legacyDay.effective.value.evaluation.criteriaVersionId, "criteria-v1");
  assert.equal(legacyDay.effective.value.evaluation.criteria[0].code, "SAFETY");
  assert.equal(legacyDay.effective.value.evaluation.rules.penaltyDeduction, 25);
  const legacyAppraisal = await readPerformanceSettingsSnapshot(db, { kind: "MONTHLY_APPRAISAL", recordId: "legacy-appraisal", branch: "MOT", date: "2026-09-01" });
  assert.equal(legacyAppraisal.effective.value.monthlyAppraisal.formulaVersionId, "formula-v1");
});

test("snapshots and publications remain immutable while newer settings affect new records", async () => {
  const db = mockDatabase();
  const initial = await getPerformanceSettingsState(db, "GLOBAL");
  const firstConfig = copy(initial.effective.value);
  firstConfig.evaluation.rules.penaltyDeduction = 7;
  let result = await changePerformanceSettings(db, { user: { id: "admin" }, action: "saveDraft", scope: "GLOBAL", value: firstConfig, expectedRevision: 0, reason: "Prepare first configuration version" });
  result = await changePerformanceSettings(db, { user: { id: "admin" }, action: "publish", scope: "GLOBAL", expectedRevision: result.state.revision, effectiveFrom: "2027-01-01", reason: "Publish first configuration version" });
  const firstSnapshot = await capturePerformanceSettingsSnapshot(db, { kind: "TRIP_REPORT", recordId: "trip-1", branch: "MOT", date: "2027-02-01" });
  assert.equal(firstSnapshot.effective.value.evaluation.rules.penaltyDeduction, 7);

  const secondConfig = copy(result.state.effective.value);
  secondConfig.evaluation.rules.penaltyDeduction = 3;
  result = await changePerformanceSettings(db, { user: { id: "admin" }, action: "saveDraft", scope: "GLOBAL", value: secondConfig, expectedRevision: result.state.revision, reason: "Prepare second configuration version" });
  result = await changePerformanceSettings(db, { user: { id: "admin" }, action: "publish", scope: "GLOBAL", expectedRevision: result.state.revision, effectiveFrom: "2028-01-01", reason: "Publish second configuration version" });
  const newEffective = await getEffectivePerformanceSettings(db, { branch: "MOT", date: "2028-01-01" });
  assert.equal(newEffective.value.evaluation.rules.penaltyDeduction, 3);

  const repeatedSnapshot = await capturePerformanceSettingsSnapshot(db, { kind: "TRIP_REPORT", recordId: "trip-1", branch: "MOT", date: "2028-02-01" });
  assert.equal(repeatedSnapshot.effective.value.evaluation.rules.penaltyDeduction, 7);
  const history = await getPerformanceSettingsState(db, { scope: "GLOBAL", date: "2028-01-01" });
  assert.equal(history.history.filter((item) => item.type === "PUBLISHED").length, 3);
  await assert.rejects(() => readPerformanceSettingsSnapshot(db, { kind: "TRIP_REPORT", recordId: "missing" }), (error) => error.code === "PERFORMANCE_SNAPSHOT_MISSING");
});

test("branch access derives from the linked employee and linked publishers require a second reviewer", async () => {
  const db = mockDatabase();
  const managerAccess = await authorizePerformanceSettingsScope(db, { id: "manager", employee: { branch: "OTHER" } }, null);
  assert.equal(managerAccess.scope.branch, "MOT");
  const managerState = await getPerformanceSettingsState(db, { scope: managerAccess.scope.branch });
  assert.ok(managerState.branches.includes("MOT"));
  const unlinkedAccess = await authorizePerformanceSettingsScope(db, { id: "manager-unlinked" }, null);
  assert.equal(unlinkedAccess.scope.branch, "MOT");
  await assert.rejects(() => authorizePerformanceSettingsScope(db, { id: "manager" }, "GLOBAL"), /linked employee branch/);
  await assert.rejects(() => authorizePerformanceSettingsScope(db, { id: "manager" }, "OTHER"), /linked employee branch/);

  const global = await getPerformanceSettingsState(db, "GLOBAL");
  const branchConfig = copy(global.effective.value);
  branchConfig.staffing.maximumResponsibleBirthdayHosts = 1;
  let branch = await changePerformanceSettings(db, { user: { id: "manager" }, action: "saveDraft", scope: "MOT", value: branchConfig, expectedRevision: 0, reason: "Prepare MOT branch staffing override" });
  await assert.rejects(() => changePerformanceSettings(db, { user: { id: "manager" }, action: "publish", scope: "MOT", expectedRevision: branch.state.revision, effectiveFrom: "2027-01-01", reason: "Publish MOT staffing override" }), (error) => error.code === "SECOND_REVIEWER_REQUIRED");
  await assert.rejects(() => changePerformanceSettings(db, { user: { id: "manager" }, action: "publish", scope: "MOT", expectedRevision: branch.state.revision, effectiveFrom: "2027-01-01", reason: "Publish MOT staffing override", reviewerUserId: "reviewer" }), (error) => error.code === "SECOND_REVIEWER_REQUIRED");
  await assert.rejects(() => changePerformanceSettings(db, { user: { id: "other-manager" }, action: "publish", scope: "MOT", expectedRevision: branch.state.revision, effectiveFrom: "2027-01-01", reason: "Publish MOT staffing override" }), (error) => error.code === "BRANCH_ACCESS_DENIED");
  branch = await changePerformanceSettings(db, { user: { id: "reviewer" }, action: "publish", scope: "MOT", expectedRevision: branch.state.revision, effectiveFrom: "2027-01-01", reason: "Publish MOT staffing override" });
  assert.equal(branch.state.inherited, false);
  assert.equal(branch.state.effective.value.staffing.maximumResponsibleBirthdayHosts, 1);
  const publication = branch.state.history.find((item) => item.type === "PUBLISHED");
  assert.equal(publication.draftCreatedBy, "manager");
  assert.equal(publication.draftCreatedByEmployeeId, "employee-manager");
  assert.equal(publication.publishedBy, "reviewer");
  assert.equal(db._criteriaVersions.find((item) => item.id === publication.criteriaVersionId).active, false);
  assert.equal(db._formulas.find((item) => item.id === publication.formulaVersionId).active, false);

  await assert.rejects(() => changePerformanceSettings(db, { user: { id: "manager" }, action: "resetOverride", scope: "MOT", expectedRevision: branch.state.revision, effectiveFrom: "2028-01-01", reason: "Attempt self-interested branch reset" }), (error) => error.code === "RESET_REVIEW_REQUIRED");

  const reset = await changePerformanceSettings(db, { user: { id: "admin" }, action: "resetOverride", scope: "MOT", expectedRevision: branch.state.revision, effectiveFrom: "2028-01-01", reason: "Return MOT to the global configuration" });
  assert.equal(reset.state.inherited, true);
  assert.equal(reset.state.effective.value.staffing.maximumResponsibleBirthdayHosts, 2);
});

test("draft authorship remains auditable and every linked editor needs an independent publisher", async () => {
  const db = mockDatabase();
  const global = await getPerformanceSettingsState(db, "GLOBAL");
  const config = copy(global.effective.value);
  config.staffing.maximumResponsibleBirthdayHosts = 1;
  let branch = await changePerformanceSettings(db, { user: { id: "manager" }, action: "saveDraft", scope: "MOT", value: config, expectedRevision: 0, reason: "Create the branch staffing draft" });
  branch = await changePerformanceSettings(db, { user: { id: "reviewer" }, action: "saveDraft", scope: "MOT", value: config, expectedRevision: branch.state.revision, reason: "Edit the branch staffing draft" });
  assert.equal(branch.state.draft.createdBy, "manager");
  assert.equal(branch.state.draft.createdByEmployeeId, "employee-manager");
  assert.equal(branch.state.draft.updatedBy, "reviewer");
  assert.equal(branch.state.draft.updatedByEmployeeId, "employee-reviewer");
  await assert.rejects(() => changePerformanceSettings(db, { user: { id: "manager" }, action: "publish", scope: "MOT", expectedRevision: branch.state.revision, effectiveFrom: "2027-01-01", reason: "Attempt author self publication" }), (error) => error.code === "SECOND_REVIEWER_REQUIRED");
  await assert.rejects(() => changePerformanceSettings(db, { user: { id: "reviewer" }, action: "publish", scope: "MOT", expectedRevision: branch.state.revision, effectiveFrom: "2027-01-01", reason: "Attempt editor self publication" }), (error) => error.code === "SECOND_REVIEWER_REQUIRED");
  branch = await changePerformanceSettings(db, { user: { id: "reviewer-2" }, action: "publish", scope: "MOT", expectedRevision: branch.state.revision, effectiveFrom: "2027-01-01", reason: "Independently publish staffing rules" });
  const publication = branch.state.history.find((item) => item.type === "PUBLISHED");
  assert.equal(publication.draftCreatedBy, "manager");
  assert.equal(publication.draftUpdatedBy, "reviewer");
  assert.equal(publication.publishedBy, "reviewer-2");
});

test("stored contributor links survive account relinking without misattributing the original author", async () => {
  const db = mockDatabase();
  const global = await getPerformanceSettingsState(db, "GLOBAL");
  const config = copy(global.effective.value);
  let branch = await changePerformanceSettings(db, { user: { id: "manager" }, action: "saveDraft", scope: "MOT", value: config, expectedRevision: 0, reason: "Create a linked employee draft" });
  db._users.set("manager", { id: "manager", role: "MANAGER", active: true, employeeId: null, employee: null });
  branch = await changePerformanceSettings(db, { user: { id: "manager" }, action: "saveDraft", scope: "MOT", value: config, expectedRevision: branch.state.revision, reason: "Update after removing the account link" });
  assert.equal(branch.state.draft.createdByEmployeeId, "employee-manager");
  await assert.rejects(() => changePerformanceSettings(db, { user: { id: "manager" }, action: "publish", scope: "MOT", expectedRevision: branch.state.revision, effectiveFrom: "2027-01-01", reason: "Attempt publication after account relinking" }), (error) => error.code === "SECOND_REVIEWER_REQUIRED");

  const otherDb = mockDatabase();
  const otherGlobal = await getPerformanceSettingsState(otherDb, "GLOBAL");
  let otherBranch = await changePerformanceSettings(otherDb, { user: { id: "admin" }, action: "saveDraft", scope: "MOT", value: otherGlobal.effective.value, expectedRevision: 0, reason: "Create an unlinked administrator draft" });
  otherBranch = await changePerformanceSettings(otherDb, { user: { id: "reviewer" }, action: "saveDraft", scope: "MOT", value: otherGlobal.effective.value, expectedRevision: otherBranch.state.revision, reason: "Edit the administrator draft" });
  assert.equal(otherBranch.state.draft.createdBy, "admin");
  assert.equal(otherBranch.state.draft.createdByEmployeeId, null);
  assert.equal(otherBranch.state.draft.updatedByEmployeeId, "employee-reviewer");
});

test("publication rejects impossible calendar dates", async () => {
  const db = mockDatabase();
  const state = await getPerformanceSettingsState(db, "GLOBAL");
  const saved = await changePerformanceSettings(db, { user: { id: "admin" }, action: "saveDraft", scope: "GLOBAL", value: state.effective.value, expectedRevision: 0, reason: "Prepare a calendar validation test" });
  await assert.rejects(() => changePerformanceSettings(db, { user: { id: "admin" }, action: "publish", scope: "GLOBAL", expectedRevision: saved.state.revision, effectiveFrom: "2027-02-30", reason: "Reject an impossible effective date" }), (error) => error.code === "INVALID_DATE");
});

test("compare-and-swap rejects stale draft updates", async () => {
  const db = mockDatabase();
  const state = await getPerformanceSettingsState(db, "GLOBAL");
  const config = defaultPerformanceSettings({ criteria: { id: "criteria-v1", criteria: db._criteriaVersions[0].criteria }, evaluationRules: state.effective.value.evaluation.rules, appraisalFormula: db._formulas[0] });
  const saved = await changePerformanceSettings(db, { user: { id: "admin" }, action: "saveDraft", scope: "GLOBAL", value: config, expectedRevision: 0, reason: "Save the first concurrent draft" });
  await assert.rejects(() => changePerformanceSettings(db, { user: { id: "admin" }, action: "saveDraft", scope: "GLOBAL", value: config, expectedRevision: 0, reason: "Attempt a stale concurrent draft" }), (error) => error.code === "CONFIG_CONFLICT");
  assert.equal(saved.state.revision, 2);
});
