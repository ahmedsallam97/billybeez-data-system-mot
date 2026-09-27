const WORKING_GROUPS = new Set(["AM", "BW", "PM"]);

const EMPTY_TOTALS = Object.freeze({
  AM: 0, BW: 0, PM: 0, OFF: 0, workingDays: 0,
  present: 0, annual: 0, replacement: 0, sickLeave: 0, holiday: 0,
  AWP: 0, ANP: 0, unpaid: 0, attendanceOff: 0, overtime: 0,
  absent: 0, lateEarly: 0, missing: 0, attendanceTotal: 0,
});

function dateKey(value) {
  if (!value) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function normalizedScheduleCode(assignment) {
  return String(assignment.code || assignment.shiftCode || "").trim().toUpperCase().replace(/[\s-]+/g, "_");
}

function scheduleGroup(assignment) {
  const value = String(assignment.shiftCode || assignment.code || "").trim().toUpperCase();
  if (/^AM(?:\s|$)/.test(value)) return "AM";
  if (/^BW(?:\d|\s|$)/.test(value)) return "BW";
  if (/^PM(?:\s|$)/.test(value)) return "PM";
  return normalizedScheduleCode(assignment) === "OFF" ? "OFF" : null;
}

function attendanceGroupFromSchedule(assignment) {
  const shift = scheduleGroup(assignment);
  if (WORKING_GROUPS.has(shift)) return "present";
  const code = normalizedScheduleCode(assignment);
  if (["MISSION", "M"].includes(code)) return "present";
  if (code === "OFF") return "attendanceOff";
  if (["ANNUAL", "ANNUAL_LEAVE", "LEAVE"].includes(code)) return "annual";
  if (["REP", "REPLACE", "REPLACEMENT", "REPLACEMENT_LEAVE"].includes(code)) return "replacement";
  if (["SL", "SICK", "SICK_LEAVE"].includes(code)) return "sickLeave";
  if (["H", "HOLIDAY"].includes(code)) return "holiday";
  if (code === "AWP") return "AWP";
  if (code === "ANP") return "ANP";
  if (["UNPAID", "UNPAID_LEAVE"].includes(code)) return "unpaid";
  if (["OVERTIME", "OVER_TIME", "OT"].includes(code)) return "overtime";
  return null;
}

function attendanceGroupsFromRecord(record) {
  const status = String(record?.status || "MISSING").toUpperCase();
  if (["PRESENT", "UNEXPECTED_PRESENT"].includes(status)) return ["present"];
  if (["LATE", "EARLY_LEAVE"].includes(status)) return ["present", "lateEarly"];
  if (status === "ABSENT") return ["absent"];
  if (status === "LEAVE") return ["annual"];
  if (status === "REPLACEMENT_LEAVE") return ["replacement"];
  if (status === "SICK_LEAVE") return ["sickLeave"];
  if (status === "HOLIDAY") return ["holiday"];
  if (status === "OFF") return ["attendanceOff"];
  return [];
}

function preferSchedule(left, right) {
  const statusScore = (item) => item.schedule?.status === "PUBLISHED" ? 2 : item.schedule?.status === "SUPERSEDED" ? 1 : 0;
  return statusScore(right) - statusScore(left)
    || Number(right.schedule?.version || 0) - Number(left.schedule?.version || 0)
    || new Date(right.updatedAt || right.createdAt || 0) - new Date(left.updatedAt || left.createdAt || 0);
}

function preferAttendance(left, right) {
  return Number(right.attendanceDay?.version || 0) - Number(left.attendanceDay?.version || 0)
    || Number(right.version || 0) - Number(left.version || 0)
    || new Date(right.updatedAt || right.createdAt || 0) - new Date(left.updatedAt || left.createdAt || 0);
}

function latestByDate(items, dateFor, preference) {
  const grouped = new Map();
  items.forEach((item) => {
    const workDate = dateKey(dateFor(item));
    if (!workDate) return;
    const current = grouped.get(workDate);
    if (!current || preference(current, item) > 0) grouped.set(workDate, item);
  });
  return grouped;
}

function emptyRow(month) { return { month, ...EMPTY_TOTALS }; }

function buildScheduleAttendanceSummary({ scheduleAssignments = [], attendanceRecords = [] }, year, today = new Date().toISOString().slice(0, 10)) {
  const numericYear = Number(year);
  const todayYear = Number(String(today).slice(0, 4));
  if (!Number.isInteger(numericYear) || numericYear > todayYear) return { year: numericYear, complete: false, cutoff: today, rows: [], totals: null };
  const cutoff = numericYear === todayYear ? String(today).slice(0, 10) : `${numericYear}-12-31`;
  const yearPrefix = `${numericYear}-`;
  const scheduleByDate = latestByDate(
    scheduleAssignments.filter((item) => dateKey(item.workDate).startsWith(yearPrefix) && dateKey(item.workDate) <= cutoff),
    (item) => item.workDate,
    preferSchedule,
  );
  const attendanceByDate = latestByDate(
    attendanceRecords.filter((item) => dateKey(item.attendanceDay?.workDate).startsWith(yearPrefix) && dateKey(item.attendanceDay?.workDate) <= cutoff),
    (item) => item.attendanceDay?.workDate,
    preferAttendance,
  );
  const rowsByMonth = new Map();
  const lastVisibleMonth = numericYear === todayYear ? Number(String(today).slice(5, 7)) : 12;
  for (let month = 1; month <= lastVisibleMonth; month += 1) rowsByMonth.set(month, emptyRow(month));
  const rowFor = (workDate) => {
    const month = Number(dateKey(workDate).slice(5, 7));
    if (!rowsByMonth.has(month)) rowsByMonth.set(month, emptyRow(month));
    return rowsByMonth.get(month);
  };

  scheduleByDate.forEach((assignment, workDate) => {
    const row = rowFor(workDate);
    const group = scheduleGroup(assignment);
    if (group) row[group] += 1;
    if (WORKING_GROUPS.has(group)) row.workingDays += 1;
  });

  const attendanceDates = new Set([...scheduleByDate.keys(), ...attendanceByDate.keys()]);
  attendanceDates.forEach((workDate) => {
    const row = rowFor(workDate);
    const assignment = scheduleByDate.get(workDate);
    const record = attendanceByDate.get(workDate);
    const status = String(record?.status || "").toUpperCase();
    let groups = record && status !== "MISSING" ? attendanceGroupsFromRecord(record) : [];
    if (!groups.length && assignment) {
      const inferred = attendanceGroupFromSchedule(assignment);
      if (inferred) groups = [inferred];
    }
    if (!groups.length && record) groups = ["missing"];
    if (!groups.length) return;
    groups.forEach((group) => { row[group] += 1; });
    row.attendanceTotal += 1;
    if (record && (Number(record.lateMinutes || 0) > 0 || Number(record.earlyLeaveMinutes || 0) > 0) && !groups.includes("lateEarly")) row.lateEarly += 1;
  });

  const rows = [...rowsByMonth.values()].sort((left, right) => left.month - right.month);
  const totals = rows.length ? rows.reduce((result, row) => {
    Object.keys(result).forEach((key) => { result[key] += Number(row[key] || 0); });
    return result;
  }, { ...EMPTY_TOTALS }) : null;
  return { year: numericYear, complete: numericYear < todayYear, cutoff, rows, totals };
}

module.exports = { attendanceGroupFromSchedule, buildScheduleAttendanceSummary, scheduleGroup };
