const WORKING_SHIFTS = new Set(["AM", "BW", "PM"]);

function parseMetadata(value) {
  if (!value) return {};
  if (typeof value === "object") return value;
  try { return JSON.parse(value); } catch { return {}; }
}

function frontAssignment(item) {
  const metadata = parseMetadata(item.importMetadata || item.metadata);
  return metadata.frontAssignment || metadata.normalization?.frontAssignment || null;
}

function markFrontCashier(item, source) {
  const metadata = parseMetadata(item.importMetadata || item.metadata);
  const next = { ...metadata, frontAssignment: "FRONT_CASHIER", cashierSource: source };
  return { ...item, metadata: next, importMetadata: JSON.stringify(next) };
}

function applyCashierFallbacks(assignments = [], config = {}) {
  const primary = Array.isArray(config.primaryEmployeeIds) ? config.primaryEmployeeIds : [];
  const backup = Array.isArray(config.backupEmployeeIds) ? config.backupEmployeeIds : [];
  const primaryRank = new Map(primary.map((id, index) => [id, index]));
  const backupRank = new Map(backup.map((id, index) => [id, index]));
  const result = assignments.map((item) => ({ ...item }));

  for (const shiftCode of WORKING_SHIFTS) {
    const rows = result.filter((item) => (item.shiftCode || item.code) === shiftCode);
    if (!rows.length) continue;
    const assigned = rows.filter((item) => item.employee?.department === "CASHIER" || frontAssignment(item));
    if (assigned.length) continue;
    const candidates = rows
      .filter((item) => primaryRank.has(item.employeeId || item.employee?.id) || backupRank.has(item.employeeId || item.employee?.id))
      .sort((left, right) => {
        const leftId = left.employeeId || left.employee?.id;
        const rightId = right.employeeId || right.employee?.id;
        const leftPrimary = primaryRank.has(leftId);
        const rightPrimary = primaryRank.has(rightId);
        if (leftPrimary !== rightPrimary) return leftPrimary ? -1 : 1;
        return (leftPrimary ? primaryRank.get(leftId) : backupRank.get(leftId)) - (rightPrimary ? primaryRank.get(rightId) : backupRank.get(rightId));
      });
    if (!candidates.length) continue;
    const selectedId = candidates[0].id;
    const index = result.findIndex((item) => item.id === selectedId);
    result[index] = markFrontCashier(result[index], primaryRank.has(candidates[0].employeeId || candidates[0].employee?.id) ? "PRIMARY" : "BACKUP");
  }
  return result;
}

module.exports = { applyCashierFallbacks, frontAssignment, parseMetadata };
