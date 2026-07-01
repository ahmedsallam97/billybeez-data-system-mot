import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authorizeApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { ensureBusinessDayState } from "@/lib/business-day";
import { includeOrderDetails, routeOrderId, serializeOrder, validateBracelet } from "@/lib/orders";

export async function GET(_request, { params }) {
  const { error } = await authorizeApi("ORDER_READ");
  if (error) return error;

  const { id: rawId } = await params;
  const id = routeOrderId(rawId);
  await ensureBusinessDayState();

  const order = await prisma.order.findUnique({
    where: { id },
    include: includeOrderDetails(),
  });

  if (!order) {
    return NextResponse.json({ success: false, error: "Order not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true, order: serializeOrder(order) });
}

export async function PATCH(request, { params }) {
  const { user, error } = await authorizeApi("ORDER_EDIT_ITEMS");
  if (error) return error;

  const { id: rawId } = await params;
  const id = routeOrderId(rawId);
  await ensureBusinessDayState();

  const body = await request.json();
  const braceletNo = String(body.braceletNo || "").trim();
  const customerPhone = String(body.customerPhone || "").trim();
  const childNames = (body.childNames || []).map((name) => String(name || "").trim()).filter(Boolean);

  if (!validateBracelet(braceletNo)) {
    return NextResponse.json({ success: false, error: "Bracelet must be 6 digits and start with 0, 1, 2, or 3" }, { status: 400 });
  }

  if (!childNames.length) {
    return NextResponse.json({ success: false, error: "Child name is required" }, { status: 400 });
  }

  const order = await prisma.order.findUnique({ where: { id } });

  if (!order) {
    return NextResponse.json({ success: false, error: "Order not found" }, { status: 404 });
  }

  if ((order.paymentStatus === "PAID" || order.customerLeft) && !["ADMIN", "MANAGER"].includes(user.role)) {
    return NextResponse.json({ success: false, error: "Closed or paid orders can only be edited by manager" }, { status: 403 });
  }

  const updatedOrder = await prisma.order.update({
    where: { id },
    data: {
      braceletNo,
      customerPhone: customerPhone || null,
      childNames: childNames.join(", "),
      childrenCount: childNames.length,
      status: order.paymentStatus === "PAID" ? "PAID" : "OPEN",
      geideaRegisteredAt: null,
      geideaEmployeeId: null,
      archivedAt: null,
    },
    include: includeOrderDetails(),
  });

  await writeAudit({
    action: "ORDER_DETAILS_UPDATED",
    orderId: id,
    user,
    summary: `Updated order details for ${id}`,
    metadata: {
      braceletNo,
      customerPhone,
      childNames,
    },
  });

  return NextResponse.json({ success: true, order: serializeOrder(updatedOrder) });
}
