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
  highlightedPositionCodes: ["DROP", "TOWER", "DATA"],
  avoidConsecutivePosition: true,
  optionalOnlyWhenFullyStaffed: true,
  distributeAvailableEmployees: true,
};

function normalizeRotationRules(value = {}) {
  return {
    ...DEFAULT_ROTATION_RULES,
    ...(value || {}),
    mandatoryPositionCodes: Array.isArray(value?.mandatoryPositionCodes) ? value.mandatoryPositionCodes : DEFAULT_ROTATION_RULES.mandatoryPositionCodes,
    highlightedPositionCodes: Array.isArray(value?.highlightedPositionCodes) ? value.highlightedPositionCodes : DEFAULT_ROTATION_RULES.highlightedPositionCodes,
  };
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
      isShiftLeader: item.isShiftLeader ?? Boolean(item.employee?.operationsTeamLeader),
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

function hasPositionConflict(assignments = [], { operationalPositionId, startTime, endTime, excludeAssignmentId = null } = {}) {
  if (!operationalPositionId || !startTime || !endTime) return false;
  return assignments.some((assignment) =>
    assignment.id !== excludeAssignmentId &&
    (assignment.operationalPositionId || assignment.position?.id) === operationalPositionId &&
    overlaps(assignment.startTime, assignment.endTime, startTime, endTime));
}
function onBreak(breaks, employeeId, startTime, endTime) {
  return breaks.some(
    (item) =>
      item.employeeId === employeeId &&
      item.status !== "CANCELLED" &&
      overlaps(startTime, endTime, item.startTime, item.endTime),
  );
}

function qualificationState(qualifications, employeeId, position, workDate = new Date().toISOString().slice(0, 10)) {
  if (!position.requiresQualification) return "NOT_REQUIRED";
  const item = qualifications.find(
    (entry) =>
      entry.employeeId === employeeId &&
      entry.operationalPositionId === position.id,
  );
  if (item?.effectiveDate && new Date(item.effectiveDate).toISOString().slice(0, 10) > workDate) return "NOT_QUALIFIED";
  if (item?.expiryDate && new Date(item.expiryDate).toISOString().slice(0, 10) < workDate) return "EXPIRED";
  return item?.status || "NOT_QUALIFIED";
}

function canAssign({ qualifications, employeeId, position, workDate, positions = [] }) {
  const {isCombined,components}=require('./rotation-locations');
  if(isCombined(position))return components(position).every(code=>{
    const part=positions.find(p=>p.code===code)||qualifications.find(q=>q.position?.code===code)?.position;
    return part&&part.active!==false&&["QUALIFIED","NOT_REQUIRED"].includes(qualificationState(qualifications,employeeId,{...part,requiresQualification:part.requiresQualification||position.requiresQualification},workDate));
  });
  return ["QUALIFIED", "NOT_REQUIRED"].includes(
    qualificationState(qualifications, employeeId, position, workDate),
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

function generateRotation(input) {
  return require('./rotation-generator').generateConfiguredRotation(input,{employeeAvailable,onBreak,overlaps,canAssign,seededRank,normalizeRotationRules});
}

function coverageFor({
  workDate,
  team,
  positions,
  qualifications = [],
  assignments = [],
  rules = {},
  distributions,
}) {
  const highlightedPositions = new Set(normalizeRotationRules(rules).highlightedPositionCodes);
  return ["AM", "BW", "PM"].flatMap((shiftCode) =>
    (distributions?require('./rotation-distributions').applicableRules(distributions,positions,{workDate,shift:shiftCode}).filter(r=>!r.excludedReason).map(({position,rule})=>({position,requirement:{...rule,minEmployees:rule.required?rule.min:0},critical:rule.required})):activeRequirements(positions.filter(p=>Number(p.sortOrder)>0), shiftCode, workDate)).map(
      ({ position, requirement }) => {
        const assigned = assignments.filter(
          (item) =>
            require('./rotation-locations').coversPosition(item,position,positions),
        );
        const qualified = team.filter(
          (member) =>
            member.shiftCode === shiftCode &&
            canAssign({
              qualifications,
              workDate,
              employeeId: member.employeeId,
              position,
              positions,
            }),
        ).length;
        const cashierAssigned = position.code === "CASHIER" ? team.filter((member) => member.shiftCode === shiftCode && member.working && (member.frontAssignment === "FRONT_CASHIER" || member.employee?.department === "CASHIER")).length : null;
        const shiftMember=team.find(member=>member.shiftCode===shiftCode&&member.working&&member.expectedStart&&member.expectedEnd);
        const minutes=value=>Number(value.slice(0,2))*60+Number(value.slice(3));
        const time=value=>String(Math.floor(value/60)).padStart(2,'0')+':'+String(value%60).padStart(2,'0');
        const hourlyCounts=[];
        if(shiftMember){const start=minutes(requirement.startTime||shiftMember.expectedStart),end=minutes(requirement.endTime||shiftMember.expectedEnd);for(let minute=start;minute<end;minute+=60){const from=time(minute),to=time(Math.min(end,minute+60));hourlyCounts.push(assigned.filter(a=>a.startTime<=from&&a.endTime>=to).length);}}
        const assignedCount = cashierAssigned == null ? (hourlyCounts.length?Math.min(...hourlyCounts):assigned.length) : cashierAssigned;
        return {
          shiftCode,
          positionId: position.id,
          positionCode: position.code,
          positionLabel: position.label,
          critical: requirement.required??position.critical,
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
          highlight: highlightedPositions.has(position.code),
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
      item.status!=="CANCELLED" && rotationAssignments.some(
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
  hasPositionConflict,
  onBreak,
  generateRotation,
  normalizeRotationRules,
  coverageFor,
  buildReadiness,
  needsAttention,
  closeDayValidation,
};
