const SECRET_KEY = /PASSWORD|SECRET|TOKEN|CREDENTIAL|PRIVATE_KEY|ACCESS_KEY/i;
function isSecretSetting(key) { return String(key).startsWith('ACCOUNT_') || SECRET_KEY.test(String(key)); }
function publicSettings(rows) { return rows.filter(row => !isSecretSetting(row.key)); }
function settingAuditValue(row) { return row && isSecretSetting(row.key) ? { key: row.key, configured: Boolean(row.value) } : row; }
module.exports = { isSecretSetting, publicSettings, settingAuditValue };
