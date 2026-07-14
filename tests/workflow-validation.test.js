const test = require("node:test");
const assert = require("node:assert/strict");

const { validateBracelet, validateCustomerPhone } = require("../lib/orders");
const {
  validateArchiveAllowed,
  validateCustomerExitAllowed,
  validatePaymentAllowed,
} = require("../lib/workflow-rules");

test("bracelet validation accepts 5-digit zero bracelets and standard 6-digit bracelets", () => {
  assert.equal(validateBracelet("07002"), true);
  assert.equal(validateBracelet("070020"), true);
  assert.equal(validateBracelet("170020"), true);
  assert.equal(validateBracelet("470020"), false);
  assert.equal(validateBracelet("1234"), false);
});

test("customer phone validation accepts optional phone and Egyptian 010/011/012 prefixes only", () => {
  assert.equal(validateCustomerPhone(""), true);
  assert.equal(validateCustomerPhone("01020000020"), true);
  assert.equal(validateCustomerPhone("01120000020"), true);
  assert.equal(validateCustomerPhone("01220000020"), true);
  assert.equal(validateCustomerPhone("01520000020"), false);
  assert.equal(validateCustomerPhone("0102000002"), false);
});

test("workflow blocks payment before delivery when the rule is disabled", () => {
  const rules = { allowPaymentBeforeDelivery: false };
  assert.equal(validatePaymentAllowed({ kitchenStatus: "PENDING" }, rules).message, "Order must be delivered before payment");
  assert.equal(validatePaymentAllowed({ kitchenStatus: "DELIVERED" }, rules), null);
});

test("workflow blocks customer exit before payment when configured", () => {
  const rules = { allowExitBeforePayment: false };
  assert.equal(validateCustomerExitAllowed({ paymentStatus: "UNPAID" }, rules).message, "Order must be paid before customer exit");
  assert.equal(validateCustomerExitAllowed({ paymentStatus: "PAID" }, rules), null);
});

test("workflow archive requires payment, system registration, and customer exit when configured", () => {
  const rules = {
    requirePaymentBeforeArchive: true,
    requireGeideaBeforeArchive: true,
    archiveRequiresCustomerLeft: true,
  };

  assert.equal(validateArchiveAllowed({ paymentStatus: "UNPAID" }, rules).message, "Order must be paid before archive");
  assert.equal(validateArchiveAllowed({ paymentStatus: "PAID", geideaRegisteredAt: null }, rules).message, "Order must be registered on system first");
  assert.equal(validateArchiveAllowed({ paymentStatus: "PAID", geideaRegisteredAt: new Date(), customerLeft: false }, rules).message, "Customer must be marked as left first");
  assert.equal(validateArchiveAllowed({ paymentStatus: "PAID", geideaRegisteredAt: new Date(), customerLeft: true }, rules), null);
});
