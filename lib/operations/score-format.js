function formatPerformanceScore(value, unit = "points", language = "en") {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return "—";
  return unit === "percent" ? `${value}%` : `${value} ${language === "ar" ? "نقطة" : "points"}`;
}
function latestApprovedAppraisals(rows) {
  const periods = new Map();
  for (const row of rows) {
    if (row.status !== "APPROVED") continue;
    const key = `${row.employeeId || ""}:${row.year}:${row.month}`;
    if (!periods.has(key) || Number(row.version || 0) > Number(periods.get(key).version || 0)) periods.set(key, row);
  }
  return [...periods.values()];
}
module.exports = { formatPerformanceScore, latestApprovedAppraisals };
