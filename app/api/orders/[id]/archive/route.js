import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";

export async function POST(_request, { params }) {
  const { id } = await params;
  const user = await getCurrentUser();

  const current = await prisma.order.findUnique({ where: { id } });

  if (!current) {
    return NextResponse.json({ success: false, error: "Order not found" }, { status: 404 });
  }

  if (current.kitchenStatus !== "DELIVERED" || current.paymentStatus !== "PAID") {
    return NextResponse.json({ success: false, error: "Order must be delivered and paid first" }, { status: 400 });
  }

  await prisma.order.update({
    where: { id },
    data: {
      status: "ARCHIVED",
      archivedAt: new Date(),
    },
  });

  await writeAudit({
    action: "ORDER_ARCHIVED",
    orderId: id,
    user,
    summary: "Archived order",
    metadata: { total: current.total, paymentMethod: current.paymentMethod },
  });

  return NextResponse.json({ success: true });
}
