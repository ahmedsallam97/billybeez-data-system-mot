import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { includeOrderDetails, serializeOrder } from "@/lib/orders";

export async function GET() {
  const orders = await prisma.order.findMany({
    include: includeOrderDetails(),
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  const serialized = orders.map(serializeOrder);
  const paid = serialized.filter((order) => order.paymentStatus === "PAID");
  const unpaid = serialized.filter((order) => order.paymentStatus !== "PAID");
  const totalSales = paid.reduce((sum, order) => sum + order.total, 0);
  const cashSales = paid.filter((order) => order.paymentMethod === "CASH").reduce((sum, order) => sum + order.total, 0);
  const visaSales = paid.filter((order) => order.paymentMethod === "VISA").reduce((sum, order) => sum + order.total, 0);
  const productMap = new Map();
  const cashierMap = new Map();
  const employeeMap = new Map();
  const braceletMap = new Map();
  const statusMap = new Map();
  const dailyMap = new Map();

  serialized.forEach((order) => {
    cashierMap.set(order.cashier || "Unknown", (cashierMap.get(order.cashier || "Unknown") || 0) + order.total);
    employeeMap.set(order.dataEmployee || "Unassigned", (employeeMap.get(order.dataEmployee || "Unassigned") || 0) + order.total);
    braceletMap.set(order.braceletNo, (braceletMap.get(order.braceletNo) || 0) + order.total);
    statusMap.set(order.status, (statusMap.get(order.status) || 0) + 1);
    const day = new Date(order.createdAt).toISOString().slice(0, 10);
    dailyMap.set(day, (dailyMap.get(day) || 0) + order.total);

    order.items.forEach((item) => {
      const current = productMap.get(item.name) || { name: item.name, qty: 0, total: 0 };
      current.qty += item.qty;
      current.total += item.total;
      productMap.set(item.name, current);
    });
  });

  return NextResponse.json({
    totalSales,
    ordersCount: serialized.length,
    paidOrders: paid.length,
    unpaidOrders: unpaid.length,
    cashSales,
    visaSales,
    leftUnpaid: unpaid.filter((order) => order.customerLeft).length,
    archivedOrders: serialized.filter((order) => order.archivedAt).length,
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
    orders: serialized,
  });
}
