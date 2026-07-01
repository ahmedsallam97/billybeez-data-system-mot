import test from "node:test";
import assert from "node:assert/strict";
import {
  canRoleEditPaidOrder,
  parseRoleList,
  validateArchiveAllowed,
  validateCustomerExitAllowed,
  validatePaymentAllowed,
} from "../lib/workflow-rules.mjs";

test("parseRoleList normalizes role settings", () => {
  assert.deepEqual(parseRoleList(" admin, manager ,cashier "), ["ADMIN", "MANAGER", "CASHIER"]);
});

test("canRoleEditPaidOrder follows configured roles", () => {
  assert.equal(canRoleEditPaidOrder("MANAGER", "ADMIN,MANAGER"), true);
  assert.equal(canRoleEditPaidOrder("CASHIER", "ADMIN,MANAGER"), false);
});

test("validatePaymentAllowed blocks payment before delivery when disabled", () => {
  assert.equal(validatePaymentAllowed({ kitchenStatus: "PENDING" }, { allowPaymentBeforeDelivery: true }), null);
  assert.equal(validatePaymentAllowed({ kitchenStatus: "DELIVERED" }, { allowPaymentBeforeDelivery: false }), null);
  assert.deepEqual(
    validatePaymentAllowed({ kitchenStatus: "PENDING" }, { allowPaymentBeforeDelivery: false }),
    { message: "Order must be delivered before payment", status: 400 },
  );
});

test("validateCustomerExitAllowed blocks unpaid exit when disabled", () => {
  assert.equal(validateCustomerExitAllowed({ paymentStatus: "UNPAID" }, { allowExitBeforePayment: true }), null);
  assert.equal(validateCustomerExitAllowed({ paymentStatus: "PAID" }, { allowExitBeforePayment: false }), null);
  assert.deepEqual(
    validateCustomerExitAllowed({ paymentStatus: "UNPAID" }, { allowExitBeforePayment: false }),
    { message: "Order must be paid before customer exit", status: 400 },
  );
});

test("validateArchiveAllowed follows Geidea and customer-left rules", () => {
  assert.deepEqual(
    validateArchiveAllowed({ geideaRegisteredAt: null, customerLeft: true }, { requireGeideaBeforeArchive: true, archiveRequiresCustomerLeft: true }),
    { message: "Order must be registered on Geidea first", status: 400 },
  );
  assert.deepEqual(
    validateArchiveAllowed({ geideaRegisteredAt: new Date(), customerLeft: false }, { requireGeideaBeforeArchive: true, archiveRequiresCustomerLeft: true }),
    { message: "Customer must be marked as left first", status: 400 },
  );
  assert.equal(
    validateArchiveAllowed({ geideaRegisteredAt: null, customerLeft: false }, { requireGeideaBeforeArchive: false, archiveRequiresCustomerLeft: false }),
    null,
  );
});
