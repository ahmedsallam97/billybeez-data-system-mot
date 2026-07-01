const { prisma } = require("./db");

function includeOrderDetails() {
  return {
    cashier: true,
    dataEmployee: true,
    deliveryEmployee: true,
    geideaEmployee: true,
    paymentEmployee: true,
    exitEmployee: true,
    items: {
      orderBy: { createdAt: "asc" },
      include: {
        product: {
          include: {
            category: true,
          },
        },
      },
    },
  };
}

function serializeOrder(order) {
  return {
    id: order.id,
    businessDate: order.businessDate,
    braceletNo: order.braceletNo,
    customerPhone: order.customerPhone || "",
    childNames: order.childNames,
    childrenCount: order.childrenCount,
    total: order.total,
    status: order.status,
    kitchenStatus: order.kitchenStatus,
    paymentStatus: order.paymentStatus,
    paymentMethod: order.paymentMethod,
    customerLeft: order.customerLeft,
    geideaRegisteredAt: order.geideaRegisteredAt,
    archivedAt: order.archivedAt,
    createdAt: order.createdAt,
    deliveryEmployeeId: order.deliveryEmployeeId || "",
    geideaEmployeeId: order.geideaEmployeeId || "",
    paymentEmployeeId: order.paymentEmployeeId || "",
    exitEmployeeId: order.exitEmployeeId || "",
    cashier: order.cashier?.name || "",
    dataEmployee: order.dataEmployee?.name || "",
    deliveryEmployee: order.deliveryEmployee?.name || "",
    geideaEmployee: order.geideaEmployee?.name || "",
    paymentEmployee: order.paymentEmployee?.name || "",
    exitEmployee: order.exitEmployee?.name || "",
    items: (order.items || []).map((item) => ({
      id: item.id,
      productId: item.productId,
      name: item.name,
      qty: item.qty,
      price: item.price,
      total: item.total,
      categoryId: item.product?.categoryId || "",
      categoryName: item.product?.category?.name || "",
    })),
  };
}

function orderNumberFromId(id) {
  const match = String(id || "").match(/^ORD#(\d+)$/);
  return match ? Number(match[1]) || 0 : 0;
}

function routeOrderId(id) {
  try {
    return decodeURIComponent(String(id || ""));
  } catch {
    return String(id || "");
  }
}

async function buildOrderId() {
  const [orders, historyOrders] = await Promise.all([
    prisma.order.findMany({ select: { id: true } }),
    prisma.orderHistory.findMany({ select: { originalOrderId: true } }),
  ]);

  const maxOrder = orders.reduce((max, order) => Math.max(max, orderNumberFromId(order.id)), 0);
  const maxHistory = historyOrders.reduce((max, order) => Math.max(max, orderNumberFromId(order.originalOrderId)), 0);

  return `ORD#${Math.max(maxOrder, maxHistory) + 1}`;
}

function validateBracelet(braceletNo) {
  return /^[0-3][0-9]{5}$/.test(String(braceletNo || "").trim());
}

module.exports = {
  includeOrderDetails,
  serializeOrder,
  buildOrderId,
  routeOrderId,
  validateBracelet,
};
