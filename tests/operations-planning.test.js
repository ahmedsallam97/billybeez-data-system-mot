const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeWeekdays, offerAppliesOnDate, stockAvailable, selectBraceletStock, stockKey } = require("../lib/operations/planning");

test("offers can run on selected weekdays without requiring a date range", () => {
  const offer = { active: true, effectiveFrom: "2000-01-01", effectiveTo: "2999-12-31", weekdaysJson: JSON.stringify([0, 1, 2, 3]) };
  assert.equal(offerAppliesOnDate(offer, "2026-09-20"), true); // Sunday
  assert.equal(offerAppliesOnDate(offer, "2026-09-23"), true); // Wednesday
  assert.equal(offerAppliesOnDate(offer, "2026-09-24"), false); // Thursday
});

test("offer date limits remain optional but are respected when supplied", () => {
  const offer = { active: true, effectiveFrom: "2026-09-20", effectiveTo: "2026-09-23", weekdaysJson: "[]" };
  assert.equal(offerAppliesOnDate(offer, "2026-09-19"), false);
  assert.equal(offerAppliesOnDate(offer, "2026-09-22"), true);
  assert.equal(offerAppliesOnDate(offer, "2026-09-24"), false);
  assert.deepEqual(normalizeWeekdays("[3,1,1,9]"), [1, 3]);
});

test("global stock totals cashier and warehouse and preserves legacy stock", () => {
  assert.equal(stockAvailable({ cashierQuantity: 7, warehouseQuantity: 15, availableStock: 22, allocated: 2, issued: 1 }), 19);
  assert.equal(stockAvailable({ availableStock: 10, allocated: 2, issued: 1 }), 7);
});

test("bracelet selection only uses a color that can cover the complete booking", () => {
  const rows = [
    { id: "red", stockCategory: "BRACELET", usageType: "TRIP", color: "Red", cashierQuantity: 5, warehouseQuantity: 5, allocated: 2, issued: 0 },
    { id: "blue", stockCategory: "BRACELET", usageType: "TRIP", color: "Blue", cashierQuantity: 20, warehouseQuantity: 5, allocated: 4, issued: 1 },
    { id: "birthday", stockCategory: "BRACELET", usageType: "BIRTHDAY", color: "Green", cashierQuantity: 50, warehouseQuantity: 0, allocated: 0, issued: 0 },
  ];
  assert.equal(selectBraceletStock(rows, "TRIP", 12)?.id, "blue");
  assert.equal(selectBraceletStock(rows, "TRIP", 22), null);
  assert.equal(selectBraceletStock(rows, "BIRTHDAY", 30)?.id, "birthday");
  assert.equal(selectBraceletStock([{ id: "empty", stockCategory: "BRACELET", usageType: "TRIP", cashierQuantity: 0, warehouseQuantity: 0 }], "TRIP", 0), null);
});

test("bracelet stock keys allow multiple colors for the same trip or birthday usage", () => {
  assert.notEqual(
    stockKey({ stockCategory: "BRACELET", usageType: "TRIP", color: "#ffcc00" }),
    stockKey({ stockCategory: "BRACELET", usageType: "TRIP", color: "#33aa66" }),
  );
});
