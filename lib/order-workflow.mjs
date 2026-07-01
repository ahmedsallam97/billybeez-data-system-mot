export function restoredStatus(order) {
  if (order.paymentStatus === "PAID") return "PAID";
  if (order.kitchenStatus === "DELIVERED") return "DELIVERED";
  return "OPEN";
}

export function workflowStateFromOrder(order) {
  if (order.archivedAt || order.status === "ARCHIVED") return "ARCHIVED";
  if (order.customerLeft) return "CUSTOMER_LEFT";
  if (order.geideaRegisteredAt) return "GEIDEA_REGISTERED";
  if (order.paymentStatus === "PAID") return "PAID";
  if (order.kitchenStatus === "DELIVERED") return "DELIVERED";
  if (order.workflowState === "PREPARING") return "PREPARING";
  return "OPEN";
}

export function alertClassForOrder(order) {
  if (order.archivedAt) return "archived-order";
  if (!order.customerLeft) return "";
  if (order.paymentStatus !== "PAID") return "left-unpaid";
  return order.geideaRegisteredAt ? "" : "needs-system";
}
