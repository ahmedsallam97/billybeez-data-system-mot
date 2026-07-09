import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authorizeApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { ensureBusinessDayState } from "@/lib/business-day";
import { actorFields, upsertOrderRecord } from "@/lib/order-records";
import { includeOrderDetails, routeOrderId, serializeOrder } from "@/lib/orders";
import { orderAuditSnapshot } from "@/lib/order-workflow";

export async function POST(request, { params }) {
  const { user, error } = await authorizeApi("ORDER_DELIVER");
  if (error) return error;

  const { id: rawId } = await params;
  const id = routeOrderId(rawId);
  const body = await request.json().catch(() => ({}));
  await ensureBusinessDayState();

  const order = await prisma.order.findUnique({ where: { id } });
  if (!order) {
    return NextResponse.json({ success: false, error: "Order not found" }, { status: 404 });
  }

  const deliveryEmployeeId = String(user.employee?.department === "RESTAURANT" ? user.employeeId : body.deliveryEmployeeId || body.restaurantEmployeeId || "");
  let deliveryEmployee = null;

  if (deliveryEmployeeId) {
    deliveryEmployee = await prisma.employee.findFirst({
      where: {
        id: deliveryEmployeeId,
        active: true,
        department: "RESTAURANT",
      },
    });
  }

  if (!deliveryEmployee && !["ADMIN", "MANAGER"].includes(user.role)) {
    return NextResponse.json({ success: false, error: "Restaurant employee is required" }, { status: 400 });
  }

  const deliveredAt = new Date();
  const updatedOrder = await prisma.$transaction(async (tx) => {
    const nextOrder = await tx.order.update({
      where: { id },
      data: {
        kitchenStatus: "DELIVERED",
        status: order.paymentStatus === "PAID" ? "PAID" : "DELIVERED",
        workflowState: order.paymentStatus === "PAID" ? "PAID" : "DELIVERED",
        deliveryEmployeeId: deliveryEmployee?.id || order.deliveryEmployeeId,
      },
    });

    await upsertOrderRecord(tx, nextOrder, {
      deliveredAt,
      ...actorFields("delivered", user, deliveryEmployee),
    });

    return nextOrder;
  });

  await prisma.printJob.updateMany({
    where: {
      orderId: id,
      type: "KITCHEN",
      status: "PENDING",
    },
    data: { status: "PRINTED", printedAt: deliveredAt },
  });

  await writeAudit({
    action: "ORDER_DELIVERED",
    orderId: id,
    user,
    summary: "Marked delivered",
    metadata: {
      previousKitchenStatus: order.kitchenStatus,
      paymentStatus: order.paymentStatus,
      deliveryEmployee: deliveryEmployee?.name || null,
    },
    before: orderAuditSnapshot(order),
    after: orderAuditSnapshot(updatedOrder),
    reason: "Restaurant marked order as delivered",
  });

  const freshOrder = await prisma.order.findUnique({
    where: { id },
    include: includeOrderDetails(),
  });
  const record = await prisma.orderTransactionRecord.findUnique({ where: { orderId: id } });

  return NextResponse.json({ success: true, order: serializeOrder(freshOrder, record) });
}
