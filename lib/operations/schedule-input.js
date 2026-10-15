class ScheduleInputError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}
function validatePeriod(year, month) {
  if (!Number.isInteger(year) || year < 2020 || year > 2100 || !Number.isInteger(month) || month < 1 || month > 12) throw new ScheduleInputError("Invalid schedule period");
  return { year, month };
}
function validateWorkDate(value, schedule) {
  const date = String(value || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(`${date}T00:00:00Z`)) || new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date || date < schedule.periodStart || date > schedule.periodEnd) throw new ScheduleInputError("Invalid work date");
  return date;
}
function importedHeaderDate(value, periodDates) {
  if (value instanceof Date && Number.isFinite(value.getTime())) { const iso = value.toISOString().slice(0, 10); if(!periodDates.includes(iso))throw new ScheduleInputError("Date header is outside the selected period"); return iso; }
  const text = String(value ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) { if(!periodDates.includes(text))throw new ScheduleInputError("Date header is invalid or outside the selected period"); return text; }
  const match = text.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})$/);
  if (match) {
    const year = Number(match[3]) < 100 ? 2000 + Number(match[3]) : Number(match[3]);
    const candidates = [...new Set([`${year}-${match[2].padStart(2,"0")}-${match[1].padStart(2,"0")}`,`${year}-${match[1].padStart(2,"0")}-${match[2].padStart(2,"0")}`])].filter(date => periodDates.includes(date));
    if (candidates.length > 1) throw new ScheduleInputError("Ambiguous date header. Use full YYYY-MM-DD dates.");
    return candidates[0] || null;
  }
  if (!/^\d{1,2}$/.test(text)) return null;
  const matches = periodDates.filter(date => Number(date.slice(-2)) === Number(text));
  if (matches.length > 1) throw new ScheduleInputError("Day numbers are ambiguous in this period. Use full YYYY-MM-DD dates.");
  return matches[0] || null;
}
module.exports = { ScheduleInputError, validatePeriod, validateWorkDate, importedHeaderDate };
