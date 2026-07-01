import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authorizeApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { ensureBusinessDayState } from "@/lib/business-day";
import { routeOrderId } from "@/lib/orders";

export async function POST(_request, { params }) {
  const { user, error } = await authorizeApi("ORDER_ARCHIVE");
  if (error) return error;

  const { id: rawId } = await params;
  const id = routeOrderId(rawId);
  await ensureBusinessDayState();

  const current = await prisma.order.findUnique({ where: { id } });

  if (!current) {
    return NextResponse.json({ success: false, error: "Order not found" }, { status: 404 });
  }

  if (!current.geideaRegisteredAt) {
    return NextResponse.json({ success: false, error: "Order must be registered on Geidea first" }, { status: 400 });
  }

  if (!current.customerLeft) {
    return NextResponse.json({ success: false, error: "Customer must be marked as left first" }, { status: 400 });
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
    metadata: {
      total: current.total,
      paymentMethod: current.paymentMethod,
      geideaRegisteredAt: current.geideaRegisteredAt,
    },
  });

  return NextResponse.json({ success: true });
}
