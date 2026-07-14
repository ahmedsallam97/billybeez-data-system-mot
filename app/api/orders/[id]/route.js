import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authorizeApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { assertActiveBraceletAvailable, isBraceletLockConflict, moveActiveBracelet } from "@/lib/active-bracelets";
import { ensureBusinessDayState } from "@/lib/business-day";
import { includeOrderDetails, routeOrderId, serializeOrder, validateBracelet, validateCustomerPhone } from "@/lib/orders";
import { orderAuditSnapshot, restoredStatus } from "@/lib/order-workflow";
import { canUserEditPaidOrder } from "@/lib/workflow-rules";

function optionalDate(value) {
  if (!value) return null;
  const text = String(value).trim();
  const formatted = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (formatted) {
    const day = Number(formatted[1]);
    const month = Number(formatted[2]);
    const year = Number(formatted[3]);
    const parsed = new Date(Date.UTC(year, month - 1, day));
    return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day ? parsed : null;
  }
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
}

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
  const hasChildDetailPayload = ["childBirthDates", "childComments", "childOpenCharges"].some((key) => Array.isArray(body[key]));
  const allowOpenChargesProvided = Object.prototype.hasOwnProperty.call(body, "allowOpenCharges");
  const childBirthDates = Array.isArray(body.childBirthDates) ? body.childBirthDates : [];
  const childComments = Array.isArray(body.childComments) ? body.childComments : [];
  const childOpenCharges = Array.isArray(body.childOpenCharges) ? body.childOpenCharges : [];
  const allowOpenCharges = allowOpenChargesProvided ? Boolean(body.allowOpenCharges) : false;
  const customerNameProvided = Object.prototype.hasOwnProperty.call(body, "customerName");
  const commentsProvided = Object.prototype.hasOwnProperty.call(body, "comments");
  const customerName = String(body.customerName || "").trim().replace(/\s+/g, " ");
  const comments = String(body.comments || "").trim();

  if (!validateBracelet(braceletNo)) {
    return NextResponse.json({ success: false, error: "Bracelet must be 5 digits starting with 0, 6 digits starting with 0, 1, 2, or 3, or a 10 digit invoice serial" }, { status: 400 });
  }

  if (!validateCustomerPhone(customerPhone)) {
    return NextResponse.json({ success: false, error: "Phone must be 11 digits and start with 010, 011, or 012" }, { status: 400 });
  }

  if (!childNames.length) {
    return NextResponse.json({ success: false, error: "Child name is required" }, { status: 400 });
  }

  const order = await prisma.order.findUnique({
    where: { id },
    include: {
      device: true,
      children: {
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!order) {
    return NextResponse.json({ success: false, error: "Order not found" }, { status: 404 });
  }

  if (order.device?.type === "FRONT" && !customerPhone) {
    return NextResponse.json({ success: false, error: "Phone is required for front orders" }, { status: 400 });
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

  const unchangedDetails = braceletNo === order.braceletNo
    && customerPhone === String(order.customerPhone || "")
    && childNames.join(", ") === order.childNames
    && !hasChildDetailPayload
    && !customerNameProvided
    && !commentsProvided;
  const canAppendKitchenToFrontOrder = order.device?.type === "FRONT" && ["ADMIN", "MANAGER", "CASHIER", "DATA"].includes(user.role) && unchangedDetails;

  if ((order.paymentStatus === "PAID" || order.customerLeft) && !(await canUserEditPaidOrder(user)) && !canAppendKitchenToFrontOrder) {
    return NextResponse.json({ success: false, error: "Closed or paid orders can only be edited by manager" }, { status: 403 });
  }

  let updatedOrder;
  try {
    updatedOrder = await prisma.$transaction(async (tx) => {
      const existingChildren = order.children || [];
      const nextOrder = await tx.order.update({
        where: { id },
        data: {
          braceletNo,
          customerPhone: customerPhone || null,
          customerName: customerNameProvided ? customerName || null : order.customerName || null,
          childNames: childNames.join(", "),
          childrenCount: childNames.length,
          allowOpenCharges: allowOpenChargesProvided ? allowOpenCharges : order.allowOpenCharges,
          comments: commentsProvided ? comments || null : order.comments || null,
          status: restoredStatus(order),
          workflowState: restoredStatus(order),
          geideaRegisteredAt: null,
          geideaEmployeeId: null,
          archivedAt: null,
          children: {
            deleteMany: {},
            create: childNames.map((name, index) => ({
              customerId: order.customerId || null,
              name,
              birthDate: hasChildDetailPayload ? optionalDate(childBirthDates[index]) : existingChildren[index]?.birthDate || null,
              comments: hasChildDetailPayload ? String(childComments[index] || "").trim() || null : existingChildren[index]?.comments || null,
              allowOpenCharges: allowOpenChargesProvided ? allowOpenCharges : (hasChildDetailPayload ? Boolean(childOpenCharges[index]) : Boolean(existingChildren[index]?.allowOpenCharges)),
            })),
          },
        },
        include: includeOrderDetails(),
      });
      if (order.customerId) {
        await tx.customer.update({
          where: { id: order.customerId },
          data: {
            name: customerNameProvided ? customerName || childNames.join(", ") : order.customerName || childNames.join(", "),
            phone: customerPhone || null,
            comments: commentsProvided ? comments || null : order.comments || null,
          },
        });
      }
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
      customerName,
      comments,
    },
    before: orderAuditSnapshot(order),
    after: orderAuditSnapshot(updatedOrder),
    reason: "Order details edited, system/archive state reset",
  });

  return NextResponse.json({ success: true, order: serializeOrder(updatedOrder) });
}
