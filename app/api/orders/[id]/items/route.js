import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function POST(request, { params }) {
  const { id } = await params;
  const body = await request.json();
  const items = Array.isArray(body.items) ? body.items : [];

  if (!items.length) {
    return NextResponse.json({ success: false, error: "Please select at least one product" }, { status: 400 });
  }

  const order = await prisma.order.findUnique({ where: { id }, include: { items: true } });
  if (!order) {
    return NextResponse.json({ success: false, error: "Order not found" }, { status: 404 });
  }

  const products = await prisma.product.findMany({
    where: { id: { in: items.map((item) => item.productId) } },
  });
  const productMap = new Map(products.map((product) => [product.id, product]));
  let addedTotal = 0;
  const orderItems = [];

  items.forEach((item) => {
    const product = productMap.get(item.productId);
    if (!product) return;

    const qty = Math.max(1, Number(item.qty) || 1);
    const total = product.price * qty;
    addedTotal += total;
    orderItems.push({
      orderId: id,
      productId: product.id,
      name: product.name,
      qty,
      price: product.price,
      total,
    });
  });

  await prisma.$transaction([
    prisma.orderItem.createMany({ data: orderItems }),
    prisma.order.update({
      where: { id },
      data: {
        total: { increment: addedTotal },
        status: order.paymentStatus === "PAID" ? "PAID" : "OPEN",
        archivedAt: null,
      },
    }),
  ]);

  return NextResponse.json({ success: true });
}
