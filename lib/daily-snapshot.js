function parseItems(order) {
  if (Array.isArray(order.items)) return order.items;
  try {
    return JSON.parse(order.itemsJson || "[]");
  } catch {
    return [];
  }
}

function buildDailySnapshotData(businessDate, orders) {
  const paid = orders.filter((order) => order.paymentStatus === "PAID");
  const unpaid = orders.filter((order) => order.paymentStatus !== "PAID");
  const cashPaid = paid.filter((order) => order.paymentMethod === "CASH");
  const visaPaid = paid.filter((order) => order.paymentMethod === "VISA");
  const productMap = new Map();
  const statusMap = new Map();

  orders.forEach((order) => {
    statusMap.set(order.status, (statusMap.get(order.status) || 0) + 1);
    parseItems(order).forEach((item) => {
      const current = productMap.get(item.name) || { name: item.name, qty: 0, total: 0 };
      current.qty += Number(item.qty) || 0;
      current.total += Number(item.total) || 0;
      productMap.set(item.name, current);
    });
  });

  const cashTotal = cashPaid.reduce((sum, order) => sum + Number(order.total || 0), 0);
  const visaTotal = visaPaid.reduce((sum, order) => sum + Number(order.total || 0), 0);
  const unpaidTotal = unpaid.reduce((sum, order) => sum + Number(order.total || 0), 0);
  const topProducts = Array.from(productMap.values()).sort((a, b) => b.total - a.total).slice(0, 10);
  const paymentBreakdown = [
    { method: "CASH", total: cashTotal, count: cashPaid.length },
    { method: "VISA", total: visaTotal, count: visaPaid.length },
    { method: "UNPAID", total: unpaidTotal, count: unpaid.length },
  ];
  const statusBreakdown = Array.from(statusMap.entries()).map(([status, count]) => ({ status, count }));

  return {
    businessDate,
    ordersCount: orders.length,
    paidOrdersCount: paid.length,
    unpaidOrdersCount: unpaid.length,
    cashTotal,
    visaTotal,
    unpaidTotal,
    notRegisteredGeidea: orders.filter((order) => !order.geideaRegisteredAt).length,
    leftUnpaid: orders.filter((order) => order.customerLeft && order.paymentStatus !== "PAID").length,
    archivedOrdersCount: orders.filter((order) => order.archivedAt).length,
    topProductsJson: JSON.stringify(topProducts),
    paymentBreakdownJson: JSON.stringify(paymentBreakdown),
    statusBreakdownJson: JSON.stringify(statusBreakdown),
  };
}

function serializeDailySnapshot(snapshot) {
  const parse = (value) => {
    try {
      return JSON.parse(value || "[]");
    } catch {
      return [];
    }
  };

  return {
    businessDate: snapshot.businessDate,
    ordersCount: snapshot.ordersCount,
    paidOrdersCount: snapshot.paidOrdersCount,
    unpaidOrdersCount: snapshot.unpaidOrdersCount,
    cashTotal: snapshot.cashTotal,
    visaTotal: snapshot.visaTotal,
    unpaidTotal: snapshot.unpaidTotal,
    notRegisteredGeidea: snapshot.notRegisteredGeidea,
    leftUnpaid: snapshot.leftUnpaid,
    archivedOrdersCount: snapshot.archivedOrdersCount,
    topProducts: parse(snapshot.topProductsJson),
    paymentBreakdown: parse(snapshot.paymentBreakdownJson),
    statusBreakdown: parse(snapshot.statusBreakdownJson),
    createdAt: snapshot.createdAt,
    updatedAt: snapshot.updatedAt,
  };
}

async function upsertDailyClosingSnapshot(client, businessDate, orders) {
  const data = buildDailySnapshotData(businessDate, orders);
  return client.dailyClosingSnapshot.upsert({
    where: { businessDate },
    create: data,
    update: data,
  });
}

module.exports = {
  buildDailySnapshotData,
  serializeDailySnapshot,
  upsertDailyClosingSnapshot,
};
