// Presentation of the existing generator response only. This module never
// changes assignments, eligibility, distribution rules, or roster state.
const APPLY_CONFLICTS = new Set(['PHYSICAL_LOCATION_CONFLICT', 'HANDOVER_BREAK_CONFLICT', 'HANDOVER_SUPPORT_CONFLICT', 'DATA_EXIT_COVERAGE_CONFLICT']);
const duration = row => Math.max(0, minutes(row.endTime) - minutes(row.startTime));
const minutes = value => Number(String(value || '').slice(0, 2)) * 60 + Number(String(value || '').slice(3, 5));
const overlaps = (a, b) => a.startTime < b.endTime && b.startTime < a.endTime;

function locationName(preview, value, arabic = false) {
  const location = (preview.locations || []).find(row => row.id === value || row.code === value);
  return arabic ? location?.labelAr || location?.label || location?.code || value : location?.label || location?.code || value;
}
function meaningfulAlerts(preview) {
  const unassigned = (preview.unassigned || []).some(row => row.reason !== 'BREAK');
  const alerts = preview.alerts || [];
  return alerts.filter(row => row.code !== 'UNASSIGNED_EMPLOYEES' || unassigned && !alerts.some(alert => alert.code === 'VALID_LOCATION_CAPACITY_BLOCKED'));
}
function applicationState(preview) {
  // Match applyRotation's existing checks, rather than treating every CRITICAL
  // shortage as a new blocker: a valid partial proposal may still be applied.
  if (!preview.canApply) return { status: 'BLOCKED', reason: 'ROSTER_PROTECTED' };
  const conflict = (preview.alerts || []).find(row => APPLY_CONFLICTS.has(row.code));
  if (conflict) return { status: 'BLOCKED', reason: conflict.code };
  if (!(preview.assignments || []).some(row => row.source === 'AUTO' && !row.preserved)) return { status: 'BLOCKED', reason: 'NO_AUTOMATIC_ASSIGNMENTS' };
  return { status: meaningfulAlerts(preview).length ? 'WARNINGS' : 'READY', reason: null };
}
function endTime(preview, row) {
  return row.endTime || (preview.slots || []).find(slot => (!row.shiftCode || slot.shiftCode === row.shiftCode) && slot.startTime === row.startTime)?.endTime || row.startTime;
}
function consecutiveGroups(rows, identity, preview) {
  const buckets = new Map();
  for (const row of rows) {
    const key = identity(row), bucket = buckets.get(key) || [];
    bucket.push({ ...row, endTime: endTime(preview, row) }); buckets.set(key, bucket);
  }
  const groups = [];
  for (const [key, values] of buckets) {
    const ordered = values.sort((a, b) => String(a.startTime || '').localeCompare(String(b.startTime || '')));
    let current;
    for (const row of ordered) {
      if (current && row.startTime && current.endTime === row.startTime) { current.endTime = row.endTime; current.count++; }
      else if (current && row.startTime === current.startTime && row.endTime === current.endTime) current.count++;
      else { current = { ...row, key: `${key}:${groups.length}`, count: 1 }; groups.push(current); }
    }
  }
  return groups;
}
function issueGroups(preview) {
  return consecutiveGroups(meaningfulAlerts(preview), row => [row.code, row.shiftCode, row.positionCode, row.employeeId, [...(row.employeeIds || [])].sort().join(','), row.shortage].join(':'), preview);
}
function unusedGroups(preview) {
  return consecutiveGroups((preview.unassigned || []).filter(row => row.reason !== 'BREAK').map(row => ({ ...row, shiftCode: row.shift })), row => [row.employeeId, row.shiftCode, row.reason].join(':'), preview);
}
function exclusionGroups(preview) {
  const rules = preview.distributions?.rules || [], locations = preview.locations || [];
  const groups = new Map(), seen = new Set();
  for (const entry of preview.excluded || []) {
    const rule = rules.find(row => row.id === entry.ruleId), location = locations.find(row => row.code === entry.positionCode);
    let category = entry.reason === 'PRIORITY_ZERO' || entry.reason === 'DISABLED' && rule?.rank === 0 ? 'PRIORITY_ZERO'
      : entry.reason.startsWith('COMPONENT_') || entry.reason === 'INVALID_COMPOUND' ? 'INVALID_COMPOUND'
      : entry.reason === 'ARCHIVED' ? 'ARCHIVED'
      : entry.reason === 'DISABLED' ? rules.some(row => row.positionId === location?.id && row.shift !== entry.shift && row.enabled && row.rank > 0) ? 'WRONG_SHIFT' : 'DISABLED'
      : 'CONDITIONS';
    const key = [category, entry.shift, entry.positionCode, entry.reason].join(':');
    if (seen.has(key)) continue; seen.add(key);
    const bucket = groups.get(category) || []; bucket.push(entry); groups.set(category, bucket);
  }
  // A positive location configured only in another shift must never look like
  // an available fallback in the selected shift, even if no local rule exists.
  for (const shift of [...new Set((preview.slots || []).map(row => row.shiftCode))]) for (const location of locations) {
    if (rules.some(row => row.positionId === location.id && row.shift === shift) || !rules.some(row => row.positionId === location.id && row.shift !== shift && row.enabled && row.rank > 0)) continue;
    const bucket = groups.get('WRONG_SHIFT') || []; bucket.push({ shift, positionCode: location.code, reason: 'WRONG_SHIFT' }); groups.set('WRONG_SHIFT', bucket);
  }
  return [...groups].map(([category, locations]) => ({ category, locations }));
}
function rosterShifts(preview) {
  return [...new Set((preview.slots || []).map(slot => slot.shiftCode))].map(shift => {
    const slots = (preview.slots || []).filter(slot => slot.shiftCode === shift).sort((a, b) => a.startTime.localeCompare(b.startTime));
    const assignments = (preview.assignments || []).filter(row => row.shiftCode === shift);
    const shortages = (preview.coverage || []).filter(row => row.shift === shift && row.required && row.shortage > 0);
    const employeeIds = new Set([...assignments.map(row => row.employeeId), ...(preview.unassigned || []).filter(row => row.shift === shift).map(row => row.employeeId)]);
    const employees = (preview.employees || []).filter(row => row.shift === shift && employeeIds.has(row.id));
    return { shift, slots, assignments, shortages, employees, cells: employees.map(employee => ({
      employee,
      slots: slots.map(slot => {
        const active = assignments.filter(row => row.employeeId === employee.id && overlaps(row, slot));
        const breakRow = (preview.breaks || []).find(row => row.employeeId === employee.id && row.status !== 'CANCELLED' && overlaps(row, slot));
        const unused = (preview.unassigned || []).find(row => row.employeeId === employee.id && row.shift === shift && overlaps(row, slot));
        return { slot, assignments: active, breakRow, unused, protected: active.some(row => row.preserved || row.manualLock || row.source === 'MANUAL') };
      }),
    })) };
  });
}
function previewMetrics(preview) {
  const assignments = preview.assignments || [], coverage = preview.coverage || [];
  return {
    available: Number(preview.availableEmployeeCount || 0),
    proposedHours: assignments.filter(row => !row.preserved).reduce((sum, row) => sum + duration(row), 0) / 60,
    shortageHours: coverage.filter(row => row.required).reduce((sum, row) => sum + row.shortage * duration(row), 0) / 60,
    protected: Number(preview.protectedCount || 0),
    breakHours: (preview.unassigned || []).filter(row => row.reason === 'BREAK').reduce((sum, row) => sum + duration(row), 0) / 60,
    unusedHours: (preview.unassigned || []).filter(row => row.reason !== 'BREAK').reduce((sum, row) => sum + duration(row), 0) / 60,
  };
}
module.exports = { locationName, meaningfulAlerts, applicationState, issueGroups, unusedGroups, exclusionGroups, rosterShifts, previewMetrics };
