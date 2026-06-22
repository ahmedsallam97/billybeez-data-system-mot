import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { ensureBusinessDayState } from "@/lib/business-day";

export async function POST(_request, { params }) {
  const { id } = await params;
  const user = await getCurrentUser();
  await ensureBusinessDayState();

  const current = await prisma.order.findUnique({ where: { id } });

  if (!current) {
    return NextResponse.json({ success: false, error: "Order not found" }, { status: 404 });
  }

  const order = await prisma.order.update({
    where: { id },
    data: {
      customerLeft: true,
    },
  });

  await writeAudit({
    action: "CUSTOMER_LEFT",
    orderId: id,
    user,
    summary: "Customer left",
    metadata: { paymentStatus: order.paymentStatus, kitchenStatus: order.kitchenStatus },
  });

  return NextResponse.json({ success: true });
}
