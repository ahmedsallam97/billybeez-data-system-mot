const { stockAvailable } = require("./planning");

const WORKING_CODES = new Set(["AM", "BW", "PM", "MISSION"]);
const LIVE_ATTENDANCE = new Set([
  "PRESENT",
  "LATE",
  "EARLY_LEAVE",
  "UNEXPECTED_PRESENT",
]);
const STRONG_HIGHLIGHT_POSITIONS = new Set(["DROP", "TOWER", "DATA"]);
const LEAVE_CODES = new Set(["ANNUAL", "REP", "SL", "UNPAID", "HOLIDAY", "H"]);
const DEFAULT_ROTATION_RULES = {
  slotsPerShift: 8,
  preserveManualLocks: true,
  excludeCashiers: true,
  prioritizeMandatoryPositions: true,
  mandatoryPositionCodes: ["DATA"],
  avoidConsecutivePosition: true,
  optionalOnlyWhenFullyStaffed: true,
};

function normalizeRotationRules(value = {}) {
  return { ...DEFAULT_ROTATION_RULES, ...(value || {}), mandatoryPositionCodes: Array.isArray(value?.mandatoryPositionCodes) ? value.mandatoryPositionCodes : DEFAULT_ROTATION_RULES.mandatoryPositionCodes };
}

function parseMetadata(value) {
  if (!value) return {};
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

function buildExpectedTeam(assignments, shifts = {}) {
  return assignments.map((item) => {
    const metadata = parseMetadata(item.importMetadata || item.metadata);
    const shiftCode =
      item.shiftCode || (WORKING_CODES.has(item.code) ? item.code : null);
    const shift = shifts[shiftCode] || {};
    return {
      assignmentId: item.id,
      employeeId: item.employeeId || item.employee?.id,
      employee: item.employee,
      code: item.code,
      shiftCode,
      expectedStart: shift.startTime || null,
      expectedEnd: shift.endTime || null,
      frontAssignment:
        metadata?.normalization?.frontAssignment ||
        metadata?.frontAssignment ||
        null,
      working: WORKING_CODES.has(item.code) && item.code !== "NOT_APPLICABLE",
      notApplicable: item.code === "NOT_APPLICABLE",
    };
  });
}

function mergeExpectedActual(
  expectedTeam,
  attendanceRecords = [],
  liveDay = true,
) {
  const actualByEmployee = new Map(
    attendanceRecords.map((item) => [item.employeeId, item]),
  );
  return expectedTeam.map((item) => ({
    ...item,
    attendance: actualByEmployee.get(item.employeeId) || null,
    attendanceState:
      actualByEmployee.get(item.employeeId)?.status ||
      (liveDay && item.working ? "MISSING" : "NOT_REQUIRED"),
  }));
}

function employeeAvailable(member, liveDay) {
  if (!member.working) return false;
  if (!liveDay || !member.attendance) return true;
  return LIVE_ATTENDANCE.has(member.attendance.status);
}

function overlaps(firstStart, firstEnd, secondStart, secondEnd) {
  return firstStart < secondEnd && secondStart < firstEnd;
}
function onBreak(breaks, employeeId, startTime, endTime) {
  return breaks.some(
    (item) =>
      item.employeeId === employeeId &&
      item.status !== "CANCELLED" &&
      overlaps(startTime, endTime, item.startTime, item.endTime),
  );
}

function qualificationState(qualifications, employeeId, position) {
  if (!position.requiresQualification) return "NOT_REQUIRED";
  const configuredForPosition = qualifications.some((entry) => entry.operationalPositionId === position.id);
  if (!configuredForPosition) return "NOT_REQUIRED";
  const item = qualifications.find(
    (entry) =>
      entry.employeeId === employeeId &&
      entry.operationalPositionId === position.id,
  );
  return item?.status || "NOT_QUALIFIED";
}

function canAssign({ qualifications, employeeId, position }) {
  return ["QUALIFIED", "NOT_REQUIRED"].includes(
    qualificationState(qualifications, employeeId, position),
  );
}

function activeRequirements(positions, shiftCode, workDate) {
  return positions.flatMap((position) =>
    (position.staffingRequirements || [])
      .filter(
        (item) =>
          item.shiftCode === shiftCode &&
          item.effectiveFrom <= workDate &&
          (!item.effectiveTo || item.effectiveTo >= workDate),
      )
      .map((requirement) => ({ position, requirement })),
  );
}

function seededRank(value) {
  let hash = 2166136261;
  for (const character of String(value)) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function generateRotation({
  workDate,
  team,
  positions,
  qualifications = [],
  breaks = [],
  slots = [],
  rules = {},
  fixedAssignments = [],
}) {
  const normalizedRules = normalizeRotationRules(rules);
  const assignments = fixedAssignments.map((item) => ({
    employeeId: item.employeeId,
    operationalPositionId: item.operationalPositionId || item.position?.id,
    positionCode: item.positionCode || item.position?.code,
    shiftCode: item.shiftCode,
    startTime: item.startTime,
    endTime: item.endTime,
    manualLock: true,
    source: item.source || "MANUAL",
    overrideReason: item.overrideReason || null,
  }));
  const alerts = [];
  const used = new Map();
  assignments.forEach((item) => used.set(item.employeeId, (used.get(item.employeeId) || 0) + 1));
  const scheduledWorking = team.filter((member) => member.working);
  const working = team.filter((member) =>
    employeeAvailable(member, Boolean(member.liveDay)),
  );
  const hasLeave = team.some((member) => LEAVE_CODES.has(String(member.code || "").toUpperCase()));
  const fullyStaffed = !hasLeave && working.length === scheduledWorking.length;
  for (const slot of slots) {
    const mandatoryCodes = new Set(normalizedRules.mandatoryPositionCodes || []);
    const requirements = activeRequirements(positions, slot.shiftCode, workDate)
      .filter(({ position }) => !normalizedRules.optionalOnlyWhenFullyStaffed || fullyStaffed || position.critical || mandatoryCodes.has(position.code))
      .sort((left, right) => {
      const leftMandatory = Number(left.position.critical || mandatoryCodes.has(left.position.code));
      const rightMandatory = Number(right.position.critical || mandatoryCodes.has(right.position.code));
      if (leftMandatory !== rightMandatory) return rightMandatory - leftMandatory;
      const priorityDifference = Number(left.position.sortOrder || 0) - Number(right.position.sortOrder || 0);
      if (priorityDifference) return priorityDifference;
      return seededRank(`${workDate}:${slot.startTime}:${left.position.code}`) - seededRank(`${workDate}:${slot.startTime}:${right.position.code}`);
    });
    for (const { position, requirement } of requirements) {
      if (position.code === "CASHIER") continue;
      const fixedCashiers =
        position.code === "CASHIER"
          ? working.filter(
              (member) =>
                member.shiftCode === slot.shiftCode &&
                member.frontAssignment === "FRONT_CASHIER",
            )
          : [];
      const pool =
        position.code === "CASHIER"
          ? fixedCashiers
          : working.filter(
              (member) =>
                member.shiftCode === slot.shiftCode &&
                !member.frontAssignment &&
                member.employee?.department !== "CASHIER" &&
                !member.employee?.operationsTeamLeader,
            );
      const alreadyCovered = assignments.filter((assignment) => assignment.operationalPositionId === position.id && overlaps(assignment.startTime, assignment.endTime, slot.startTime, slot.endTime)).length;
      const count = Math.max(0, requirement.minEmployees - alreadyCovered);
      for (let index = 0; index < count; index += 1) {
        const eligible = pool.filter((member) => canAssign({ qualifications, employeeId: member.employeeId, position }) &&
          !onBreak(breaks, member.employeeId, slot.startTime, slot.endTime) &&
          !assignments.some((assignment) => assignment.employeeId === member.employeeId && overlaps(assignment.startTime, assignment.endTime, slot.startTime, slot.endTime)));
        const candidate = eligible.sort((a, b) => {
          if (normalizedRules.avoidConsecutivePosition) {
            const aRepeated = assignments.some((item) => item.employeeId === a.employeeId && item.operationalPositionId === position.id && item.endTime === slot.startTime);
            const bRepeated = assignments.some((item) => item.employeeId === b.employeeId && item.operationalPositionId === position.id && item.endTime === slot.startTime);
            if (aRepeated !== bRepeated) return aRepeated ? 1 : -1;
          }
          const loadDifference =
            (used.get(a.employeeId) || 0) - (used.get(b.employeeId) || 0);
          if (loadDifference) return loadDifference;
          return seededRank(`${workDate}:${slot.startTime}:${position.code}:${a.employeeId}`) -
            seededRank(`${workDate}:${slot.startTime}:${position.code}:${b.employeeId}`);
        })[0];
        if (!candidate) {
          alerts.push({
            severity:
              position.critical || position.code === "CASHIER"
                ? "CRITICAL"
                : "WARNING",
            code: "POSITION_SHORTAGE",
            shiftCode: slot.shiftCode,
            positionCode: position.code,
            message: `${slot.shiftCode} ${position.label}: ${count - index} qualified staff missing`,
          });
          break;
        }
        assignments.push({
          employeeId: candidate.employeeId,
          operationalPositionId: position.id,
          positionCode: position.code,
          shiftCode: slot.shiftCode,
          startTime: slot.startTime,
          endTime: slot.endTime,
          manualLock: position.code === "CASHIER",
          highlight: STRONG_HIGHLIGHT_POSITIONS.has(position.code),
        });
        used.set(
          candidate.employeeId,
          (used.get(candidate.employeeId) || 0) + 1,
        );
      }
    }
  }
  return { assignments, alerts };
}

function coverageFor({
  workDate,
  team,
  positions,
  qualifications = [],
  assignments = [],
}) {
  return ["AM", "BW", "PM"].flatMap((shiftCode) =>
    activeRequirements(positions, shiftCode, workDate).map(
      ({ position, requirement }) => {
        const assigned = assignments.filter(
          (item) =>
            item.shiftCode === shiftCode &&
            (item.operationalPositionId === position.id ||
              item.position?.id === position.id),
        );
        const qualified = team.filter(
          (member) =>
            member.shiftCode === shiftCode &&
            canAssign({
              qualifications,
              employeeId: member.employeeId,
              position,
            }),
        ).length;
        const cashierAssigned = position.code === "CASHIER" ? team.filter((member) => member.shiftCode === shiftCode && member.working && (member.frontAssignment === "FRONT_CASHIER" || member.employee?.department === "CASHIER")).length : null;
        const assignedCount = cashierAssigned == null ? assigned.length : cashierAssigned;
        return {
          shiftCode,
          positionId: position.id,
          positionCode: position.code,
          positionLabel: position.label,
          critical: position.critical,
          required:
            position.code === "CASHIER" && shiftCode === "BW"
              ? 0
              : requirement.minEmployees,
          assigned: assignedCount,
          qualified,
          shortage: Math.max(
            0,
            (position.code === "CASHIER" && shiftCode === "BW"
              ? 0
              : requirement.minEmployees) - assignedCount,
          ),
          highlight: STRONG_HIGHLIGHT_POSITIONS.has(position.code),
        };
      },
    ),
  );
}

function buildReadiness({
  schedule,
  team,
  liveDay,
  attendanceDay,
  coverage = [],
  rotationAssignments = [],
  breaks = [],
  trips = [],
  wristbands = [],
  notices = [],
}) {
  const checks = [];
  checks.push({
    code: "SCHEDULE",
    label: "Published schedule",
    ok: Boolean(schedule),
    critical: true,
  });
  checks.push({
    code: "EXPECTED_TEAM",
    label: "Expected team",
    ok: team.some((item) => item.working),
    critical: true,
  });
  checks.push({
    code: "ATTENDANCE",
    label: liveDay ? "Live attendance" : "Attendance not required for planning",
    ok: !liveDay || Boolean(attendanceDay),
    critical: liveDay,
  });
  checks.push({
    code: "AM_CASHIER",
    label: "AM cashier",
    ok: coverage.some(
      (x) =>
        x.shiftCode === "AM" && x.positionCode === "CASHIER" && x.assigned >= 1,
    ),
    critical: true,
  });
  checks.push({
    code: "PM_CASHIER",
    label: "PM cashier",
    ok: coverage.some(
      (x) =>
        x.shiftCode === "PM" && x.positionCode === "CASHIER" && x.assigned >= 1,
    ),
    critical: true,
  });
  checks.push({
    code: "CRITICAL_COVERAGE",
    label: "Critical position coverage",
    ok: !coverage.some((x) => x.critical && x.shortage > 0),
    critical: true,
  });
  checks.push({
    code: "ROTATION",
    label: "Rotation assignments",
    ok: rotationAssignments.length > 0,
    critical: false,
  });
  checks.push({
    code: "BREAKS",
    label: "Break conflicts",
    ok: !breaks.some((item) =>
      rotationAssignments.some(
        (assignment) =>
          assignment.employeeId === item.employeeId &&
          overlaps(
            item.startTime,
            item.endTime,
            assignment.startTime,
            assignment.endTime,
          ),
      ),
    ),
    critical: false,
  });
  const requiredBracelets = trips.reduce(
    (sum, item) => sum + (item.expectedChildren || 0),
    0,
  );
  const remainingBracelets = wristbands.reduce(
    (sum, item) => sum + stockAvailable(item),
    0,
  );
  checks.push({
    code: "TRIP_STAFFING",
    label: "Trip staffing",
    ok: !trips.some(
      (item) =>
        item.staffingRequired &&
        item.staffingRequired > team.filter((member) => member.working).length,
    ),
    critical: true,
  });
  checks.push({
    code: "WRISTBANDS",
    label: "Wristband availability",
    ok:
      !requiredBracelets ||
      (wristbands.length > 0 && remainingBracelets >= requiredBracelets),
    critical: true,
  });
  checks.push({
    code: "CRITICAL_NOTICES",
    label: "Critical notices",
    ok: !notices.some((item) => item.priority === "CRITICAL"),
    critical: true,
  });
  const applicable = checks.filter(
    (item) => item.code !== "ATTENDANCE" || liveDay,
  );
  const passed = applicable.filter((item) => item.ok).length;
  return {
    mode: liveDay ? "LIVE" : "PLANNING",
    score: applicable.length
      ? Math.round((passed / applicable.length) * 100)
      : 0,
    checks,
    requiredBracelets,
    remainingBracelets,
  };
}

function needsAttention({
  readiness,
  team,
  coverage,
  qualifications = [],
  breaks = [],
  trips = [],
  wristbands = [],
  notices = [],
}) {
  const alerts = [];
  for (const check of readiness.checks.filter((item) => !item.ok))
    alerts.push({
      severity: check.critical ? "CRITICAL" : "WARNING",
      code: check.code,
      message: check.label,
    });
  for (const item of coverage.filter((entry) => entry.shortage > 0))
    alerts.push({
      severity: item.critical ? "CRITICAL" : "WARNING",
      code: "COVERAGE_SHORTAGE",
      message: `${item.shiftCode} ${item.positionLabel}: ${item.shortage} uncovered`,
    });
  for (const member of team.filter(
    (item) =>
      item.working &&
      ["ABSENT", "LATE", "MISSING"].includes(item.attendanceState),
  ))
    alerts.push({
      severity: member.attendanceState === "ABSENT" ? "CRITICAL" : "WARNING",
      code: `ATTENDANCE_${member.attendanceState}`,
      message: `${member.employee.name}: ${member.attendanceState}`,
    });
  notices.forEach((item) =>
    alerts.push({
      severity:
        item.priority === "CRITICAL"
          ? "CRITICAL"
          : item.priority === "WARNING"
            ? "WARNING"
            : "INFO",
      code: "NOTICE",
      message: item.title,
    }),
  );
  return alerts.sort(
    (a, b) =>
      ({ CRITICAL: 0, WARNING: 1, INFO: 2 })[a.severity] -
      { CRITICAL: 0, WARNING: 1, INFO: 2 }[b.severity],
  );
}

function closeDayValidation({
  attendanceDay,
  alerts,
  rotationAssignments,
  breaks,
}) {
  const blockers = [];
  if (!attendanceDay || attendanceDay.status !== "FINALIZED")
    blockers.push("Attendance must be finalized");
  if (!rotationAssignments.length) blockers.push("Rotation must be generated");
  if (alerts.some((item) => item.severity === "CRITICAL"))
    blockers.push("Critical Needs Attention items must be resolved");
  if (breaks.some((item) => item.status === "ACTIVE"))
    blockers.push("Active breaks must be completed");
  return { ready: blockers.length === 0, blockers };
}

module.exports = {
  WORKING_CODES,
  STRONG_HIGHLIGHT_POSITIONS,
  buildExpectedTeam,
  mergeExpectedActual,
  canAssign,
  qualificationState,
  overlaps,
  onBreak,
  generateRotation,
  normalizeRotationRules,
  coverageFor,
  buildReadiness,
  needsAttention,
  closeDayValidation,
};
