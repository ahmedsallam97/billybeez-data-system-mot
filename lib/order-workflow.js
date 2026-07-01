const workflowRank = {
  OPEN: 0,
  PREPARING: 1,
  DELIVERED: 2,
  PAID: 3,
  GEIDEA_REGISTERED: 4,
  CUSTOMER_LEFT: 5,
  ARCHIVED: 6,
};

function restoredStatus(order) {
  if (order.paymentStatus === "PAID") return "PAID";
  if (order.kitchenStatus === "DELIVERED") return "DELIVERED";
  return "OPEN";
}

function workflowStateFromOrder(order) {
  if (order.archivedAt || order.status === "ARCHIVED") return "ARCHIVED";
  if (order.customerLeft) return "CUSTOMER_LEFT";
  if (order.geideaRegisteredAt) return "GEIDEA_REGISTERED";
  if (order.paymentStatus === "PAID") return "PAID";
  if (order.kitchenStatus === "DELIVERED") return "DELIVERED";
  if (order.workflowState === "PREPARING") return "PREPARING";
  return "OPEN";
}

function nextWorkflowState(order, requestedState) {
  const current = workflowStateFromOrder(order);
  if (!requestedState) return current;
  return workflowRank[requestedState] > workflowRank[current] ? requestedState : current;
}

function alertClassForOrder(order) {
  if (order.archivedAt) return "archived-order";
  if (!order.customerLeft) return "";
  if (order.paymentStatus !== "PAID") return "left-unpaid";
  return order.geideaRegisteredAt ? "" : "needs-system";
}

function orderAuditSnapshot(order) {
  if (!order) return null;

  return {
    id: order.id,
    status: order.status,
    workflowState: workflowStateFromOrder(order),
    kitchenStatus: order.kitchenStatus,
    paymentStatus: order.paymentStatus,
    paymentMethod: order.paymentMethod,
    customerLeft: order.customerLeft,
    geideaRegisteredAt: order.geideaRegisteredAt,
    archivedAt: order.archivedAt,
    total: order.total,
  };
}

module.exports = {
  alertClassForOrder,
  nextWorkflowState,
  orderAuditSnapshot,
  restoredStatus,
  workflowStateFromOrder,
};
