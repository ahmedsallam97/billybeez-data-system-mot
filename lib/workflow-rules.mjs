export function parseRoleList(value) {
  return String(value || "")
    .split(",")
    .map((role) => role.trim().toUpperCase())
    .filter(Boolean);
}

export function canRoleEditPaidOrder(role, rolesValue) {
  return parseRoleList(rolesValue).includes(String(role || "").toUpperCase());
}

function workflowError(message, status = 400) {
  return { message, status };
}

export function validatePaymentAllowed(order, rules) {
  if (!rules.allowPaymentBeforeDelivery && order.kitchenStatus !== "DELIVERED") {
    return workflowError("Order must be delivered before payment");
  }
  return null;
}

export function validateCustomerExitAllowed(order, rules) {
  if (!rules.allowExitBeforePayment && order.paymentStatus !== "PAID") {
    return workflowError("Order must be paid before customer exit");
  }
  return null;
}

export function validateArchiveAllowed(order, rules) {
  if (rules.requireGeideaBeforeArchive && !order.geideaRegisteredAt) {
    return workflowError("Order must be registered on Geidea first");
  }
  if (rules.archiveRequiresCustomerLeft && !order.customerLeft) {
    return workflowError("Customer must be marked as left first");
  }
  return null;
}
