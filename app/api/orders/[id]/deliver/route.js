import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authorizeApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { ensureBusinessDayState } from "@/lib/business-day";
import { routeOrderId } from "@/lib/orders";

export async function POST(_request, { params }) {
  const { user, error } = await authorizeApi("ORDER_DELIVER");
  if (error) return error;

  const { id: rawId } = await params;
  const id = routeOrderId(rawId);
  await ensureBusinessDayState();

  const order = await prisma.order.findUnique({ where: { id } });
  if (!order) {
    return NextResponse.json({ success: false, error: "Order not found" }, { status: 404 });
  }

  await prisma.order.update({
    where: { id },
    data: {
      kitchenStatus: "DELIVERED",
      status: order.paymentStatus === "PAID" ? "PAID" : "DELIVERED",
    },
  });

  await writeAudit({
    action: "ORDER_DELIVERED",
    orderId: id,
    user,
    summary: "Marked delivered",
    metadata: {
      previousKitchenStatus: order.kitchenStatus,
      paymentStatus: order.paymentStatus,
    },
  });

  return NextResponse.json({ success: true });
}
