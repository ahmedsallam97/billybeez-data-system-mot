const test = require("node:test");
const assert = require("node:assert/strict");
const { annualEmployeeInsights } = require("../lib/operations/employee-intelligence");

test("annual intelligence limits current-year data to the selected calendar end date", () => {
  const result = annualEmployeeInsights({
    attendanceRecords: [{ status: "PRESENT", expectedCode: "AM", attendanceDay: { workDate: "2026-03-10" } }, { status: "ABSENT", expectedCode: "PM", attendanceDay: { workDate: "2026-08-10" } }],
    monthlyAppraisals: [{ year: 2026, month: 3, totalScore: 90 }, { year: 2026, month: 8, totalScore: 20 }],
    recognition: [{ year: 2026, month: 2 }, { year: 2026, month: 10 }], trainingRecords: [], documents: [], qualifications: [], operationalPositions: [], dailyEvaluations: [],
  }, 2026, "2026-03-31");
  assert.equal(result.expected, 1); assert.equal(result.absences, 0); assert.equal(result.performanceScore, 90); assert.equal(result.recognition.length, 1);
});

test("annual intelligence uses evidence instead of inventing a recommendation", () => {
  const result = annualEmployeeInsights({ attendanceRecords: [], monthlyAppraisals: [], recognition: [], trainingRecords: [], dailyEvaluations: [], documents: [{ expiryStatus: "EXPIRED" }], qualifications: [], operationalPositions: [] }, 2026, "2026-09-15");
  assert.equal(result.recommendation, "FOLLOW_UP"); assert.equal(result.signals[0].code, "DOCUMENT");
});
