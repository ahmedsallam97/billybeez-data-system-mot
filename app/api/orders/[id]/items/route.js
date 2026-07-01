import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authorizeApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { ensureBusinessDayState } from "@/lib/business-day";
import { routeOrderId } from "@/lib/orders";
import { orderAuditSnapshot, restoredStatus } from "@/lib/order-workflow";

export async function POST(request, { params }) {
  const { user, error } = await authorizeApi("ORDER_EDIT_ITEMS");
  if (error) return error;

  const { id: rawId } = await params;
  const id = routeOrderId(rawId);
  await ensureBusinessDayState();
  const body = await request.json();
  const items = Array.isArray(body.items) ? body.items : [];

  if (!items.length) {
    return NextResponse.json({ success: false, error: "Please select at least one product" }, { status: 400 });
  }

  const order = await prisma.order.findUnique({ where: { id }, include: { items: true } });
  if (!order) {
    return NextResponse.json({ success: false, error: "Order not found" }, { status: 404 });
  }

  if (order.paymentStatus === "PAID" && !["ADMIN", "MANAGER"].includes(user.role)) {
    return NextResponse.json({ success: false, error: "Paid orders can only be edited by manager" }, { status: 403 });
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

  const [, updatedOrder] = await prisma.$transaction([
    prisma.orderItem.createMany({ data: orderItems }),
    prisma.order.update({
      where: { id },
      data: {
        total: { increment: addedTotal },
        status: restoredStatus(order),
        workflowState: restoredStatus(order),
        geideaRegisteredAt: null,
        geideaEmployeeId: null,
        archivedAt: null,
      },
    }),
  ]);

  await writeAudit({
    action: "ORDER_ITEMS_ADDED",
    orderId: id,
    user,
    summary: `Added ${orderItems.length} item lines`,
    metadata: { addedTotal, items: orderItems.map((item) => ({ name: item.name, qty: item.qty, total: item.total })) },
    before: orderAuditSnapshot(order),
    after: orderAuditSnapshot(updatedOrder),
    reason: "Items added, Geidea/archive state reset",
  });

  return NextResponse.json({ success: true });
}

export async function DELETE(request, { params }) {
  const { user, error } = await authorizeApi("ORDER_EDIT_ITEMS");
  if (error) return error;

  if (!["ADMIN", "MANAGER"].includes(user.role)) {
    return NextResponse.json({ success: false, error: "Only manager can remove items" }, { status: 403 });
  }

  const { id: rawId } = await params;
  const id = routeOrderId(rawId);
  await ensureBusinessDayState();
  const body = await request.json().catch(() => ({}));
  const itemId = String(body.itemId || "");

  if (!itemId) {
    return NextResponse.json({ success: false, error: "Item is required" }, { status: 400 });
  }

  const order = await prisma.order.findUnique({
    where: { id },
    include: { items: true },
  });

  if (!order) {
    return NextResponse.json({ success: false, error: "Order not found" }, { status: 404 });
  }

  const item = order.items.find((line) => line.id === itemId);

  if (!item) {
    return NextResponse.json({ success: false, error: "Item not found" }, { status: 404 });
  }

  const nextTotal = Math.max(0, Number(order.total || 0) - Number(item.total || 0));

  const [, updatedOrder] = await prisma.$transaction([
    prisma.orderItem.delete({ where: { id: itemId } }),
    prisma.order.update({
      where: { id },
      data: {
        total: nextTotal,
        status: restoredStatus(order),
        workflowState: restoredStatus(order),
        geideaRegisteredAt: null,
        geideaEmployeeId: null,
        archivedAt: null,
      },
    }),
  ]);

  await writeAudit({
    action: "ORDER_ITEM_REMOVED",
    orderId: id,
    user,
    summary: "Removed item line",
    metadata: { name: item.name, qty: item.qty, total: item.total, nextTotal },
    before: orderAuditSnapshot(order),
    after: orderAuditSnapshot(updatedOrder),
    reason: "Item removed, Geidea/archive state reset",
  });

  return NextResponse.json({ success: true });
}
