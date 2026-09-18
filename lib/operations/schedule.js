const DAY_MS = 24 * 60 * 60 * 1000;

function utcDate(year, monthIndex, day) {
  return new Date(Date.UTC(year, monthIndex, day));
}

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

function getOperationalSchedulePeriod(year, month) {
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error("Invalid operational schedule period");
  }
  if (month === 1) return { startDate: `${year}-01-01`, endDate: `${year}-01-15` };
  if (month === 12) return { startDate: `${year}-11-16`, endDate: `${year}-12-31` };
  return {
    startDate: isoDate(utcDate(year, month - 2, 16)),
    endDate: isoDate(utcDate(year, month - 1, 15)),
  };
}

function datesInPeriod(period) {
  const start = new Date(`${period.startDate}T00:00:00.000Z`);
  const end = new Date(`${period.endDate}T00:00:00.000Z`);
  const result = [];
  for (let time = start.getTime(); time <= end.getTime(); time += DAY_MS) {
    result.push(isoDate(new Date(time)));
  }
  return result;
}

function normalizeScheduleCode(value) {
  const rawValue = String(value ?? "").trim();
  const key = rawValue.toUpperCase().replace(/[\s/_-]+/g, " ").trim();
  const basic = {
    AM: { code: "AM", countsAsWorking: true },
    PM: { code: "PM", countsAsWorking: true },
    BW: { code: "BW", countsAsWorking: true },
    OFF: { code: "OFF", countsAsWorking: false },
    ANNUAL: { code: "ANNUAL", countsAsWorking: false },
    REP: { code: "REP", countsAsWorking: false },
    SL: { code: "SL", countsAsWorking: false },
    H: { code: "H", countsAsWorking: false },
    HOLIDAY: { code: "H", countsAsWorking: false },
    M: { code: "MISSION", countsAsWorking: true },
    MISSION: { code: "MISSION", countsAsWorking: true },
    ANP: { code: "ANP", countsAsWorking: false },
    AWP: { code: "AWP", countsAsWorking: false },
    UNPAID: { code: "UNPAID", countsAsWorking: false },
    OVERTIME: { code: "OVERTIME", countsAsWorking: false, occurrenceOnly: true },
    "N A": { code: "NOT_APPLICABLE", countsAsWorking: false, notApplicable: true },
    NA: { code: "NOT_APPLICABLE", countsAsWorking: false, notApplicable: true },
    "NOT APPLICABLE": { code: "NOT_APPLICABLE", countsAsWorking: false, notApplicable: true },
    "NOT YET JOINED": { code: "NOT_APPLICABLE", countsAsWorking: false, notApplicable: true },
  };

  if (!rawValue) return { rawValue, code: null, blank: true, countsAsWorking: false };
  if (key === "BW1" || key === "BW2") {
    return { rawValue, code: "BW", countsAsWorking: true, metadata: { historicalVariant: key } };
  }
  if (key === "AM FRONT" || key === "PM FRONT") {
    const code = key.startsWith("AM") ? "AM" : "PM";
    return { rawValue, code, countsAsWorking: true, metadata: { frontAssignment: "FRONT_CASHIER" } };
  }
  if (!basic[key]) return { rawValue, code: null, countsAsWorking: false, error: "Unknown schedule code" };
  return { rawValue, ...basic[key] };
}

function createsAttendanceExpectation(value) {
  const normalized = typeof value === "string" ? normalizeScheduleCode(value) : value;
  return Boolean(normalized?.countsAsWorking && !normalized?.notApplicable && !normalized?.occurrenceOnly);
}

module.exports = {
  createsAttendanceExpectation,
  datesInPeriod,
  getOperationalSchedulePeriod,
  normalizeScheduleCode,
};
