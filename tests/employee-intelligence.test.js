const test = require("node:test");
const assert = require("node:assert/strict");
const { annualEmployeeInsights } = require("../lib/operations/employee-intelligence");
const { formatPerformanceScore } = require("../lib/operations/score-format");

test("raw monthly totals use points and only the latest approved version informs intelligence", () => {
  const result = annualEmployeeInsights({ monthlyAppraisals: [
    { employeeId: "e", year: 2026, month: 1, version: 1, status: "APPROVED", totalScore: 300 },
    { employeeId: "e", year: 2026, month: 1, version: 2, status: "APPROVED", totalScore: 355 },
    { employeeId: "e", year: 2026, month: 2, version: 1, status: "DRAFT", totalScore: 999 },
  ] }, 2026, "2026-03-31");
  assert.equal(result.performanceScore, 355);
  assert.equal(result.performanceUnit, "points");
  assert.equal(formatPerformanceScore(result.performanceScore, result.performanceUnit), "355 points");
  assert.equal(result.strengths.some((x) => x.includes("355%")), false);
  assert.notEqual(result.recommendation, "READY_FOR_MORE");
});

test("unreviewed daily defaults never imply performance and leave does not lower attendance", () => {
  const result = annualEmployeeInsights({ dailyEvaluations: [{ status: "DEFAULT_FULL", finalScore: 50, maxScore: 50, dailyEvaluationDay: { evaluationDate: "2026-03-10" } }], attendanceRecords: [
    { status: "PRESENT", expectedCode: "AM", attendanceDay: { workDate: "2026-03-10" } },
    { status: "LEAVE", expectedCode: "SL", attendanceDay: { workDate: "2026-03-11" } },
    { status: "UNEXPECTED_PRESENT", expectedCode: "OFF", attendanceDay: { workDate: "2026-03-12" } },
  ] }, 2026, "2026-03-31");
  assert.equal(result.performanceScore, null);
  assert.equal(result.attendanceRate, 100);
  assert.equal(result.expected, 1);
});

test("annual intelligence limits current-year data to the selected calendar end date", () => {
  const result = annualEmployeeInsights({
    attendanceRecords: [{ status: "PRESENT", expectedCode: "AM", attendanceDay: { workDate: "2026-03-10" } }, { status: "ABSENT", expectedCode: "PM", attendanceDay: { workDate: "2026-08-10" } }],
    monthlyAppraisals: [{ year: 2026, month: 3, status: "APPROVED", totalScore: 90 }, { year: 2026, month: 8, status: "APPROVED", totalScore: 20 }],
    recognition: [{ year: 2026, month: 2 }, { year: 2026, month: 10 }], trainingRecords: [], documents: [], qualifications: [], operationalPositions: [], dailyEvaluations: [],
  }, 2026, "2026-03-31");
  assert.equal(result.expected, 1); assert.equal(result.absences, 0); assert.equal(result.performanceScore, 90); assert.equal(result.recognition.length, 1);
});

test("annual intelligence uses evidence instead of inventing a recommendation", () => {
  const result = annualEmployeeInsights({ attendanceRecords: [], monthlyAppraisals: [], recognition: [], trainingRecords: [], dailyEvaluations: [], documents: [{ expiryStatus: "EXPIRED" }], qualifications: [], operationalPositions: [] }, 2026, "2026-09-15");
  assert.equal(result.recommendation, "FOLLOW_UP"); assert.equal(result.signals[0].code, "DOCUMENT");
});
