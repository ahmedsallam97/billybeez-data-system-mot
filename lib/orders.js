function includeOrderDetails() {
  return {
    cashier: true,
    dataEmployee: true,
    items: {
      orderBy: { createdAt: "asc" },
    },
  };
}

function serializeOrder(order) {
  return {
    id: order.id,
    businessDate: order.businessDate,
    braceletNo: order.braceletNo,
    childNames: order.childNames,
    childrenCount: order.childrenCount,
    total: order.total,
    status: order.status,
    kitchenStatus: order.kitchenStatus,
    paymentStatus: order.paymentStatus,
    paymentMethod: order.paymentMethod,
    customerLeft: order.customerLeft,
    archivedAt: order.archivedAt,
    createdAt: order.createdAt,
    cashier: order.cashier?.name || "",
    dataEmployee: order.dataEmployee?.name || "",
    items: (order.items || []).map((item) => ({
      id: item.id,
      productId: item.productId,
      name: item.name,
      qty: item.qty,
      price: item.price,
      total: item.total,
    })),
  };
}

function buildOrderId() {
  return "ORD-" + Date.now();
}

function validateBracelet(braceletNo) {
  return /^[0-3][0-9]{5}$/.test(String(braceletNo || "").trim());
}

module.exports = {
  includeOrderDetails,
  serializeOrder,
  buildOrderId,
  validateBracelet,
};
