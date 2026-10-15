const test = require("node:test");
const assert = require("node:assert/strict");
const { defaultPerformanceSettings, validatePerformanceSettings } = require("../lib/operations/performance-settings-config");

function configuredDefaults() {
  return defaultPerformanceSettings({
    criteria: {
      id: "criteria-v1",
      criteria: [{
        code: "SAFETY",
        label: "Safety",
        labelAr: "السلامة",
        category: "DAILY_EVALUATION",
        maxScore: 10,
        active: true,
        sortOrder: 10,
        reasons: [{ code: "UNSAFE", label: "Unsafe behavior", labelAr: "سلوك غير آمن", active: true, sortOrder: 10 }],
      }],
    },
    evaluationRules: { defaultScoreMode: "ZERO_UNREVIEWED", penaltyDeduction: 12 },
    appraisalFormula: { id: "formula-v1", code: "MONTHLY-V1", label: "Monthly V1", effectiveFrom: "2026-01-01", configJson: JSON.stringify({ dailyPerformance: 70, attendanceReliability: 20, recognition: 5, guestFeedback: 5 }) },
  });
}

test("performance settings defaults preserve versions and leave unconfigured surveys inactive until questions are supplied", () => {
  const settings = configuredDefaults();
  assert.deepEqual(Object.keys(settings), ["reports", "processTemplates", "surveyTemplates", "rewards", "evaluation", "monthlyAppraisal", "suitability", "shiftLeadership", "staffing", "succession", "permissions"]);
  assert.equal(settings.evaluation.rules.defaultScoreMode, "ZERO_UNREVIEWED");
  assert.equal(settings.evaluation.rules.penaltyDeduction, 12);
  assert.equal(settings.evaluation.criteriaVersionId, "criteria-v1");
  assert.equal(settings.evaluation.criteria[0].reasons[0].code, "UNSAFE");
  assert.equal(settings.monthlyAppraisal.formulaVersionId, "formula-v1");
  assert.equal(settings.monthlyAppraisal.sourceFormula.config.dailyPerformance, 70);
  assert.equal(settings.monthlyAppraisal.formulaParameters.dailyPerformance, 70);
  assert.deepEqual(settings.surveyTemplates.map((item) => [item.reportType, item.active, item.questions.length]), [["TRIP", false, 0], ["BIRTHDAY", false, 0]]);
  assert.equal(settings.rewards.attendanceScoringEnabled, false);
  assert.ok(settings.surveyTemplates.every(template=>template.questions.every(question=>question.textAr&&question.choices.some(choice=>choice.commentRequired&&choice.followUpSuggested))));
  assert.deepEqual(settings.rewards.performanceLevels.map((item) => item.points), [3, 2, 1, 0, -1, -2, -3]);
  assert.equal(settings.staffing.maximumResponsibleBirthdayHosts, 2);
  assert.deepEqual(settings.succession.paths.filter((item) => item.enabled).map((item) => [item.fromRole, item.toRole]), [
    ["Ride Operator", "Front Cashier"],
    ["Ride Operator", "Operation Supervisor"],
    ["Front Cashier", "Operation Supervisor"],
  ]);
  assert.doesNotThrow(() => validatePerformanceSettings(settings, { publishing: true }));
});

test("publication validation rejects unsafe ranges, weights, choices, templates, and role escalation", () => {
  const overlap = configuredDefaults();
  overlap.rewards.attendanceScoringEnabled = true;
  overlap.rewards.latenessBands = [
    { code: "LATE_1", active: true, minimumMinutes: 1, maximumMinutes: 10, points: -1 },
    { code: "LATE_2", active: true, minimumMinutes: 10, maximumMinutes: 20, points: -2 },
  ];
  assert.throws(() => validatePerformanceSettings(overlap, { publishing: true }), /overlapping active ranges/);

  const badWeights = configuredDefaults();
  badWeights.suitability[0].weights.performance = 49;
  assert.throws(() => validatePerformanceSettings(badWeights, { publishing: true }), /must total 100/);

  const badSurvey = configuredDefaults();
  badSurvey.surveyTemplates[0].active = true;
  badSurvey.surveyTemplates[0].questions = [{ code: "WELCOME", order: 1, active: true, required: true, text: "Welcome?", textAr: "الترحيب؟", choices: [{ code: "YES", label: "Yes", labelAr: "نعم", numericValue: 1, active: true, commentRequired: false, followUpSuggested: false }] }];
  assert.throws(() => validatePerformanceSettings(badSurvey, { publishing: true }), /at least two active choices/);

  const emptyProcess = configuredDefaults();
  emptyProcess.processTemplates = [{ code: "TRIP_PROCESS", reportType: "TRIP", version: 1, active: true, label: "Trip", labelAr: "رحلة", instructions: "", instructionsAr: "", branches: ["*"], effectiveFrom: "2026-01-01", effectiveTo: null, steps: [] }];
  assert.throws(() => validatePerformanceSettings(emptyProcess, { publishing: true }), /at least one active step/);

  const elevatedRole = configuredDefaults();
  elevatedRole.permissions.reportApproveRoles = ["CASHIER"];
  assert.throws(() => validatePerformanceSettings(elevatedRole), /role ceiling/);

  const lockout = configuredDefaults();
  lockout.permissions.settingsRoles = ["MANAGER"];
  assert.throws(() => validatePerformanceSettings(lockout), /must include ADMIN/);

  const reviewerBypass = configuredDefaults();
  reviewerBypass.permissions.requireSecondReviewerForLinkedPublisher = false;
  assert.throws(() => validatePerformanceSettings(reviewerBypass), /must remain enabled/);
});

test("draft validation permits inactive incomplete surveys but still enforces structural types", () => {
  const settings = configuredDefaults();
  settings.surveyTemplates[0].questions = [];
  assert.doesNotThrow(() => validatePerformanceSettings(settings));
  settings.staffing.maximumResponsibleBirthdayHosts = 2.5;
  assert.throws(() => validatePerformanceSettings(settings), /whole number/);
});

test("legacy formula metadata is preserved without treating prose or bounds as weights", () => {
  const formula = { dailyPerformance: 70, attendanceReliability: 20, recognition: 5, guestFeedback: 5, approvedPenaltyDeduction: 5, note: "Development baseline; business weights are versioned and configurable.", finalScoreMaximum: 10000 };
  const settings = defaultPerformanceSettings({ criteria: { criteria: configuredDefaults().evaluation.criteria }, appraisalFormula: { configJson: JSON.stringify(formula) } });
  assert.deepEqual(settings.monthlyAppraisal.formulaParameters, { dailyPerformance: 70, attendanceReliability: 20, recognition: 5, guestFeedback: 5, approvedPenaltyDeduction: 5 });
  assert.deepEqual(settings.monthlyAppraisal.sourceFormula.config, formula);
  assert.doesNotThrow(() => validatePerformanceSettings(settings, { publishing: true }));
  assert.equal(settings.processTemplates.length, 3);
  assert.ok(settings.processTemplates.every(template => template.active && template.steps.some(step => step.active)));
});

test("calendar dates must exist rather than merely match the ISO shape", () => {
  const settings = configuredDefaults();
  settings.shiftLeadership.selectedDates = ["2026-02-31"];
  assert.throws(() => validatePerformanceSettings(settings), /valid YYYY-MM-DD date/);
});

test("malformed range and branch entries return validation issues instead of runtime errors", () => {
  const badRanges = configuredDefaults();
  badRanges.rewards.latenessBands = [null, { code: "LATE", active: true, minimumMinutes: 1, maximumMinutes: 5, points: -1 }];
  assert.throws(() => validatePerformanceSettings(badRanges, { publishing: true }), (error) => error.code === "INVALID_PERFORMANCE_SETTINGS" && error.issues.some((issue) => issue.includes("latenessBands[0]")));

  const badBranches = configuredDefaults();
  badBranches.processTemplates = [
    { code: "TRIP_PROCESS", reportType: "TRIP", version: 1, active: true, label: "Trip", labelAr: "رحلة", instructions: "", instructionsAr: "", branches: null, effectiveFrom: "2026-01-01", effectiveTo: null, steps: [{ code: "START", order: 1, active: true, label: "Start", labelAr: "ابدأ", instructions: "", instructionsAr: "", required: true, responsibleEmployeeRequired: false, evidenceRequired: false, branches: ["*"] }] },
    { code: "TRIP_PROCESS", reportType: "TRIP", version: 2, active: true, label: "Trip 2", labelAr: "رحلة ٢", instructions: "", instructionsAr: "", branches: ["*"], effectiveFrom: "2027-01-01", effectiveTo: null, steps: [{ code: "START", order: 1, active: true, label: "Start", labelAr: "ابدأ", instructions: "", instructionsAr: "", required: true, responsibleEmployeeRequired: false, evidenceRequired: false, branches: ["*"] }] },
  ];
  assert.throws(() => validatePerformanceSettings(badBranches, { publishing: true }), (error) => error.code === "INVALID_PERFORMANCE_SETTINGS" && error.issues.some((issue) => issue.includes("branches")));
});
