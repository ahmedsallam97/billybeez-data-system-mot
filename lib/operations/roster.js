const WORKING_SHIFTS = ["AM", "BW", "PM"];
const NON_WORKING_LABELS = {
  OFF: "OFF",
  ANNUAL: "Annual",
  REP: "Rep",
  SL: "SL",
  H: "Holiday",
  HOLIDAY: "Holiday",
  MISSION: "Mission",
  ANP: "ANP",
  UNPAID: "Unpaid",
  NOT_APPLICABLE: "N/A",
  OVERTIME: "Overtime",
};

function scheduleGroup(item) {
  const shift = String(item?.shiftCode || item?.code || "").toUpperCase();
  if (WORKING_SHIFTS.includes(shift)) return shift;
  return NON_WORKING_LABELS[String(item?.code || "").toUpperCase()] || "Other";
}

function scheduleSummary(items) {
  const groups = Object.fromEntries([...WORKING_SHIFTS, ...Object.values(NON_WORKING_LABELS), "Other"].map((key) => [key, 0]));
  for (const item of items || []) groups[scheduleGroup(item)] += 1;
  return {
    totalScheduledWorkers: WORKING_SHIFTS.reduce((sum, key) => sum + groups[key], 0),
    am: groups.AM,
    bw: groups.BW,
    pm: groups.PM,
    front: (items || []).filter((item) => WORKING_SHIFTS.includes(scheduleGroup(item)) && frontAssignment(item.metadata)).length,
    off: groups.OFF,
    leave: groups.Annual + groups.Rep + groups.SL + groups.Holiday + groups.Unpaid,
    otherNonWorking: groups.Mission + groups.ANP + groups.Overtime + groups.Other,
    notApplicable: groups["N/A"],
  };
}

function frontAssignment(metadata) {
  return metadata?.frontAssignment || metadata?.normalization?.frontAssignment || null;
}

function temporaryAssignment(metadata) {
  return metadata?.temporaryAssignment || metadata?.normalization?.temporaryAssignment || metadata?.assignmentLabel || null;
}

function formatTime12(value) {
  if (!/^\d{2}:\d{2}$/.test(String(value || ""))) return "—";
  const [hours, minutes] = value.split(":").map(Number);
  const suffix = hours >= 12 ? "PM" : "AM";
  return `${hours % 12 || 12}:${String(minutes).padStart(2, "0")} ${suffix}`;
}

module.exports = { WORKING_SHIFTS, formatTime12, frontAssignment, scheduleGroup, scheduleSummary, temporaryAssignment };
