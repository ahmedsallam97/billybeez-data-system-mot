import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authorizeApi } from "@/lib/api-auth";
import { ensureBusinessDayState, serializeHistoryOrder } from "@/lib/business-day";
import { serializeOrderRecord } from "@/lib/order-records";
import { includeOrderDetails, serializeOrder } from "@/lib/orders";

export async function GET(request) {
  const { error } = await authorizeApi("DASHBOARD_READ");
  if (error) return error;

  const light = request.nextUrl.searchParams.get("light") === "1";
  const businessState = await ensureBusinessDayState();

  const [orders, historyOrders, businessDays, auditLogs, orderRecords] = await Promise.all([
    prisma.order.findMany({
      include: includeOrderDetails(),
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    light ? Promise.resolve([]) : prisma.orderHistory.findMany({
      orderBy: [{ businessDate: "desc" }, { orderCreatedAt: "desc" }],
      take: 300,
    }),
    prisma.businessDay.findMany({
      orderBy: { businessDate: "desc" },
      take: light ? 15 : 60,
    }),
    light ? Promise.resolve([]) : prisma.auditLog.findMany({
      include: {
        user: true,
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    light ? Promise.resolve([]) : prisma.orderTransactionRecord.findMany({
      orderBy: [{ businessDate: "desc" }, { updatedAt: "desc" }],
      take: 500,
    }),
  ]);

  const recordMap = new Map(orderRecords.map((record) => [record.orderId, record]));
  const serialized = orders.map((order) => serializeOrder(order, recordMap.get(order.id)));
  const serializedHistory = historyOrders.map(serializeHistoryOrder);
  const allOrderMap = new Map();

  if (light) {
    const activeOrders = serialized.filter((order) => !order.archivedAt);
    const paidOrders = activeOrders.filter((order) => order.paymentStatus === "PAID");
    const unpaidOrders = activeOrders.filter((order) => order.paymentStatus !== "PAID");

    return NextResponse.json({
      businessState,
      reportBusinessDate: businessState.businessDate || businessDays[0]?.businessDate || null,
      totalSales: paidOrders.reduce((sum, order) => sum + order.total, 0),
      ordersCount: activeOrders.length,
      paidOrders: paidOrders.length,
      unpaidOrders: unpaidOrders.length,
      cashSales: paidOrders.filter((order) => order.paymentMethod === "CASH").reduce((sum, order) => sum + order.total, 0),
      visaSales: paidOrders.filter((order) => order.paymentMethod === "VISA").reduce((sum, order) => sum + order.total, 0),
      leftUnpaid: unpaidOrders.filter((order) => order.customerLeft).length,
      archivedOrders: 0,
      geideaRegisteredOrders: activeOrders.filter((order) => order.geideaRegisteredAt).length,
      paymentBreakdown: [],
      statusBreakdown: [],
      topProducts: [],
      topBracelets: [],
      cashierPerformance: [],
      dataEmployeePerformance: [],
      dailySales: [],
      auditLogs: [],
      businessDays: businessDays.map((day) => ({
        businessDate: day.businessDate,
        openedAt: day.openedAt,
        closedAt: day.closedAt,
        closedOrderCount: day.closedOrderCount,
        closedTotal: day.closedTotal,
      })),
      orders: serialized,
      orderHistory: [],
      orderRecords: [],
    });
  }

  serializedHistory.forEach((order) => allOrderMap.set(order.id, order));
  serialized.forEach((order) => allOrderMap.set(order.id, order));

  const allOrders = Array.from(allOrderMap.values());
  const reportBusinessDate = businessState.businessDate
    || businessDays[0]?.businessDate
    || allOrders[0]?.businessDate
    || null;
  const reportOrders = reportBusinessDate
    ? allOrders.filter((order) => order.businessDate === reportBusinessDate)
    : [];
  const paid = reportOrders.filter((order) => order.paymentStatus === "PAID");
  const unpaid = reportOrders.filter((order) => order.paymentStatus !== "PAID");
  const totalSales = paid.reduce((sum, order) => sum + order.total, 0);
  const cashSales = paid.filter((order) => order.paymentMethod === "CASH").reduce((sum, order) => sum + order.total, 0);
  const visaSales = paid.filter((order) => order.paymentMethod === "VISA").reduce((sum, order) => sum + order.total, 0);
  const productMap = new Map();
  const cashierMap = new Map();
  const employeeMap = new Map();
  const braceletMap = new Map();
  const statusMap = new Map();
  const dailyMap = new Map();

  reportOrders.forEach((order) => {
    cashierMap.set(order.cashier || "Unknown", (cashierMap.get(order.cashier || "Unknown") || 0) + order.total);
    employeeMap.set(order.dataEmployee || "Unassigned", (employeeMap.get(order.dataEmployee || "Unassigned") || 0) + order.total);
    braceletMap.set(order.braceletNo, (braceletMap.get(order.braceletNo) || 0) + order.total);
    statusMap.set(order.status, (statusMap.get(order.status) || 0) + 1);
    order.items.forEach((item) => {
      const current = productMap.get(item.name) || { name: item.name, qty: 0, total: 0 };
      current.qty += item.qty;
      current.total += item.total;
      productMap.set(item.name, current);
    });
  });

  allOrders
    .filter((order) => order.paymentStatus === "PAID")
    .forEach((order) => {
      const day = order.businessDate || new Date(order.createdAt).toISOString().slice(0, 10);
      dailyMap.set(day, (dailyMap.get(day) || 0) + order.total);
    });

  return NextResponse.json({
    businessState,
    reportBusinessDate,
    totalSales,
    ordersCount: reportOrders.length,
    paidOrders: paid.length,
    unpaidOrders: unpaid.length,
    cashSales,
    visaSales,
    leftUnpaid: unpaid.filter((order) => order.customerLeft).length,
    archivedOrders: reportOrders.filter((order) => order.archivedAt).length,
    geideaRegisteredOrders: reportOrders.filter((order) => order.geideaRegisteredAt).length,
    paymentBreakdown: [
      { method: "CASH", total: cashSales, count: paid.filter((order) => order.paymentMethod === "CASH").length },
      { method: "VISA", total: visaSales, count: paid.filter((order) => order.paymentMethod === "VISA").length },
      { method: "UNPAID", total: unpaid.reduce((sum, order) => sum + order.total, 0), count: unpaid.length },
    ],
    statusBreakdown: Array.from(statusMap.entries()).map(([status, count]) => ({ status, count })),
    topProducts: Array.from(productMap.values()).sort((a, b) => b.total - a.total).slice(0, 8),
    topBracelets: Array.from(braceletMap.entries()).map(([bracelet, total]) => ({ bracelet, total })).sort((a, b) => b.total - a.total).slice(0, 8),
    cashierPerformance: Array.from(cashierMap.entries()).map(([name, total]) => ({ name, total })).sort((a, b) => b.total - a.total),
    dataEmployeePerformance: Array.from(employeeMap.entries()).map(([name, total]) => ({ name, total })).sort((a, b) => b.total - a.total),
    dailySales: Array.from(dailyMap.entries()).map(([date, total]) => ({ date, total })).sort((a, b) => a.date.localeCompare(b.date)),
    auditLogs: auditLogs.map((log) => ({
      id: log.id,
      action: log.action,
      orderId: log.orderReference || log.orderId,
      user: log.user?.name || "System",
      summary: log.summary,
      createdAt: log.createdAt,
    })),
    businessDays: businessDays.map((day) => ({
      businessDate: day.businessDate,
      openedAt: day.openedAt,
      closedAt: day.closedAt,
      closedOrderCount: day.closedOrderCount,
      closedTotal: day.closedTotal,
    })),
    orders: serialized,
    orderHistory: serializedHistory,
    orderRecords: orderRecords.map(serializeOrderRecord),
  });
}
