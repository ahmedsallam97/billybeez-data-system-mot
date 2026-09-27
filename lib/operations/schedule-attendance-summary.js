const WORKING_GROUPS = ["AM", "BW", "PM"];
const EXCUSED_STATUSES = new Set(["LEAVE", "REPLACEMENT_LEAVE", "SICK_LEAVE", "HOLIDAY", "OFF"]);

function scheduleGroup(assignment) {
  const value = String(assignment.shiftCode || assignment.code || "").trim().toUpperCase();
  if (/^AM(?:\s|$)/.test(value)) return "AM";
  if (/^BW(?:\d|\s|$)/.test(value)) return "BW";
  if (/^PM(?:\s|$)/.test(value)) return "PM";
  const code = String(assignment.code || "").trim().toUpperCase();
  if (code === "OFF") return "OFF";
  if (code === "ANNUAL") return "ANNUAL";
  return "OTHER";
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
    const workDate = String(dateFor(item) || "").slice(0, 10);
    if (!workDate) return;
    const current = grouped.get(workDate);
    if (!current || preference(current, item) > 0) grouped.set(workDate, item);
  });
  return grouped;
}

function buildScheduleAttendanceSummary({ scheduleAssignments = [], attendanceRecords = [] }, year, today = new Date().toISOString().slice(0, 10)) {
  const numericYear = Number(year);
  const todayYear = Number(String(today).slice(0, 4));
  if (!Number.isInteger(numericYear) || numericYear > todayYear) return { year: numericYear, complete: false, cutoff: today, rows: [], totals: null };
  const cutoff = numericYear === todayYear ? String(today).slice(0, 10) : `${numericYear}-12-31`;
  const yearPrefix = `${numericYear}-`;
  const scheduleByDate = latestByDate(
    scheduleAssignments.filter((item) => String(item.workDate || "").startsWith(yearPrefix) && String(item.workDate).slice(0, 10) <= cutoff),
    (item) => item.workDate,
    preferSchedule,
  );
  const attendanceByDate = latestByDate(
    attendanceRecords.filter((item) => String(item.attendanceDay?.workDate || "").startsWith(yearPrefix) && String(item.attendanceDay.workDate).slice(0, 10) <= cutoff),
    (item) => item.attendanceDay?.workDate,
    preferAttendance,
  );
  const rowsByMonth = new Map();
  const lastVisibleMonth = numericYear === todayYear ? Number(String(today).slice(5, 7)) : 12;
  for (let month = 1; month <= lastVisibleMonth; month += 1) rowsByMonth.set(month, { month, AM: 0, BW: 0, PM: 0, OFF: 0, ANNUAL: 0, OTHER: 0, workingDays: 0, present: 0, late: 0, absent: 0, excused: 0, missing: 0, attendanceTotal: 0 });
  const rowFor = (workDate) => {
    const month = Number(String(workDate).slice(5, 7));
    if (!rowsByMonth.has(month)) rowsByMonth.set(month, { month, AM: 0, BW: 0, PM: 0, OFF: 0, ANNUAL: 0, OTHER: 0, workingDays: 0, present: 0, late: 0, absent: 0, excused: 0, missing: 0, attendanceTotal: 0 });
    return rowsByMonth.get(month);
  };
  scheduleByDate.forEach((assignment, workDate) => {
    const row = rowFor(workDate);
    const group = scheduleGroup(assignment);
    row[group] += 1;
    if (WORKING_GROUPS.includes(group)) row.workingDays += 1;
  });
  attendanceByDate.forEach((record, workDate) => {
    const row = rowFor(workDate);
    const status = String(record.status || "MISSING").toUpperCase();
    row.attendanceTotal += 1;
    if (["PRESENT", "UNEXPECTED_PRESENT"].includes(status)) row.present += 1;
    if (status === "LATE" || Number(record.lateMinutes || 0) > 0 || status === "EARLY_LEAVE" || Number(record.earlyLeaveMinutes || 0) > 0) row.late += 1;
    if (status === "ABSENT") row.absent += 1;
    if (EXCUSED_STATUSES.has(status)) row.excused += 1;
    if (status === "MISSING") row.missing += 1;
  });
  const rows = [...rowsByMonth.values()].sort((left, right) => left.month - right.month);
  const totals = rows.length ? rows.reduce((result, row) => {
    Object.keys(result).forEach((key) => { result[key] += Number(row[key] || 0); });
    return result;
  }, { AM: 0, BW: 0, PM: 0, OFF: 0, ANNUAL: 0, OTHER: 0, workingDays: 0, present: 0, late: 0, absent: 0, excused: 0, missing: 0, attendanceTotal: 0 }) : null;
  return { year: numericYear, complete: numericYear < todayYear, cutoff, rows, totals };
}

module.exports = { buildScheduleAttendanceSummary, scheduleGroup };
