import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authorizeApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { assertActiveBraceletAvailable, isBraceletLockConflict, moveActiveBracelet } from "@/lib/active-bracelets";
import { ensureBusinessDayState } from "@/lib/business-day";
import { includeOrderDetails, routeOrderId, serializeOrder, validateBracelet, validateCustomerPhone } from "@/lib/orders";
import { orderAuditSnapshot, restoredStatus } from "@/lib/order-workflow";
import { canUserEditPaidOrder } from "@/lib/workflow-rules";

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
    return NextResponse.json({ success: false, error: "Bracelet must be 5 digits starting with 0, or 6 digits starting with 0, 1, 2, or 3" }, { status: 400 });
  }

  if (!validateCustomerPhone(customerPhone)) {
    return NextResponse.json({ success: false, error: "Phone must be 11 digits and start with 010, 011, or 012" }, { status: 400 });
  }

  if (!childNames.length) {
    return NextResponse.json({ success: false, error: "Child name is required" }, { status: 400 });
  }

  const order = await prisma.order.findUnique({ where: { id } });

  if (!order) {
    return NextResponse.json({ success: false, error: "Order not found" }, { status: 404 });
  }

  if (braceletNo !== order.braceletNo) {
    const duplicateBraceletOrder = await assertActiveBraceletAvailable(prisma, braceletNo, id);

    if (duplicateBraceletOrder) {
      return NextResponse.json({
        success: false,
        error: duplicateBraceletOrder.message,
      }, { status: duplicateBraceletOrder.status });
    }
  }

  if ((order.paymentStatus === "PAID" || order.customerLeft) && !(await canUserEditPaidOrder(user))) {
    return NextResponse.json({ success: false, error: "Closed or paid orders can only be edited by manager" }, { status: 403 });
  }

  let updatedOrder;
  try {
    updatedOrder = await prisma.$transaction(async (tx) => {
      const nextOrder = await tx.order.update({
        where: { id },
        data: {
          braceletNo,
          customerPhone: customerPhone || null,
          childNames: childNames.join(", "),
          childrenCount: childNames.length,
          status: restoredStatus(order),
          workflowState: restoredStatus(order),
          geideaRegisteredAt: null,
          geideaEmployeeId: null,
          archivedAt: null,
        },
        include: includeOrderDetails(),
      });
      if (braceletNo !== order.braceletNo || order.archivedAt) {
        await moveActiveBracelet(tx, braceletNo, id);
      }
      return nextOrder;
    });
  } catch (error) {
    if (isBraceletLockConflict(error)) {
      return NextResponse.json({
        success: false,
        error: `Bracelet ${braceletNo} already has an active order`,
      }, { status: 409 });
    }
    throw error;
  }

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
    before: orderAuditSnapshot(order),
    after: orderAuditSnapshot(updatedOrder),
    reason: "Order details edited, Geidea/archive state reset",
  });

  return NextResponse.json({ success: true, order: serializeOrder(updatedOrder) });
}
