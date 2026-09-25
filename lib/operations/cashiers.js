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

function clearFrontCashier(item) {
  const metadata = parseMetadata(item.importMetadata || item.metadata);
  if (!metadata.frontAssignment && !metadata.cashierSource) return item;
  const next = { ...metadata };
  delete next.frontAssignment;
  delete next.cashierSource;
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
    const ranked = rows
      .map((item) => {
        const employeeId = item.employeeId || item.employee?.id;
        const explicit = frontAssignment(item) === "FRONT_CASHIER";
        const isPrimary = primaryRank.has(employeeId);
        const isBackup = backupRank.has(employeeId);
        const departmentCashier = item.employee?.department === "CASHIER";
        const group = explicit ? 0 : isPrimary ? 1 : isBackup ? 2 : departmentCashier ? 3 : 9;
        const rank = isPrimary ? primaryRank.get(employeeId) : isBackup ? backupRank.get(employeeId) : 999;
        return { item, employeeId, explicit, isPrimary, isBackup, group, rank };
      })
      .filter((candidate) => candidate.group < 9)
      .sort((left, right) => {
        if (left.group !== right.group) return left.group - right.group;
        return left.rank - right.rank;
      });
    const selected = ranked[0];
    for (const row of rows) {
      const index = result.findIndex((item) => item.id === row.id);
      if (index >= 0) result[index] = clearFrontCashier(result[index]);
    }
    if (!selected) continue;
    const selectedId = selected.item.id;
    const index = result.findIndex((item) => item.id === selectedId);
    const source = selected.explicit ? "MANUAL" : selected.isPrimary ? "PRIMARY" : selected.isBackup ? "BACKUP" : "DEPARTMENT";
    result[index] = markFrontCashier(result[index], source);
  }
  return result;
}

module.exports = { applyCashierFallbacks, frontAssignment, parseMetadata };
