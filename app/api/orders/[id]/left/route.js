import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function POST(_request, { params }) {
  const { id } = await params;

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

  return NextResponse.json({ success: true });
}
