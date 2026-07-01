import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authorizeApi } from "@/lib/api-auth";
import { ensureBusinessDayState, serializeHistoryOrder } from "@/lib/business-day";
import { buildDailySnapshotData, serializeDailySnapshot } from "@/lib/daily-snapshot";
import { includeOrderDetails, serializeOrder } from "@/lib/orders";

export async function GET(request) {
  const { error } = await authorizeApi("DASHBOARD_READ");
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const businessState = await ensureBusinessDayState();
  const businessDate = searchParams.get("businessDate") || businessState.businessDate;

  if (!businessDate) {
    return NextResponse.json({ success: false, error: "No business date available" }, { status: 400 });
  }

  const snapshot = await prisma.dailyClosingSnapshot.findUnique({ where: { businessDate } });
  if (snapshot) {
    return NextResponse.json({ success: true, source: "snapshot", snapshot: serializeDailySnapshot(snapshot) });
  }

  const [orders, history] = await Promise.all([
    prisma.order.findMany({ where: { businessDate }, include: includeOrderDetails() }),
    prisma.orderHistory.findMany({ where: { businessDate } }),
  ]);
  const reportOrders = [...orders.map(serializeOrder), ...history.map(serializeHistoryOrder)];

  return NextResponse.json({
    success: true,
    source: "live",
    snapshot: buildDailySnapshotData(businessDate, reportOrders),
  });
}
