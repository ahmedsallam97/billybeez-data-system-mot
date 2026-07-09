const { prisma } = require("./db");
const { nextSequence, seedSequence } = require("./numbering");

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
    printJobs: {
      where: { type: "KITCHEN" },
      orderBy: { createdAt: "desc" },
      take: 1,
    },
  };
}

function serializeOrder(order, transactionRecord = null) {
  return {
    id: order.id,
    businessDate: order.businessDate,
    braceletNo: order.braceletNo,
    customerPhone: order.customerPhone || "",
    childNames: order.childNames,
    childrenCount: order.childrenCount,
    total: order.total,
    status: order.status,
    workflowState: order.workflowState || "",
    kitchenStatus: order.kitchenStatus,
    paymentStatus: order.paymentStatus,
    paymentMethod: order.paymentMethod,
    customerLeft: order.customerLeft,
    customerLeftAt: order.customerLeftAt,
    geideaRegisteredAt: order.geideaRegisteredAt,
    deliveredAt: transactionRecord?.deliveredAt || null,
    paidAt: transactionRecord?.paidAt || null,
    archivedAt: order.archivedAt,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    deliveryEmployeeId: order.deliveryEmployeeId || "",
    geideaEmployeeId: order.geideaEmployeeId || "",
    paymentEmployeeId: order.paymentEmployeeId || "",
    exitEmployeeId: order.exitEmployeeId || "",
    cashier: order.cashier?.name || "",
    dataEmployee: order.dataEmployee?.name || "",
    deliveryEmployee: order.deliveryEmployee?.name || transactionRecord?.deliveredByEmployeeName || transactionRecord?.deliveredByUserName || "",
    geideaEmployee: order.geideaEmployee?.name || transactionRecord?.geideaByEmployeeName || transactionRecord?.geideaByUserName || "",
    paymentEmployee: order.paymentEmployee?.name || transactionRecord?.paidByEmployeeName || transactionRecord?.paidByUserName || "",
    exitEmployee: order.exitEmployee?.name || "",
    kitchenPrintJob: order.printJobs?.[0] ? {
      id: order.printJobs[0].id,
      status: order.printJobs[0].status,
      printerName: order.printJobs[0].printerName || "",
      error: order.printJobs[0].error || "",
      printedAt: order.printJobs[0].printedAt,
      createdAt: order.printJobs[0].createdAt,
    } : null,
    items: (order.items || []).map((item) => ({
      id: item.id,
      productId: item.productId,
      name: item.name,
      qty: item.qty,
      price: item.price,
      total: item.total,
      createdAt: item.createdAt,
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
  const nextMinimum = Math.max(maxOrder, maxHistory) + 1;
  await seedSequence("order", nextMinimum - 1);

  return `ORD#${await nextSequence("order")}`;
}

function validateBracelet(braceletNo) {
  return /^(0[0-9]{4}|[0-3][0-9]{5})$/.test(String(braceletNo || "").trim());
}

function validateCustomerPhone(customerPhone) {
  const phone = String(customerPhone || "").trim();
  return !phone || /^01[012][0-9]{8}$/.test(phone);
}

module.exports = {
  includeOrderDetails,
  serializeOrder,
  buildOrderId,
  routeOrderId,
  validateBracelet,
  validateCustomerPhone,
};
