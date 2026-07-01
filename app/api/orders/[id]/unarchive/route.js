import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authorizeApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { ensureBusinessDayState } from "@/lib/business-day";
import { routeOrderId } from "@/lib/orders";
import { restoredStatus } from "@/lib/order-workflow.mjs";

export async function POST(_request, { params }) {
  const { user, error } = await authorizeApi("ORDER_UNARCHIVE");
  if (error) return error;

  const { id: rawId } = await params;
  const id = routeOrderId(rawId);
  await ensureBusinessDayState();

  const current = await prisma.order.findUnique({ where: { id } });

  if (!current) {
    return NextResponse.json({ success: false, error: "Order not found" }, { status: 404 });
  }

  if (!current.archivedAt) {
    return NextResponse.json({ success: false, error: "Order is already active" }, { status: 400 });
  }

  const order = await prisma.order.update({
    where: { id },
    data: {
      status: restoredStatus(current),
      archivedAt: null,
    },
  });

  await writeAudit({
    action: "ORDER_UNARCHIVED",
    orderId: id,
    user,
    summary: "Unarchived order",
    metadata: { previousArchivedAt: current.archivedAt, restoredStatus: order.status },
  });

  return NextResponse.json({ success: true });
}
