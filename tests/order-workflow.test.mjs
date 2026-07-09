import test from "node:test";
import assert from "node:assert/strict";
import { alertClassForOrder, restoredStatus, workflowStateFromOrder } from "../lib/order-workflow.mjs";

test("restoredStatus keeps paid orders paid when unarchived", () => {
  assert.equal(restoredStatus({ paymentStatus: "PAID", kitchenStatus: "PENDING" }), "PAID");
});

test("restoredStatus restores delivered unpaid orders as delivered", () => {
  assert.equal(restoredStatus({ paymentStatus: "UNPAID", kitchenStatus: "DELIVERED" }), "DELIVERED");
});

test("restoredStatus restores pending unpaid orders as open", () => {
  assert.equal(restoredStatus({ paymentStatus: "UNPAID", kitchenStatus: "PENDING" }), "OPEN");
});

test("alertClassForOrder highlights unpaid customers who left", () => {
  assert.equal(alertClassForOrder({ customerLeft: true, paymentStatus: "UNPAID" }), "left-unpaid");
});

test("alertClassForOrder highlights paid orders missing Geidea registration", () => {
  assert.equal(alertClassForOrder({ customerLeft: true, paymentStatus: "PAID", geideaRegisteredAt: null }), "needs-system");
});

test("alertClassForOrder prioritizes archived state", () => {
  assert.equal(alertClassForOrder({ archivedAt: new Date(), customerLeft: true, paymentStatus: "UNPAID" }), "archived-order");
});

test("workflowStateFromOrder follows operational priority", () => {
  assert.equal(workflowStateFromOrder({ paymentStatus: "UNPAID", kitchenStatus: "PENDING" }), "OPEN");
  assert.equal(workflowStateFromOrder({ workflowState: "PREPARING", paymentStatus: "UNPAID", kitchenStatus: "PENDING" }), "PREPARING");
  assert.equal(workflowStateFromOrder({ paymentStatus: "PAID", kitchenStatus: "DELIVERED" }), "PAID");
  assert.equal(workflowStateFromOrder({ paymentStatus: "PAID", kitchenStatus: "DELIVERED", geideaRegisteredAt: new Date() }), "GEIDEA_REGISTERED");
  assert.equal(workflowStateFromOrder({ customerLeft: true, paymentStatus: "PAID", geideaRegisteredAt: new Date() }), "CUSTOMER_LEFT");
  assert.equal(workflowStateFromOrder({ archivedAt: new Date(), customerLeft: true }), "ARCHIVED");
});
