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
      products: serializeDailySnapshot(snapshot).topProducts,
    });
  }

  const orders = businessDate ? await prisma.order.findMany({ where: { businessDate }, include: { items: true } }) : [];
  const productMap = new Map();
  orders.forEach((order) => order.items.forEach((item) => {
    const current = productMap.get(item.name) || { name: item.name, qty: 0, total: 0 };
    current.qty += item.qty;
    current.total += item.total;
    productMap.set(item.name, current);
  }));

  return NextResponse.json({
    success: true,
    source: "live",
    products: Array.from(productMap.values()).sort((a, b) => b.total - a.total).slice(0, 10),
  });
}
