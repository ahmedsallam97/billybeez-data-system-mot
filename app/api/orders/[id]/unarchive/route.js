import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { ensureBusinessDayState } from "@/lib/business-day";

function restoredStatus(order) {
  if (order.paymentStatus === "PAID") return "PAID";
  if (order.kitchenStatus === "DELIVERED") return "DELIVERED";
  return "OPEN";
}

export async function POST(_request, { params }) {
  const { id } = await params;
  const user = await getCurrentUser();
  await ensureBusinessDayState();

  if (!user) {
    return NextResponse.json({ success: false, error: "Login required" }, { status: 401 });
  }

  if (!["ADMIN", "MANAGER"].includes(user.role)) {
    return NextResponse.json({ success: false, error: "Manager permission required" }, { status: 403 });
  }

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
