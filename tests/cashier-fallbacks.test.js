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

test("an assigned cashier department is never replaced", () => {
  const result = applyCashierFallbacks([row("cashier", "AM", "CASHIER"), row("primary", "AM")], {
    primaryEmployeeIds: ["primary"],
    backupEmployeeIds: [],
  });
  assert.equal(frontAssignment(result.find((item) => item.employeeId === "primary")), null);
});
