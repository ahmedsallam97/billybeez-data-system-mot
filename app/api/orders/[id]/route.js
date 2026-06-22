import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { ensureBusinessDayState } from "@/lib/business-day";
import { includeOrderDetails, serializeOrder } from "@/lib/orders";

export async function GET(_request, { params }) {
  const { id } = await params;
  await ensureBusinessDayState();

  const order = await prisma.order.findUnique({
    where: { id },
    include: includeOrderDetails(),
  });

  if (!order) {
    return NextResponse.json({ success: false, error: "Order not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true, order: serializeOrder(order) });
}
