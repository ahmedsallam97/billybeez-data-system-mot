const test = require("node:test");
const assert = require("node:assert/strict");
const { getRoleHome } = require("../lib/roles");
const { isOperationsWorkspaceSetting } = require("../lib/operations/settings-scope");

test("management homes use Operations and legacy roles retain separate homes", () => {
  for (const role of ["ADMIN", "MANAGER"]) assert.equal(getRoleHome(role), "/opmanager");
  for (const role of ["CASHIER", "DATA", "KITCHEN"]) assert.notEqual(getRoleHome(role), "/opmanager");
  assert.equal(getRoleHome("UNKNOWN"), "/login");
});

test("Operations settings reject legacy keys and unknown prefixed keys", () => {
  for (const key of ["BUSINESS_DAY_PASSWORD", "BUSINESS_OPEN_HOUR", "POS_NAME", "ROLE_PERMISSION_CONFIG", "OPS_UNKNOWN", "OPS_API_TOKEN"]) {
    assert.equal(isOperationsWorkspaceSetting(key), false, key);
  }
  for (const key of ["OPS_BRANCH_CONFIG", "DAILY_OPERATIONS_TEMPLATE_CONFIG", "RECOGNITION_ARTWORK_CONFIG"]) {
    assert.equal(isOperationsWorkspaceSetting(key), true, key);
  }
});
