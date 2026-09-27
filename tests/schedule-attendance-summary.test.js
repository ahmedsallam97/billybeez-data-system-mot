const test = require("node:test");
const assert = require("node:assert/strict");
const { buildScheduleAttendanceSummary } = require("../lib/operations/schedule-attendance-summary");

test("Employee 360 summarizes one canonical schedule per day and hides future months", () => {
  const scheduleAssignments = [
    { id: "old", workDate: "2026-01-02", code: "PM", shiftCode: "PM", schedule: { status: "SUPERSEDED", version: 4 } },
    { id: "live", workDate: "2026-01-02", code: "AM", shiftCode: "AM", schedule: { status: "PUBLISHED", version: 3 } },
    { id: "pm", workDate: "2026-01-03", code: "PM", shiftCode: "PM", schedule: { status: "PUBLISHED", version: 3 } },
    { id: "annual", workDate: "2026-01-04", code: "Annual", schedule: { status: "PUBLISHED", version: 3 } },
    { id: "future", workDate: "2026-10-01", code: "AM", shiftCode: "AM", schedule: { status: "PUBLISHED", version: 3 } },
  ];
  const result = buildScheduleAttendanceSummary({ scheduleAssignments }, 2026, "2026-09-27");
  assert.equal(result.complete, false);
  assert.equal(result.rows.length, 9);
  assert.deepEqual(result.rows.map((row) => row.month), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.deepEqual({ AM: result.rows[0].AM, PM: result.rows[0].PM, ANNUAL: result.rows[0].ANNUAL, workingDays: result.rows[0].workingDays }, { AM: 1, PM: 1, ANNUAL: 1, workingDays: 2 });
  assert.equal(result.totals.AM, 1);
  assert.equal(result.rows.some((row) => row.month === 10), false);
});

test("Employee 360 attendance totals use the newest day version and show a completed year", () => {
  const attendanceRecords = [
    { id: "v1", status: "PRESENT", attendanceDay: { workDate: "2025-03-10", version: 1 } },
    { id: "v2", status: "ABSENT", attendanceDay: { workDate: "2025-03-10", version: 2 } },
    { id: "late", status: "PRESENT", lateMinutes: 12, attendanceDay: { workDate: "2025-03-11", version: 1 } },
    { id: "leave", status: "LEAVE", attendanceDay: { workDate: "2025-03-12", version: 1 } },
  ];
  const result = buildScheduleAttendanceSummary({ attendanceRecords }, 2025, "2026-09-27");
  assert.equal(result.complete, true);
  assert.equal(result.rows.length, 12);
  assert.equal(result.rows[2].absent, 1);
  assert.equal(result.rows[2].present, 1);
  assert.equal(result.rows[2].late, 1);
  assert.equal(result.rows[2].excused, 1);
  assert.equal(result.totals.attendanceTotal, 3);
});
