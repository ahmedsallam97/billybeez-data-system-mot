import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";

export async function POST(_request, { params }) {
  const { id } = await params;
  const user = await getCurrentUser();

  const order = await prisma.order.update({
    where: { id },
    data: {
      customerLeft: true,
      status: "OPEN",
    },
  }).catch(() => null);

  if (!order) {
    return NextResponse.json({ success: false, error: "Order not found" }, { status: 404 });
  }

  await writeAudit({
    action: "CUSTOMER_LEFT",
    orderId: id,
    user,
    summary: "Customer marked as left",
    metadata: { paymentStatus: order.paymentStatus },
  });

  return NextResponse.json({ success: true });
}
