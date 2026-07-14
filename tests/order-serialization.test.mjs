import assert from "node:assert/strict";
import test from "node:test";
import orders from "../lib/orders.js";

test("serializeOrder exposes paid amount and remaining balance", () => {
  const serialized = orders.serializeOrder({
    id: "ORD#1",
    businessDate: "2026-07-11",
    braceletNo: "0000100001",
    childNames: "Ali",
    childrenCount: 1,
    total: 500,
    status: "OPEN",
    workflowState: "OPEN",
    kitchenStatus: "PENDING",
    paymentStatus: "UNPAID",
    paymentMethod: "CASH",
    customerLeft: false,
    archivedAt: null,
    createdAt: new Date("2026-07-11T10:00:00Z"),
    updatedAt: new Date("2026-07-11T10:00:00Z"),
    items: [],
    children: [],
    payments: [
      { id: "pay-1", method: "CASH", amount: 350, paymentProviderId: "CASH", createdAt: new Date("2026-07-11T10:01:00Z") },
    ],
  });

  assert.equal(serialized.paidAmount, 350);
  assert.equal(serialized.balanceDue, 150);
});
