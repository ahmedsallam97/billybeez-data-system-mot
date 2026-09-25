const test = require("node:test");
const assert = require("node:assert/strict");
const { applyCashierFallbacks, frontAssignment } = require("../lib/operations/cashiers");

function row(id, shiftCode, department = "OPERATION") {
  return { id: `row-${id}`, employeeId: id, shiftCode, code: shiftCode, employee: { id, name: id, department } };
}

test("scheduled primary cashier is selected before a backup", () => {
  const result = applyCashierFallbacks([row("backup", "AM"), row("primary", "AM")], {
    primaryEmployeeIds: ["primary"],
    backupEmployeeIds: ["backup"],
  });
  assert.equal(frontAssignment(result.find((item) => item.employeeId === "primary")), "FRONT_CASHIER");
  assert.equal(frontAssignment(result.find((item) => item.employeeId === "backup")), null);
});

test("scheduled backup takes over when no primary cashier is working", () => {
  const result = applyCashierFallbacks([row("operator", "PM"), row("backup", "PM")], {
    primaryEmployeeIds: ["primary"],
    backupEmployeeIds: ["backup"],
  });
  const selected = result.find((item) => item.employeeId === "backup");
  assert.equal(frontAssignment(selected), "FRONT_CASHIER");
  assert.equal(selected.metadata.cashierSource, "BACKUP");
});

test("configured primary is the single front cashier even when another cashier is scheduled", () => {
  const result = applyCashierFallbacks([row("cashier", "AM", "CASHIER"), row("primary", "AM")], {
    primaryEmployeeIds: ["primary"],
    backupEmployeeIds: [],
  });
  assert.equal(frontAssignment(result.find((item) => item.employeeId === "primary")), "FRONT_CASHIER");
  assert.equal(frontAssignment(result.find((item) => item.employeeId === "cashier")), null);
});

test("multiple imported front cashier flags are normalized to one employee per shift", () => {
  const first = row("first", "AM", "CASHIER"); first.importMetadata = JSON.stringify({ frontAssignment: "FRONT_CASHIER" });
  const second = row("second", "AM", "CASHIER"); second.importMetadata = JSON.stringify({ frontAssignment: "FRONT_CASHIER" });
  const result = applyCashierFallbacks([first, second], { primaryEmployeeIds: [], backupEmployeeIds: [] });
  assert.equal(result.filter((item) => frontAssignment(item) === "FRONT_CASHIER").length, 1);
});
