import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function POST(request, { params }) {
  const { id } = await params;
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

  return NextResponse.json({ success: true });
}
