import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { ROLE_MATRIX, normalizeRoleMatrix } = require("../lib/role-matrix.js");

test("normalizeRoleMatrix uses fallback for missing permissions", () => {
  const normalized = normalizeRoleMatrix({ ORDER_READ: ["CASHIER"] });
  assert.deepEqual(normalized.ORDER_READ, ["CASHIER", "DATA"]);
  assert.deepEqual(normalized.ORDER_PAY, ROLE_MATRIX.ORDER_PAY);
});

test("normalizeRoleMatrix removes invalid roles and duplicates", () => {
  const normalized = normalizeRoleMatrix({ BACKUP_MANAGE: ["admin", "ADMIN", "NOPE"] });
  assert.deepEqual(normalized.BACKUP_MANAGE, ["ADMIN"]);
});

test("normalizeRoleMatrix falls back when a permission becomes empty", () => {
  const normalized = normalizeRoleMatrix({ USER_MANAGE: ["NOPE"] });
  assert.deepEqual(normalized.USER_MANAGE, ROLE_MATRIX.USER_MANAGE);
});
