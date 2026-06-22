import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";

export async function POST(_request, { params }) {
  const { id } = await params;
  const user = await getCurrentUser();

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
    metadata: { previousKitchenStatus: order.kitchenStatus, paymentStatus: order.paymentStatus },
  });

  return NextResponse.json({ success: true });
}
