export function restoredStatus(order) {
  if (order.paymentStatus === "PAID") return "PAID";
  if (order.kitchenStatus === "DELIVERED") return "DELIVERED";
  return "OPEN";
}

export function alertClassForOrder(order) {
  if (order.archivedAt) return "archived-order";
  if (!order.customerLeft) return "";
  if (order.paymentStatus !== "PAID") return "left-unpaid";
  return order.geideaRegisteredAt ? "" : "needs-system";
}
