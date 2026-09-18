const ROLE_ALIASES = Object.freeze({ "Cashier - Front": "Front Cashier" });
const ALLOWED_PATHS = Object.freeze([
  ["Ride Operator", "Front Cashier"],
  ["Ride Operator", "Operation Supervisor"],
  ["Front Cashier", "Operation Supervisor"],
]);

function normalizeSuccessionRole(role) { const value = String(role || "").trim(); return ROLE_ALIASES[value] || value; }
function assertSuccessionPath(currentRole, targetRole) {
  const path = [normalizeSuccessionRole(currentRole), normalizeSuccessionRole(targetRole)];
  if (!ALLOWED_PATHS.some(([from, to]) => from === path[0] && to === path[1])) throw new Error("This succession path is not allowed");
  return { currentRole: path[0], targetRole: path[1] };
}

module.exports = { ALLOWED_PATHS, assertSuccessionPath, normalizeSuccessionRole };
