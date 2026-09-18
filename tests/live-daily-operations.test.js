const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildExpectedTeam,
  mergeExpectedActual,
  canAssign,
  generateRotation,
  buildReadiness,
  needsAttention,
  closeDayValidation,
} = require("../lib/operations/live-daily");
const { previewCardLines } = require("../lib/operations/daily-preview");

const employee = (id, code = "AM") => ({
  id: `sa-${id}`,
  employeeId: id,
  code,
  shiftCode: ["AM", "BW", "PM"].includes(code) ? code : null,
  employee: { id, name: id, department: "OPERATION" },
  importMetadata: null,
});
const position = (
  id,
  code,
  requiresQualification = true,
  critical = false,
) => ({
  id,
  code,
  label: code,
  requiresQualification,
  critical,
  staffingRequirements: [
    {
      shiftCode: "AM",
      minEmployees: 1,
      effectiveFrom: "2026-01-01",
      effectiveTo: null,
    },
  ],
});

test("published schedule builds expected team without turning non-working codes into attendance", () => {
  const expected = buildExpectedTeam(
    [employee("a"), employee("b", "OFF"), employee("c", "NOT_APPLICABLE")],
    { AM: { startTime: "09:00", endTime: "17:00" } },
  );
  assert.equal(expected[0].working, true);
  assert.equal(expected[1].working, false);
  assert.equal(expected[2].notApplicable, true);
  assert.equal(
    mergeExpectedActual(expected, [], false)[0].attendanceState,
    "NOT_REQUIRED",
  );
});

test("qualification gates and same-hour exclusivity protect automatic rotation", () => {
  const pos = [
    position("locker", "LOCKER", false),
    position("tower", "TOWER", true, true),
  ];
  const team = buildExpectedTeam([employee("a")], {
    AM: { startTime: "09:00", endTime: "17:00" },
  }).map((x) => ({ ...x, liveDay: false }));
  assert.equal(
    canAssign({ qualifications: [], employeeId: "a", position: pos[0] }),
    true,
  );
  assert.equal(
    canAssign({ qualifications: [{ employeeId: "b", operationalPositionId: "tower", status: "QUALIFIED" }], employeeId: "a", position: pos[1] }),
    false,
  );
  const result = generateRotation({
    workDate: "2026-09-15",
    team,
    positions: pos,
    qualifications: [{ employeeId: "b", operationalPositionId: "tower", status: "QUALIFIED" }],
    slots: [{ shiftCode: "AM", startTime: "09:00", endTime: "10:00" }],
  });
  assert.equal(result.assignments.length, 1);
  assert.equal(result.assignments[0].positionCode, "LOCKER");
  assert.ok(result.alerts.some((x) => x.positionCode === "TOWER"));
});

test("break conflicts remove an otherwise eligible employee", () => {
  const result = generateRotation({
    workDate: "2026-09-15",
    team: buildExpectedTeam([employee("a")], { AM: {} }).map((x) => ({
      ...x,
      liveDay: false,
    })),
    positions: [position("locker", "LOCKER", false)],
    breaks: [
      {
        employeeId: "a",
        startTime: "09:00",
        endTime: "10:00",
        status: "PLANNED",
      },
    ],
    slots: [{ shiftCode: "AM", startTime: "09:00", endTime: "10:00" }],
  });
  assert.equal(result.assignments.length, 0);
  assert.equal(result.alerts[0].code, "POSITION_SHORTAGE");
});

test("cashiers remain first-line roster staff but never receive operational rotations", () => {
  const cashier = employee("cashier");
  cashier.employee.department = "CASHIER";
  const leader = employee("leader");
  leader.employee.operationsTeamLeader = true;
  const operator = employee("operator");
  const result = generateRotation({
    workDate: "2026-09-17",
    team: buildExpectedTeam([cashier, leader, operator], { AM: {} }).map((item) => ({ ...item, liveDay: false })),
    positions: [position("locker", "LOCKER", false)],
    slots: [{ shiftCode: "AM", startTime: "10:00", endTime: "11:00" }],
  });
  assert.equal(result.assignments.length, 1);
  assert.equal(result.assignments[0].employeeId, "operator");
});

test("overlapping shifts never duplicate the same position in the same hour", () => {
  const locker = position("locker", "LOCKER", false);
  locker.staffingRequirements.push({ shiftCode: "PM", minEmployees: 1, effectiveFrom: "2026-01-01", effectiveTo: null });
  const morning = employee("morning", "AM");
  const night = employee("night", "PM");
  const result = generateRotation({
    workDate: "2026-09-17",
    team: buildExpectedTeam([morning, night], { AM: {}, PM: {} }).map((item) => ({ ...item, liveDay: false })),
    positions: [locker],
    slots: [
      { shiftCode: "AM", startTime: "15:00", endTime: "16:00" },
      { shiftCode: "PM", startTime: "15:00", endTime: "16:00" },
    ],
  });
  assert.equal(result.assignments.length, 1);
  assert.equal(result.assignments[0].positionCode, "LOCKER");
});

test("readiness and attention expose trip, wristband, cashier and coverage blockers", () => {
  const coverage = [
    {
      shiftCode: "AM",
      positionCode: "CASHIER",
      assigned: 0,
      shortage: 1,
      critical: true,
      positionLabel: "Cashier",
    },
  ];
  const readiness = buildReadiness({
    schedule: { id: "s" },
    team: [{ working: true }],
    liveDay: false,
    attendanceDay: null,
    coverage,
    trips: [{ expectedChildren: 20, staffingRequired: 2 }],
    wristbands: [],
  });
  assert.equal(readiness.mode, "PLANNING");
  assert.equal(readiness.checks.find((x) => x.code === "ATTENDANCE").ok, true);
  assert.equal(readiness.checks.find((x) => x.code === "WRISTBANDS").ok, false);
  const alerts = needsAttention({ readiness, team: [], coverage, notices: [] });
  assert.equal(alerts[0].severity, "CRITICAL");
});

test("close validation blocks incomplete days and preview binds real planning data", () => {
  assert.equal(
    closeDayValidation({
      attendanceDay: null,
      alerts: [{ severity: "CRITICAL" }],
      rotationAssignments: [],
      breaks: [],
    }).ready,
    false,
  );
  assert.deepEqual(previewCardLines("trips", { trips: [] }), [
    "No trips planned",
  ]);
  assert.match(
    previewCardLines("offers", {
      offers: [{ title: "Weekend", details: "25%" }],
    }).join(" "),
    /Weekend/,
  );
  assert.match(
    previewCardLines("bracelets", {
      wristbands: [
        {
          wristbandType: "Kids",
          color: "Red",
          availableStock: 10,
          allocated: 3,
          issued: 2,
        },
      ],
    })[0],
    /5 remaining/,
  );
  assert.deepEqual(previewCardLines("bracelets", { wristbands: [{ wristbandType: "SOCKS_M_YELLOW", stockCategory: "SOCKS", availableStock: 10, allocated: 0, issued: 0 }] }), ["No wristband stock recorded"]);
});
