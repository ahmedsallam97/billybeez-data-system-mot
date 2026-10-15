const test = require("node:test");
const assert = require("node:assert/strict");
const { defaultPerformanceSettings } = require("../lib/operations/performance-settings-config");
const {
  calculateMonthlyAppraisal,
  calculateSuitability,
  resolveShiftLeadershipRequirement,
  resolveSuccessionPath,
  scoreOperationalEvent,
  validateStaffing,
} = require("../lib/operations/performance-policy");

function settings() {
  const value = defaultPerformanceSettings({
    criteria: { id: "criteria", criteria: [{ code: "SAFETY", label: "Safety", category: "DAILY", maxScore: 10, active: true, sortOrder: 1, reasons: [] }] },
    appraisalFormula: { id: "formula", code: "FORMULA", label: "Formula", effectiveFrom: "2026-01-01", configJson: JSON.stringify({ dailyPerformance: 100 }) },
  });
  value.rewards.attendanceScoringEnabled = true;
  value.rewards.onTimeBonus = 1;
  value.rewards.absenceDeduction = 3;
  value.rewards.latenessBands = [{ code: "LATE_1", active: true, minimumMinutes: 1, maximumMinutes: 10, points: -1 }];
  return value;
}

test("event scoring requires explicit attendance and fails closed on lateness gaps", () => {
  const value = settings();
  const unchanged = JSON.stringify(value);
  const noAttendance = scoreOperationalEvent(value, { reportType: "TRIP", levelCode: "ZERO", approvalStatus: "APPROVED", comment: "neutral" });
  assert.equal(noAttendance.components.attendancePoints, 0);
  assert.equal(noAttendance.points, 0);
  const present = scoreOperationalEvent(value, { reportType: "TRIP", attendance: { status: "PRESENT", lateMinutes: 0 }, approvalStatus: "APPROVED" });
  assert.equal(present.appliedPoints, 1);
  assert.throws(() => scoreOperationalEvent(value, { reportType: "TRIP", attendance: { status: "LATE", lateMinutes: 20 }, approvalStatus: "APPROVED" }), (error) => error.code === "LATE_BAND_NOT_CONFIGURED");
  assert.equal(JSON.stringify(value), unchanged);
});

test("monthly appraisal ignores default rows and caps positive and negative streams independently", () => {
  const value = settings();
  value.rewards.maximumMonthlyEventBonus = 5;
  value.rewards.maximumMonthlyEventPenalty = 20;
  value.monthlyAppraisal.monthlyPositiveCap = 5;
  value.monthlyAppraisal.monthlyNegativeCap = 20;
  const result = calculateMonthlyAppraisal(value, {
    dailyEvaluations: [
      { id: "default", date: "2026-09-01", evaluationStatus: "DEFAULT_FULL", dayStatus: "CLOSED", finalScore: 10, maxScore: 10 },
      { id: "reviewed", date: "2026-09-02", evaluationStatus: "REVIEWED", dayStatus: "CLOSED", finalScore: 8, maxScore: 10 },
    ],
    eventAdjustments: [
      { id: "plus", sourceReportId: "r1", status: "APPROVED", approvedPoints: 100 },
      { id: "minus", sourceReportId: "r2", status: "APPROVED", approvedPoints: -10 },
    ],
    coverage: { expectedDays: 1 },
  });
  assert.equal(result.components.dailyAggregate, 80);
  assert.equal(result.components.eventAdjustment, -5);
  assert.equal(result.totalScore, 75);
  assert.deepEqual(result.sourceSnapshot.dailyEvaluations.map((row) => row.id), ["reviewed"]);
});

test("sum aggregation accepts totals above one day's percentage range", () => {
  const value = settings(); value.monthlyAppraisal.aggregationMethod = "SUM";
  const result = calculateMonthlyAppraisal(value, { dailyEvaluations: [1, 2, 3].map(id => ({ id: String(id), evaluationStatus: "REVIEWED", dayStatus: "CLOSED", finalScore: 50, maxScore: 50 })), coverage: { expectedDays: 3 } });
  assert.equal(result.totalScore, 150); assert.equal(result.status, "CALCULATED");
});

test("monthly appraisal preserves an approved prior result unless a configured new version is requested", () => {
  const value = settings();
  const previous = { status: "APPROVED", totalScore: 88, result: { totalScore: 88, status: "CALCULATED" } };
  const preserved = calculateMonthlyAppraisal(value, { previous, sourceChanged: false, dailyEvaluations: [], coverage: { expectedDays: 1 } });
  assert.equal(preserved.persistenceAction, "PRESERVE");
  assert.equal(preserved.totalScore, 88);
});

test("suitability does not recommend when a positively weighted dimension has no evidence", () => {
  const value = settings();
  const result = calculateSuitability(value, { profileCode: "TRIP_STAFF", asOfDate: "2026-09-30", events: [{ id: "attendance-1", date: "2026-09-30", metrics: { punctuality: 100 } }] });
  assert.equal(result.status, "INSUFFICIENT_DATA");
  assert.deepEqual(result.missingMetrics, ["performance"]);
});

test("staffing fails closed for missing availability and exact Trip leader count", () => {
  const value = settings();
  assert.throws(() => validateStaffing(value, { reportType: "TRIP", assignments: [] }), (error) => error.code === "STAFFING_AVAILABILITY_REQUIRED");
  const result = validateStaffing(value, { reportType: "TRIP", assignments: [], availableEmployeeIds: [] });
  assert.equal(result.valid, false);
  assert.match(result.errors.join(" "), /must equal/);
});

test("shift leadership uses only configured branch, shift, and calendar matches", () => {
  const value = settings();
  value.shiftLeadership.active = true;
  value.shiftLeadership.enabledBranches = ["MOT"];
  value.shiftLeadership.requiredWeekdays = [5];
  assert.throws(() => resolveShiftLeadershipRequirement(value, { date: "2026-10-09", shiftCode: "AM" }), (error) => error.code === "SHIFT_BRANCH_REQUIRED");
  const result = resolveShiftLeadershipRequirement(value, { branch: "MOT", date: "2026-10-09", shiftCode: "AM", shiftStartTime: "09:00" });
  assert.equal(result.applies, true);
  assert.equal(result.leaderRequired, true);
  assert.equal(result.requiredReadyTime, "08:45");
});

test("succession resolves the existing Cashier alias and cumulative template codes", () => {
  const value = settings();
  value.succession.competencies = [{ templateCode: "FRONT_CASHIER", code: "SERVICE", group: "Service", label: "Service", requiredLevel: 80, order: 1, active: true, evidenceRequired: true, operationalReportsQualifyAsEvidence: true, practicalAssignmentTypes: [] }];
  const result = resolveSuccessionPath(value, { fromRole: "Cashier - Front", toRole: "Operation Supervisor" });
  assert.equal(result.path.code, "FRONT_CASHIER_TO_OPERATION_SUPERVISOR");
  assert.deepEqual(result.competencies.map((item) => item.code), ["SERVICE"]);
});
