import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authorizeApi } from "@/lib/api-auth";
import { ensureBusinessDayState } from "@/lib/business-day";
import { serializeDailySnapshot } from "@/lib/daily-snapshot";

export async function GET(request) {
  const { error } = await authorizeApi("DASHBOARD_READ");
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const businessState = await ensureBusinessDayState();
  const businessDate = searchParams.get("businessDate") || businessState.businessDate;
  const snapshot = businessDate ? await prisma.dailyClosingSnapshot.findUnique({ where: { businessDate } }) : null;

  if (snapshot) {
    return NextResponse.json({
      success: true,
      source: "snapshot",
      payments: serializeDailySnapshot(snapshot).paymentBreakdown,
    });
  }

  const orders = businessDate ? await prisma.order.findMany({ where: { businessDate } }) : [];
  const payments = businessDate ? await prisma.orderPayment.findMany({
    where: { order: { businessDate } },
    include: { paymentProvider: true },
  }) : [];
  const paid = orders.filter((order) => order.paymentStatus === "PAID");
  const unpaid = orders.filter((order) => order.paymentStatus !== "PAID");
  const paymentMap = new Map();

  payments.forEach((payment) => {
    const method = ["CASH", "VISA"].includes(payment.method)
      ? payment.method
      : payment.paymentProvider?.name || payment.method || "UNKNOWN";
    const current = paymentMap.get(method) || { method, count: 0, total: 0 };
    current.count += 1;
    current.total += Number(payment.amount || 0);
    paymentMap.set(method, current);
  });

  const paymentOrderIds = new Set(payments.map((payment) => payment.orderId));
  paid
    .filter((order) => !paymentOrderIds.has(order.id))
    .forEach((order) => {
      const method = order.paymentMethod || "UNKNOWN";
      const current = paymentMap.get(method) || { method, count: 0, total: 0 };
      current.count += 1;
      current.total += Number(order.total || 0);
      paymentMap.set(method, current);
    });

  return NextResponse.json({
    success: true,
    source: "live",
    payments: [
      ...Array.from(paymentMap.values()).sort((a, b) => b.total - a.total),
      { method: "UNPAID", count: unpaid.length, total: unpaid.reduce((sum, order) => sum + order.total, 0) },
    ],
  });
}
