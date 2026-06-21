import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function POST(_request, { params }) {
  const { id } = await params;

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

  return NextResponse.json({ success: true });
}
