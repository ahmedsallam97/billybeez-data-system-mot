import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authorizeApi } from "@/lib/api-auth";
import { ensureBusinessDayState, serializeHistoryOrder } from "@/lib/business-day";
import { includeOrderDetails, serializeOrder } from "@/lib/orders";

export async function GET() {
  const { error } = await authorizeApi("DASHBOARD_READ");
  if (error) return error;

  const businessState = await ensureBusinessDayState();

  const [orders, historyOrders, businessDays, auditLogs] = await Promise.all([
    prisma.order.findMany({
      include: includeOrderDetails(),
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    prisma.orderHistory.findMany({
      orderBy: [{ businessDate: "desc" }, { orderCreatedAt: "desc" }],
      take: 300,
    }),
    prisma.businessDay.findMany({
      orderBy: { businessDate: "desc" },
      take: 60,
    }),
    prisma.auditLog.findMany({
      include: {
        user: true,
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
  ]);

  const serialized = orders.map(serializeOrder);
  const serializedHistory = historyOrders.map(serializeHistoryOrder);
  const allOrderMap = new Map();

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
  });
}
