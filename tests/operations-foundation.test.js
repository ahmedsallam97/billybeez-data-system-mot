const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createsAttendanceExpectation,
  datesInPeriod,
  getOperationalSchedulePeriod,
  normalizeScheduleCode,
} = require("../lib/operations/schedule");
const {
  maskNationalId,
  normalizeOperationsEmployee,
  validateHrisNumber,
  validateNationalId,
} = require("../lib/operations/employees");
const {
  MINUTES_PER_OVERTIME_DAY,
  assertNonNegativeBalance,
  hoursToMinutes,
  overtimeSummary,
} = require("../lib/operations/overtime");
const { allocateLeaveDates, assertLeaveEligible, assertNonNegativeLeaveBalance, attendanceStatusForLeaveType, leaveDateRange, smartLeaveSplit } = require("../lib/operations/leave");
const { assertSuccessionPath, normalizeSuccessionRole } = require("../lib/operations/succession");
const { isFinalizedRecognitionCompetition, publicScoreBreakdown } = require("../lib/operations/recognition");
const { formatTime12, frontAssignment, scheduleGroup, scheduleSummary } = require("../lib/operations/roster");
const { defaultAttendanceStatus } = require("../lib/operations/attendance");

test("operational schedule periods preserve January, normal, and December rules", () => {
  assert.deepEqual(getOperationalSchedulePeriod(2026, 1), { startDate: "2026-01-01", endDate: "2026-01-15" });
  assert.deepEqual(getOperationalSchedulePeriod(2026, 5), { startDate: "2026-04-16", endDate: "2026-05-15" });
  assert.deepEqual(getOperationalSchedulePeriod(2026, 12), { startDate: "2026-11-16", endDate: "2026-12-31" });
  assert.equal(datesInPeriod(getOperationalSchedulePeriod(2026, 5)).length, 30);
});

test("schedule normalization preserves raw historical variants", () => {
  assert.deepEqual(normalizeScheduleCode("BW1").metadata, { historicalVariant: "BW1" });
  assert.equal(normalizeScheduleCode("BW2").code, "BW");
  assert.deepEqual(normalizeScheduleCode("AM Front").metadata, { frontAssignment: "FRONT_CASHIER" });
  assert.equal(normalizeScheduleCode("PM Front").code, "PM");
});

test("N/A and overtime occurrences create no attendance expectation", () => {
  assert.equal(createsAttendanceExpectation("N/A"), false);
  assert.equal(createsAttendanceExpectation("OverTime"), false);
  assert.equal(createsAttendanceExpectation(""), false);
  assert.equal(createsAttendanceExpectation("AM"), true);
  assert.equal(createsAttendanceExpectation("M"), true);
});

test("employee identifiers enforce HRIS, Part-Time, and National ID rules", () => {
  assert.equal(validateHrisNumber("12345"), "12345");
  assert.throws(() => validateHrisNumber("MOT-12345"), /5 digits/);
  assert.equal(validateNationalId("12345678901234"), "12345678901234");
  assert.throws(() => validateNationalId("1234"), /14 digits/);
  assert.equal(maskNationalId("12345678901234"), "**********1234");
  assert.throws(() => normalizeOperationsEmployee({ employmentType: "PART_TIME" }), /local employee code/);
  assert.throws(() => normalizeOperationsEmployee({ employmentType: "PART_TIME", localEmployeeCode: "MOT-PT-001", hrisNumber: "22342" }), /cannot have/);
});

test("overtime uses minute precision, eight-hour days, and negative protection", () => {
  assert.equal(MINUTES_PER_OVERTIME_DAY, 480);
  assert.equal(hoursToMinutes("8.5"), 510);
  assert.deepEqual(overtimeSummary(555), {
    balanceMinutes: 555,
    totalHours: 9.25,
    availableDays: 1,
    remainingMinutes: 75,
    remainingHours: 1.25,
  });
  assert.throws(() => assertNonNegativeBalance(60, -61), /negative/);
  assert.doesNotThrow(() => assertNonNegativeBalance(60, -60));
});

test("replacement excludes Part-Time employees without HRIS", () => {
  assert.throws(() => assertLeaveEligible({ employmentType: "PART_TIME", hrisNumber: null }, "REPLACEMENT"), /HRIS/);
  assert.doesNotThrow(() => assertLeaveEligible({ employmentType: "HRIS", hrisNumber: "22342" }, "REPLACEMENT"));
});

test("leave balances cannot be negative and smart split respects eligibility", () => {
  assert.throws(() => assertNonNegativeLeaveBalance(1, -2), /negative/);
  assert.deepEqual(smartLeaveSplit(3, [{ leaveType: "ANNUAL", balance: 2 }, { leaveType: "REPLACEMENT", balance: 4 }], { employmentType: "HRIS", hrisNumber: "22342" }), [{ leaveType: "ANNUAL", amount: 2 }, { leaveType: "REPLACEMENT", amount: 1 }]);
  assert.throws(() => smartLeaveSplit(3, [{ leaveType: "ANNUAL", balance: 2 }, { leaveType: "REPLACEMENT", balance: 4 }], { employmentType: "PART_TIME", hrisNumber: null }), /insufficient/);
});

test("leave bookings expand dates and allocate annual before replacement", () => {
  const employee = { employmentType: "HRIS", hrisNumber: "22342" };
  const dates = leaveDateRange("2026-09-13", "2026-09-15");
  assert.deepEqual(dates, ["2026-09-13", "2026-09-14", "2026-09-15"]);
  assert.deepEqual(allocateLeaveDates(dates, [{ leaveType: "ANNUAL", balance: 2 }, { leaveType: "REPLACEMENT", balance: 4 }], employee), [
    { leaveDate: "2026-09-13", leaveType: "ANNUAL", amount: 1 },
    { leaveDate: "2026-09-14", leaveType: "ANNUAL", amount: 1 },
    { leaveDate: "2026-09-15", leaveType: "REPLACEMENT", amount: 1 },
  ]);
  assert.equal(attendanceStatusForLeaveType("ANNUAL"), "LEAVE");
  assert.equal(attendanceStatusForLeaveType("REPLACEMENT"), "REPLACEMENT_LEAVE");
  assert.throws(() => leaveDateRange("2026-09-15", "2026-09-13"), /valid leave date range/);
});

test("succession aliases and paths remain deterministic and advisory", () => {
  assert.equal(normalizeSuccessionRole("Cashier - Front"), "Front Cashier");
  assert.deepEqual(assertSuccessionPath("Cashier - Front", "Operation Supervisor"), { currentRole: "Front Cashier", targetRole: "Operation Supervisor" });
  assert.throws(() => assertSuccessionPath("Operation Supervisor", "Ride Operator"), /not allowed/);
});

test("recognition includes only locked competitions with a winner", () => {
  assert.equal(isFinalizedRecognitionCompetition({ status: "LOCKED", winnerEmployeeId: "employee-1" }), true);
  assert.equal(isFinalizedRecognitionCompetition({ status: "REOPENED", winnerEmployeeId: "employee-1" }), false);
  assert.equal(isFinalizedRecognitionCompetition({ status: "LOCKED", winnerEmployeeId: null }), false);
});

test("recognition exposes only supported score breakdown fields", () => {
  assert.deepEqual(publicScoreBreakdown(JSON.stringify({ discipline: 80, finalScore: 95, comment: "stored", internal: 12 })), { discipline: 80, finalScore: 95 });
  assert.deepEqual(publicScoreBreakdown("invalid"), {});
});

test("daily approval preview groups only AM, BW, and PM as working shifts", () => {
  const rows = [
    { code: "AM", shiftCode: "AM", metadata: { normalization: { frontAssignment: "FRONT_CASHIER" } } },
    { code: "BW", shiftCode: "BW" },
    { code: "PM", shiftCode: "PM" },
    { code: "MISSION", shiftCode: "MISSION" },
    { code: "NOT_APPLICABLE", shiftCode: null },
    { code: "OFF", shiftCode: null },
  ];
  assert.deepEqual(rows.map(scheduleGroup), ["AM", "BW", "PM", "Mission", "N/A", "OFF"]);
  assert.deepEqual(scheduleSummary(rows), { totalScheduledWorkers: 3, am: 1, bw: 1, pm: 1, front: 1, off: 1, leave: 0, otherNonWorking: 1, notApplicable: 1 });
  assert.equal(frontAssignment(rows[0].metadata), "FRONT_CASHIER");
});

test("daily approval preview formats published shift times without attendance", () => {
  assert.equal(formatTime12("09:00"), "9:00 AM");
  assert.equal(formatTime12("13:00"), "1:00 PM");
  assert.equal(formatTime12("23:00"), "11:00 PM");
});

test("new attendance defaults follow published working expectations", () => {
  assert.equal(defaultAttendanceStatus("AM"), "PRESENT");
  assert.equal(defaultAttendanceStatus("BW"), "PRESENT");
  assert.equal(defaultAttendanceStatus("PM"), "PRESENT");
  assert.equal(defaultAttendanceStatus("MISSION"), "PRESENT");
  assert.equal(defaultAttendanceStatus("OFF"), null);
  assert.equal(defaultAttendanceStatus("NOT_APPLICABLE"), null);
});
