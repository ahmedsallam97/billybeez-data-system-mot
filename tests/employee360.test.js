const test = require("node:test");
const assert = require("node:assert/strict");
const { documentExpiryStatus, sectionsForFile, buildEmployeeTimeline } = require("../lib/operations/employee360");

test("Employee 360 classifies document expiry without changing records", () => {
  const now = new Date("2026-09-13T00:00:00Z");
  assert.equal(documentExpiryStatus(null, now), "NO_EXPIRY");
  assert.equal(documentExpiryStatus("2026-09-12", now), "EXPIRED");
  assert.equal(documentExpiryStatus("2026-09-30", now), "EXPIRING_SOON");
  assert.equal(documentExpiryStatus("2026-11-01", now), "VALID");
});

test("Employee 360 file modes expose the intended sections", () => {
  assert.deepEqual(sectionsForFile("STANDARD"), ["Overview", "Employment", "Schedule & Attendance"]);
  assert.ok(sectionsForFile("FULL_RESTRICTED").includes("Personal"));
  assert.ok(sectionsForFile("MANAGEMENT").includes("Guest Feedback"));
  assert.ok(sectionsForFile("MANAGEMENT").includes("Guidance & Penalties"));
  assert.deepEqual(sectionsForFile("CUSTOM", ["Overview", "Timeline"]), ["Overview", "Timeline"]);
});

test("Employee 360 timeline aggregates source records and orders them newest first", () => {
  const result = buildEmployeeTimeline({
    employmentEvents: [{ effectiveDate: "2026-01-01", eventType: "POSITION_CHANGE", newValue: "Lead" }],
    documents: [{ uploadedAt: "2026-09-12", documentType: "CONTRACT", displayName: "contract.pdf" }],
    guestFeedback: [{ feedbackDate: "2026-09-14", source: "GUEST", rating: 5, comment: "Helpful" }],
    guidanceRecords: [{ recordDate: "2026-09-13", recordType: "COMMENDATION", title: "Excellent shift", status: "CLOSED" }],
    trainingRecords: [], qualifications: [], scheduleAssignments: [], attendanceRecords: [], dailyEvaluations: [], monthlyAppraisals: [], eotmWins: [], successionCandidates: [],
  });
  assert.equal(result.length, 4);
  assert.equal(result[0].type, "GUEST_FEEDBACK");
  assert.equal(result[1].type, "COMMENDATION");
  assert.equal(result[2].type, "DOCUMENT");
  assert.equal(result[3].title, "POSITION_CHANGE");
});
