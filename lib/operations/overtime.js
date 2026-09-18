const MINUTES_PER_OVERTIME_DAY = 8 * 60;

function hoursToMinutes(value, { allowNegative = false } = {}) {
  const text = String(value ?? "").trim();
  const pattern = allowNegative ? /^-?\d+(?:\.\d+)?$/ : /^\d+(?:\.\d+)?$/;
  if (!pattern.test(text)) throw new Error(allowNegative ? "Hours must be a non-zero number" : "Hours must be a positive number");
  const minutes = Number(text) * 60;
  if (!Number.isFinite(minutes) || minutes === 0 || (!allowNegative && minutes < 0) || Math.abs(minutes - Math.round(minutes)) > 1e-8) {
    throw new Error("Hours must resolve to whole minutes");
  }
  return Math.round(minutes);
}

function overtimeSummary(minutes, hoursPerDay = 8) {
  const balanceMinutes = Math.max(0, Number(minutes) || 0);
  const minutesPerDay = Math.max(60, Number(hoursPerDay || 8) * 60);
  const availableDays = Math.floor(balanceMinutes / minutesPerDay);
  const remainingMinutes = balanceMinutes - availableDays * minutesPerDay;
  return {
    balanceMinutes,
    totalHours: Number((balanceMinutes / 60).toFixed(2)),
    availableDays,
    remainingMinutes,
    remainingHours: Number((remainingMinutes / 60).toFixed(2)),
  };
}

function assertNonNegativeBalance(currentMinutes, transactionMinutes) {
  if (Number(currentMinutes) + Number(transactionMinutes) < 0) {
    throw new Error("This transaction would create a negative overtime balance");
  }
}

module.exports = {
  MINUTES_PER_OVERTIME_DAY,
  assertNonNegativeBalance,
  hoursToMinutes,
  overtimeSummary,
};
