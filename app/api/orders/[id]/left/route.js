import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { ensureBusinessDayState } from "@/lib/business-day";

export async function POST(_request, { params }) {
  const { id } = await params;
  const user = await getCurrentUser();
  await ensureBusinessDayState();

  const order = await prisma.order.update({
    where: { id },
    data: {
      customerLeft: true,
      status: "ARCHIVED",
      archivedAt: new Date(),
    },
  }).catch(() => null);

  if (!order) {
    return NextResponse.json({ success: false, error: "Order not found" }, { status: 404 });
  }

  await writeAudit({
    action: "CUSTOMER_LEFT",
    orderId: id,
    user,
    summary: "Customer left and order archived",
    metadata: { paymentStatus: order.paymentStatus, archivedAt: order.archivedAt },
  });

  return NextResponse.json({ success: true });
}
