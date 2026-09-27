const test = require("node:test");
const assert = require("node:assert/strict");
const { attendanceGroupFromSchedule, buildScheduleAttendanceSummary, scheduleGroup } = require("../lib/operations/schedule-attendance-summary");

test("shift totals contain shifts only and infer attendance from the published roster", () => {
  const scheduleAssignments = [
    { workDate: "2026-09-01", code: "AM", shiftCode: "AM", schedule: { status: "PUBLISHED", version: 1 } },
    { workDate: "2026-09-02", code: "PM", shiftCode: "PM", schedule: { status: "PUBLISHED", version: 1 } },
    { workDate: "2026-09-03", code: "ANNUAL", schedule: { status: "PUBLISHED", version: 1 } },
    { workDate: "2026-09-04", code: "REP", schedule: { status: "PUBLISHED", version: 1 } },
    { workDate: "2026-09-05", code: "SL", schedule: { status: "PUBLISHED", version: 1 } },
    { workDate: "2026-09-06", code: "OFF", schedule: { status: "PUBLISHED", version: 1 } },
    { workDate: "2026-09-07", code: "NOT_APPLICABLE", schedule: { status: "PUBLISHED", version: 1 } },
  ];
  const result = buildScheduleAttendanceSummary({ scheduleAssignments }, 2026, "2026-09-27");
  const september = result.rows[8];
  assert.deepEqual({ AM: september.AM, PM: september.PM, OFF: september.OFF, workingDays: september.workingDays }, { AM: 1, PM: 1, OFF: 1, workingDays: 2 });
  assert.deepEqual({ present: september.present, annual: september.annual, replacement: september.replacement, sickLeave: september.sickLeave, attendanceOff: september.attendanceOff, attendanceTotal: september.attendanceTotal }, { present: 2, annual: 1, replacement: 1, sickLeave: 1, attendanceOff: 1, attendanceTotal: 6 });
  assert.equal(Object.hasOwn(september, "OTHER"), false);
  assert.equal(Object.hasOwn(september, "ANNUAL"), false);
});

test("actual attendance overrides inferred roster attendance", () => {
  const scheduleAssignments = [
    { workDate: "2026-09-01", code: "AM", shiftCode: "AM" },
    { workDate: "2026-09-02", code: "PM", shiftCode: "PM" },
    { workDate: "2026-09-03", code: "PM", shiftCode: "PM" },
  ];
  const attendanceRecords = [
    { status: "ABSENT", attendanceDay: { workDate: "2026-09-01", version: 1 } },
    { status: "SICK_LEAVE", attendanceDay: { workDate: "2026-09-02", version: 1 } },
    { status: "MISSING", attendanceDay: { workDate: "2026-09-03", version: 1 } },
  ];
  const result = buildScheduleAttendanceSummary({ scheduleAssignments, attendanceRecords }, 2026, "2026-09-27");
  assert.deepEqual({ present: result.rows[8].present, absent: result.rows[8].absent, sickLeave: result.rows[8].sickLeave }, { present: 1, absent: 1, sickLeave: 1 });
});

test("one published schedule and the newest attendance version win for each date", () => {
  const scheduleAssignments = [
    { workDate: "2026-09-10", code: "PM", shiftCode: "PM", schedule: { status: "SUPERSEDED", version: 4 } },
    { workDate: "2026-09-10", code: "AM", shiftCode: "AM", schedule: { status: "PUBLISHED", version: 3 } },
  ];
  const attendanceRecords = [
    { status: "PRESENT", attendanceDay: { workDate: "2026-09-10", version: 1 } },
    { status: "ABSENT", attendanceDay: { workDate: "2026-09-10", version: 2 } },
  ];
  const september = buildScheduleAttendanceSummary({ scheduleAssignments, attendanceRecords }, 2026, "2026-09-27").rows[8];
  assert.deepEqual({ AM: september.AM, PM: september.PM, present: september.present, absent: september.absent, attendanceTotal: september.attendanceTotal }, { AM: 1, PM: 0, present: 0, absent: 1, attendanceTotal: 1 });
});

test("schedule leave codes map to their attendance columns", () => {
  assert.equal(scheduleGroup({ code: "AM Front", shiftCode: "AM Front" }), "AM");
  assert.equal(scheduleGroup({ code: "Annual" }), null);
  assert.equal(attendanceGroupFromSchedule({ code: "Annual" }), "annual");
  assert.equal(attendanceGroupFromSchedule({ code: "Rep" }), "replacement");
  assert.equal(attendanceGroupFromSchedule({ code: "SL" }), "sickLeave");
  assert.equal(attendanceGroupFromSchedule({ code: "Holiday" }), "holiday");
  assert.equal(attendanceGroupFromSchedule({ code: "AWP" }), "AWP");
  assert.equal(attendanceGroupFromSchedule({ code: "ANP" }), "ANP");
  assert.equal(attendanceGroupFromSchedule({ code: "Unpaid" }), "unpaid");
  assert.equal(attendanceGroupFromSchedule({ code: "N/A" }), null);
});

test("completed years include all twelve months while current years stop at today", () => {
  const completed = buildScheduleAttendanceSummary({}, 2025, "2026-09-27");
  const current = buildScheduleAttendanceSummary({}, 2026, "2026-09-27");
  assert.equal(completed.rows.length, 12);
  assert.equal(completed.complete, true);
  assert.equal(current.rows.length, 9);
  assert.equal(current.complete, false);
});
