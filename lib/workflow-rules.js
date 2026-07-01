const { getBooleanSetting, getSetting } = require("./settings");

function parseRoleList(value) {
  return String(value || "")
    .split(",")
    .map((role) => role.trim().toUpperCase())
    .filter(Boolean);
}

function canRoleEditPaidOrder(role, rolesValue) {
  return parseRoleList(rolesValue).includes(String(role || "").toUpperCase());
}

async function loadWorkflowRules() {
  return {
    paidOrderEditRoles: parseRoleList(await getSetting("WORKFLOW_ALLOW_PAID_ORDER_EDIT_ROLES", "ADMIN,MANAGER")),
    allowPaymentBeforeDelivery: await getBooleanSetting("WORKFLOW_ALLOW_PAYMENT_BEFORE_DELIVERY", true),
    requireGeideaBeforeArchive: await getBooleanSetting("WORKFLOW_REQUIRE_GEIDEA_BEFORE_ARCHIVE", true),
    allowExitBeforePayment: await getBooleanSetting("WORKFLOW_ALLOW_EXIT_BEFORE_PAYMENT", true),
    archiveRequiresCustomerLeft: await getBooleanSetting("ARCHIVE_REQUIRES_CUSTOMER_LEFT", true),
    businessDayPassword: await getSetting("BUSINESS_DAY_PASSWORD", "112411"),
  };
}

async function canUserEditPaidOrder(user) {
  const rolesValue = await getSetting("WORKFLOW_ALLOW_PAID_ORDER_EDIT_ROLES", "ADMIN,MANAGER");
  return canRoleEditPaidOrder(user?.role, rolesValue);
}

function workflowError(message, status = 400) {
  return { message, status };
}

function validatePaymentAllowed(order, rules) {
  if (!rules.allowPaymentBeforeDelivery && order.kitchenStatus !== "DELIVERED") {
    return workflowError("Order must be delivered before payment");
  }
  return null;
}

function validateCustomerExitAllowed(order, rules) {
  if (!rules.allowExitBeforePayment && order.paymentStatus !== "PAID") {
    return workflowError("Order must be paid before customer exit");
  }
  return null;
}

function validateArchiveAllowed(order, rules) {
  if (rules.requireGeideaBeforeArchive && !order.geideaRegisteredAt) {
    return workflowError("Order must be registered on Geidea first");
  }
  if (rules.archiveRequiresCustomerLeft && !order.customerLeft) {
    return workflowError("Customer must be marked as left first");
  }
  return null;
}

module.exports = {
  canRoleEditPaidOrder,
  canUserEditPaidOrder,
  loadWorkflowRules,
  parseRoleList,
  validateArchiveAllowed,
  validateCustomerExitAllowed,
  validatePaymentAllowed,
};
