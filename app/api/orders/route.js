import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { ensureBusinessDayState } from "@/lib/business-day";
import { buildOrderId, includeOrderDetails, serializeOrder, validateBracelet } from "@/lib/orders";

export async function GET(request) {
  await ensureBusinessDayState();

  const { searchParams } = new URL(request.url);
  const paymentStatus = searchParams.get("paymentStatus");
  const archived = searchParams.get("archived");

  const where = {};

  if (paymentStatus) where.paymentStatus = paymentStatus;
  if (archived === "true") where.archivedAt = { not: null };
  if (archived === "false") where.archivedAt = null;

  const orders = await prisma.order.findMany({
    where,
    include: includeOrderDetails(),
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return NextResponse.json(orders.map(serializeOrder));
}

export async function POST(request) {
  const user = await getCurrentUser();
  const businessState = await ensureBusinessDayState();
  const body = await request.json();
  const braceletNo = String(body.braceletNo || "").trim();
  const customerPhone = String(body.customerPhone || "").trim();
  const childNames = (body.childNames || []).map((name) => String(name || "").trim()).filter(Boolean);
  const items = Array.isArray(body.items) ? body.items : [];

  if (!user) {
    return NextResponse.json({ success: false, error: "Login required" }, { status: 401 });
  }

  if (!businessState.isOpen) {
    return NextResponse.json({ success: false, error: businessState.message }, { status: 400 });
  }

  if (!validateBracelet(braceletNo)) {
    return NextResponse.json({ success: false, error: "Bracelet must be 6 digits and start with 0, 1, 2, or 3" }, { status: 400 });
  }

  if (!childNames.length) {
    return NextResponse.json({ success: false, error: "Child name is required" }, { status: 400 });
  }

  if (!body.dataEmployeeId) {
    return NextResponse.json({ success: false, error: "Employee is required" }, { status: 400 });
  }

  if (!items.length) {
    return NextResponse.json({ success: false, error: "Please select at least one product" }, { status: 400 });
  }

  const products = await prisma.product.findMany({
    where: { id: { in: items.map((item) => item.productId) } },
  });
  const productMap = new Map(products.map((product) => [product.id, product]));
  const orderItems = [];
  let total = 0;

  items.forEach((item) => {
    const product = productMap.get(item.productId);
    if (!product) return;

    const qty = Math.max(1, Number(item.qty) || 1);
    const lineTotal = product.price * qty;
    total += lineTotal;
    orderItems.push({
      productId: product.id,
      name: product.name,
      qty,
      price: product.price,
      total: lineTotal,
    });
  });

  const order = await prisma.order.create({
    data: {
      id: buildOrderId(),
      businessDate: businessState.businessDate,
      braceletNo,
      customerPhone: customerPhone || null,
      childNames: childNames.join(", "),
      childrenCount: childNames.length,
      total,
      paymentMethod: body.paymentMethod === "VISA" ? "VISA" : "CASH",
      cashierId: user.id,
      dataEmployeeId: body.dataEmployeeId,
      items: { create: orderItems },
    },
    include: includeOrderDetails(),
  });

  await writeAudit({
    action: "ORDER_CREATED",
    orderId: order.id,
    user,
    summary: `Created order ${order.id}`,
    metadata: { total, items: orderItems.length, paymentMethod: order.paymentMethod },
  });

  return NextResponse.json({ success: true, order: serializeOrder(order) });
}
