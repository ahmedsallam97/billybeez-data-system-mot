const { ROLE_MATRIX } = require("../role-matrix");
const SCOPES = Object.freeze(["OWN", "TEAM", "BRANCH", "SELECTED", "ALL"]);
// One registry is consumed by API guards, navigation, controls and the access editor.
const MODULES = {
  dashboard: ["view"],
  operations: ["view", "create", "lock", "unlock"],
  employees: [
    "view",
    "details",
    "sensitive",
    "create",
    "edit",
    "archive",
    "restore",
    "assign",
    "print",
    "pdf",
  ],
  files: ["view", "upload", "download", "archive"],
  roster: ["view", "print", "pdf", "share"],
  schedules: [
    "view",
    "create",
    "edit",
    "publish",
    "archive",
    "import",
    "export",
    "print",
    "pdf",
  ],
  attendance: ["view", "create", "edit", "approve", "unlock"],
  evaluations: ["view", "create", "edit", "approve", "unlock"],
  appraisals: ["view", "create", "edit", "approve"],
  competencies: ["view", "create", "edit"],
  succession: ["view", "create", "edit"],
  development: ["view", "create", "edit"],
  performance_reports: ["view"],
  rotations: ["view", "create", "assign"],
  breaks: ["view", "create", "edit", "archive"],
  stock: ["view", "create", "edit", "archive", "issue"],
  trips: [
    "view",
    "details",
    "create",
    "edit",
    "archive",
    "approve",
    "upload",
    "download",
  ],
  birthdays: [
    "view",
    "details",
    "create",
    "edit",
    "archive",
    "approve",
    "upload",
    "download",
  ],
  leadership: ["view", "create", "edit", "approve", "upload", "download"],
  offers: ["view", "create", "edit", "archive"],
  leave: ["view", "create", "edit", "archive", "approve", "restore"],
  overtime: ["view", "edit", "restore"],
  holidays: ["view", "create", "edit"],
  eom: ["view", "create", "edit", "lock", "unlock", "print", "pdf"],
  hall: ["view", "print", "pdf"],
  reports: [
    "view",
    "create",
    "edit",
    "approve",
    "lock",
    "unlock",
    "upload",
    "download",
  ],
  notifications: ["view", "create", "edit", "archive", "restore"],
  editors: ["templates"],
  appearance: ["configure"],
  branches: ["configure"],
  settings: ["view", "configure"],
  backups: ["view"],
  users: [
    "view",
    "create",
    "edit",
    "archive",
    "restore",
    "assign",
    "resetPassword",
    "revokeSessions",
    "activity",
  ],
  roles: ["view", "create", "edit", "archive"],
  audit: ["view"],
};
const SOURCES = {
  dashboard: "OPERATIONS_DASHBOARD_READ",
  operations: "OPS_DAILY_MANAGE",
  employees: "OPS_EMPLOYEE_MANAGE",
  files: "OPS_EMPLOYEE_MANAGE",
  roster: "OPS_SCHEDULE_READ",
  schedules: "OPS_SCHEDULE_MANAGE",
  attendance: "OPS_ATTENDANCE_MANAGE",
  evaluations: "OPS_EVALUATION_MANAGE",
  appraisals: "OPS_APPRAISAL_MANAGE",
  competencies: "OPS_EMPLOYEE_MANAGE",
  succession: "OPS_SUCCESSION_MANAGE",
  development: "OPS_SUCCESSION_MANAGE",
  performance_reports: "OPS_SUCCESSION_READ",
  rotations: "OPS_DAILY_MANAGE",
  breaks: "OPS_DAILY_MANAGE",
  stock: "OPS_DAILY_MANAGE",
  trips: "OPS_DAILY_MANAGE",
  birthdays: "OPS_DAILY_MANAGE",
  leadership: "OPS_DAILY_MANAGE",
  offers: "OPS_DAILY_MANAGE",
  leave: "OPS_LEAVE_MANAGE",
  overtime: "OPS_TIME_MANAGE",
  holidays: "OPS_TIME_MANAGE",
  eom: "OPS_EOTM_MANAGE",
  hall: "OPS_EOTM_MANAGE",
  reports: "OPS_DAILY_MANAGE",
  notifications: "OPS_DAILY_MANAGE",
  editors: "SYSTEM_SETTING_MANAGE",
  appearance: "SYSTEM_SETTING_MANAGE",
  branches: "SYSTEM_SETTING_MANAGE",
  settings: "SYSTEM_SETTING_MANAGE",
  backups: "BACKUP_MANAGE",
  users: "USER_MANAGE",
  roles: "USER_MANAGE",
  audit: "DASHBOARD_READ",
};
const READ = {
  operations: "OPS_SCHEDULE_READ",
  employees: "OPS_EMPLOYEE_READ",
  files: "OPS_EMPLOYEE_SENSITIVE_READ",
  schedules: "OPS_SCHEDULE_READ",
  attendance: "OPS_ATTENDANCE_READ",
  evaluations: "OPS_EVALUATION_READ",
  appraisals: "OPS_APPRAISAL_READ",
  succession: "OPS_SUCCESSION_READ",
  development: "OPS_SUCCESSION_READ",
  performance_reports: "OPS_SUCCESSION_READ",
  leave: "OPS_LEAVE_READ",
  eom: "OPS_EOTM_READ",
  reports: "OPS_EMPLOYEE_READ",
  settings: "OPS_EMPLOYEE_READ",
};
const SPECIAL = {
  "employees.sensitive": "OPS_EMPLOYEE_SENSITIVE_READ",
  "schedules.publish": "OPS_SCHEDULE_PUBLISH",
  "attendance.approve": "OPS_ATTENDANCE_FINALIZE",
  "attendance.unlock": "OPS_ATTENDANCE_CORRECT",
  "evaluations.approve": "OPS_EVALUATION_FINALIZE",
  "appraisals.approve": "OPS_APPRAISAL_APPROVE",
  "eom.lock": "OPS_EOTM_LOCK",
  "eom.unlock": "OPS_EOTM_REOPEN",
};
const PERMISSIONS = Object.freeze([
  ...Object.entries(MODULES).flatMap(([module, actions]) =>
    actions.map((action) => ({
      key: `${module}.${action}`,
      module,
      action,
      source:
        SPECIAL[`${module}.${action}`] ||
        (action === "view" ? READ[module] : null) ||
        SOURCES[module],
      scoped: ![
        "dashboard",
        "editors",
        "appearance",
        "settings",
        "branches",
        "backups",
        "roles",
        "audit",
        "notifications",
        "hall",
      ].includes(module),
    })),
  ),
  ...Object.keys(ROLE_MATRIX).map((key) => ({
    key,
    module: "legacy",
    action: key,
    source: key,
    scoped: false,
    legacy: true,
  })),
]);
const KEYS = new Set(PERMISSIONS.map((p) => p.key));
const OPERATIONS_PERMISSIONS = Object.freeze(
  PERMISSIONS.filter((p) => !p.legacy),
);
function isOperationsRole(role) {
  return Boolean(
    role &&
      !role.id.startsWith("legacy-") &&
      ["ADMIN", "MANAGER"].includes(role.legacyRole),
  );
}
function operationsGrants(grants) {
  return Object.fromEntries(
    Object.entries(grants || {}).filter(([key]) =>
      OPERATIONS_PERMISSIONS.some((p) => p.key === key),
    ),
  );
}
function managementRole(role) {
  return {
    ...role,
    permissions: operationsGrants(role.permissions),
    defaults: operationsGrants(role.defaults),
  };
}
const ROLE_NAMES = [
  "Super Admin",
  "Operation Manager",
  "Branch Manager",
  "Assistant Manager",
  "Operation Supervisor",
];
const NAV_PERMISSIONS = {
  dashboard: "dashboard.view",
  roster: "roster.view",
  schedule: "schedules.view",
  daily: "attendance.view",
  evaluation: "evaluations.view",
  employees: "employees.view",
  trips: "trips.view",
  birthdays: "birthdays.view",
  offers: "offers.view",
  stock: "stock.view",
  time: "leave.view",
  performance: "appraisals.view",
  eotm: "eom.view",
  hall: "hall.view",
  succession: "succession.view",
  reports: "performance_reports.view",
  development: "development.view",
  operationalReports: "reports.view",
  settings: "settings.view",
  audit: "audit.view",
};
function hasPermission(user, key) {
  return Boolean(user?.permissions?.[key]);
}
function reportPermission(type, action) {
  const module = {
    TRIP: "trips",
    BIRTHDAY: "birthdays",
    SHIFT_LEADERSHIP: "leadership",
  }[type];
  return module && MODULES[module].includes(action)
    ? `${module}.${action}`
    : null;
}
function dependencies(grants) {
  return Object.keys(grants)
    .filter(
      (key) =>
        key.includes(".") &&
        !key.endsWith(".view") &&
        MODULES[key.split(".")[0]]?.includes("view") &&
        !grants[key.split(".")[0] + ".view"],
    )
    .map((key) => `${key} also requires ${key.split(".")[0]}.view`);
}
function validateGrants(value, { operationsOnly = false } = {}) {
  const invalid = (message) =>
    Object.assign(new Error(message), { status: 400 });
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw invalid("Permissions must be an object");
  const result = {};
  for (const [key, scope] of Object.entries(value)) {
    if (
      !KEYS.has(key) ||
      (operationsOnly && !OPERATIONS_PERMISSIONS.some((p) => p.key === key))
    )
      throw invalid(`Unknown Operations permission: ${key}`);
    if (scope !== null && !SCOPES.includes(scope))
      throw invalid(`Invalid scope for ${key}`);
    result[key] = scope;
  }
  return result;
}
function effectivePermissions(role, profile) {
  if (!role?.active || profile?.archivedAt) return {};
  const result = Object.fromEntries(
    Object.entries(role.permissions || {}).filter(([key]) => KEYS.has(key)),
  );
  for (const [key, value] of Object.entries(profile?.overrides || {})) {
    if (value === null) delete result[key];
    else result[key] = value;
  }
  for (const p of PERMISSIONS) {
    if (!p.scoped || !result[p.key] || !profile?.dataScope) continue;
    const cap = profile.dataScope;
    let scope = result[p.key];
    if (cap === "OWN") scope = "OWN";
    else if (cap === "TEAM" && scope !== "OWN") scope = "TEAM";
    else if (cap === "BRANCH" && !["OWN", "TEAM"].includes(scope))
      scope = "BRANCH";
    else if (cap === "SELECTED" && scope === "ALL") scope = "SELECTED";
    if (!profile.allBranches && scope === "ALL") scope = "SELECTED";
    result[p.key] = scope;
  }
  return result;
}
module.exports = {
  SCOPES,
  MODULES,
  PERMISSIONS,
  OPERATIONS_PERMISSIONS,
  isOperationsRole,
  operationsGrants,
  managementRole,
  KEYS,
  ROLE_NAMES,
  NAV_PERMISSIONS,
  hasPermission,
  reportPermission,
  dependencies,
  validateGrants,
  effectivePermissions,
};
