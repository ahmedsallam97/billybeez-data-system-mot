import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { ensureBusinessDayState } from "@/lib/business-day";

export async function POST(request, { params }) {
  const { id } = await params;
  const user = await getCurrentUser();
  await ensureBusinessDayState();
  const body = await request.json();
  const paymentMethod = body.paymentMethod === "VISA" ? "VISA" : "CASH";

  const order = await prisma.order.update({
    where: { id },
    data: {
      paymentStatus: "PAID",
      paymentMethod,
      status: "PAID",
    },
  }).catch(() => null);

  if (!order) {
    return NextResponse.json({ success: false, error: "Order not found" }, { status: 404 });
  }

  await writeAudit({
    action: "ORDER_PAID",
    orderId: id,
    user,
    summary: `Marked paid by ${paymentMethod}`,
    metadata: { paymentMethod, total: order.total },
  });

  return NextResponse.json({ success: true });
}
