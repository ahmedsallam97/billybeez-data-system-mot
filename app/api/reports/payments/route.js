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
  const paid = orders.filter((order) => order.paymentStatus === "PAID");
  const unpaid = orders.filter((order) => order.paymentStatus !== "PAID");

  return NextResponse.json({
    success: true,
    source: "live",
    payments: [
      { method: "CASH", count: paid.filter((order) => order.paymentMethod === "CASH").length, total: paid.filter((order) => order.paymentMethod === "CASH").reduce((sum, order) => sum + order.total, 0) },
      { method: "VISA", count: paid.filter((order) => order.paymentMethod === "VISA").length, total: paid.filter((order) => order.paymentMethod === "VISA").reduce((sum, order) => sum + order.total, 0) },
      { method: "UNPAID", count: unpaid.length, total: unpaid.reduce((sum, order) => sum + order.total, 0) },
    ],
  });
}
