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

  serialized.forEach((order) => {
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
    topProducts: Array.from(productMap.values()).sort((a, b) => b.total - a.total).slice(0, 8),
    orders: serialized,
  });
}
