function parseOperationsSetting(key, value) {
  if (key === "OPS_DASHBOARD_UI_CONFIG") return require("./dashboard-settings").parseDashboardSettings(value);
  let parsed;
  try { parsed = JSON.parse(value); } catch { throw new Error(`Invalid JSON in Operations setting: ${key}`); }
  if (parsed === null || typeof parsed !== "object") throw new Error(`Operations setting must contain an object or list: ${key}`);
  if (key === "DAILY_OPERATIONS_TEMPLATE_CONFIG") return require("./template-validation").validateDailyTemplate(parsed);
  if (key === "RECOGNITION_ARTWORK_CONFIG") return require("./template-validation").validateRecognition(parsed);
  if (key === "OPS_MOTIVATION_PHRASES" && (!Array.isArray(parsed) || parsed.length > 100 || parsed.some(item => typeof item !== "string" || item.length > 500))) throw new Error("Motivation phrases must contain up to 100 text entries");
  return parsed;
}
function isOperationsSetting(key) {
  return key.startsWith("OPS_") || ["DAILY_OPERATIONS_TEMPLATE_CONFIG", "RECOGNITION_ARTWORK_CONFIG"].includes(key);
}
module.exports = { parseOperationsSetting, isOperationsSetting };
