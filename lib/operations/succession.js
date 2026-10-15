const ROLE_ALIASES = Object.freeze({ "Cashier - Front": "Front Cashier" });
const { defaultPerformanceSettings } = require("./performance-settings-config");
const ALLOWED_PATHS = Object.freeze(defaultPerformanceSettings().succession.paths.filter(item => item.enabled).map(item => [item.fromRole, item.toRole]));

function normalizeSuccessionRole(role) { const value = String(role || "").trim(); return ROLE_ALIASES[value] || value; }
function assertSuccessionPath(currentRole, targetRole, settings) {
  const path = [normalizeSuccessionRole(currentRole), normalizeSuccessionRole(targetRole)];
  const paths = settings ? settings.succession.paths.filter(item => item.enabled).map(item => [normalizeSuccessionRole(item.fromRole), normalizeSuccessionRole(item.toRole)]) : ALLOWED_PATHS;
  if (!paths.some(([from, to]) => from === path[0] && to === path[1])) throw new Error("This succession path is not allowed");
  return { currentRole: path[0], targetRole: path[1] };
}

module.exports = { ALLOWED_PATHS, assertSuccessionPath, normalizeSuccessionRole };
