// Only these settings belong to the active Operations workspace.
// Do not infer access from an OPS_ prefix or migrate legacy settings here.
const OPERATIONS_SETTING_KEYS = Object.freeze([
  "OPS_DASHBOARD_UI_CONFIG",
  "DAILY_OPERATIONS_TEMPLATE_CONFIG", "OPS_MOTIVATION_PHRASES", "OPS_CASHIER_CONFIG",
  "OPS_BRANCH_CONFIG", "OPS_SCHEDULE_CODE_CONFIG", "OPS_ROTATION_RULES",
  "OPS_ATTENDANCE_RULES", "OPS_EVALUATION_RULES", "OPS_LEAVE_RULES",
  "OPS_PLANNING_CATALOGS", "OPS_STOCK_RULES", "RECOGNITION_ARTWORK_CONFIG",
]);

function isOperationsWorkspaceSetting(key) {
  return OPERATIONS_SETTING_KEYS.includes(key);
}

module.exports = { OPERATIONS_SETTING_KEYS, isOperationsWorkspaceSetting };
