import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authorizeApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { releaseActiveBracelet } from "@/lib/active-bracelets";
import { ensureBusinessDayState } from "@/lib/business-day";
import { actorFields, upsertOrderRecord } from "@/lib/order-records";
import { findSerializedOrder, routeOrderId } from "@/lib/orders";
import { orderAuditSnapshot } from "@/lib/order-workflow";

export async function POST(request, { params }) {
  const { user, error } = await authorizeApi("ORDER_GEIDEA_REGISTER");
  if (error) return error;

  const { id: rawId } = await params;
  const id = routeOrderId(rawId);
  const body = await request.json().catch(() => ({}));
  const geideaEmployeeId = user.employee?.department === "KITCHEN" ? user.employeeId : body.geideaEmployeeId || body.restaurantEmployeeId || null;
  const canForceRegister = ["ADMIN", "MANAGER"].includes(user.role);

  await ensureBusinessDayState();

  const current = await prisma.order.findUnique({ where: { id } });

  if (!current) {
    return NextResponse.json({ success: false, error: "Order not found" }, { status: 404 });
  }

  if (!canForceRegister && (current.kitchenStatus !== "DELIVERED" || current.paymentStatus !== "PAID")) {
    return NextResponse.json({ success: false, error: "Order must be delivered and paid first" }, { status: 400 });
  }

  let geideaEmployee = null;

  if (geideaEmployeeId) {
    geideaEmployee = await prisma.employee.findFirst({
      where: {
        id: geideaEmployeeId,
        active: true,
        department: "KITCHEN",
      },
    });

    if (!geideaEmployee) {
      return NextResponse.json({ success: false, error: "Restaurant employee not found" }, { status: 400 });
    }
  }

  if (!canForceRegister && !geideaEmployee) {
    return NextResponse.json({ success: false, error: "Restaurant employee is required" }, { status: 400 });
  }

  const registeredAt = current.geideaRegisteredAt || new Date();
  const shouldArchive = current.customerLeft;
  const archivedAt = shouldArchive ? (current.archivedAt || registeredAt) : current.archivedAt;

  const updatedOrder = await prisma.$transaction(async (tx) => {
    const order = await tx.order.update({
      where: { id },
      data: {
        status: shouldArchive ? "ARCHIVED" : current.status,
        workflowState: shouldArchive ? "ARCHIVED" : "GEIDEA_REGISTERED",
        geideaRegisteredAt: registeredAt,
        geideaEmployeeId: geideaEmployee?.id || current.geideaEmployeeId,
        archivedAt,
      },
    });
    if (shouldArchive) {
      await releaseActiveBracelet(tx, id);
    }
    await upsertOrderRecord(tx, order, {
      geideaRegisteredAt: registeredAt,
      archivedAt,
      ...actorFields("geidea", user, geideaEmployee),
    });
    return order;
  });

  const auditTasks = [
    writeAudit({
      action: "ORDER_GEIDEA_REGISTERED",
      orderId: id,
      user,
      summary: "Registered order on system",
      metadata: {
        total: current.total,
        paymentMethod: current.paymentMethod,
        forcedByManager: canForceRegister,
        geideaEmployee: geideaEmployee?.name || null,
        registeredAt,
      },
      before: orderAuditSnapshot(current),
      after: orderAuditSnapshot(updatedOrder),
      reason: "Registered order on system",
    }),
  ];

  if (shouldArchive && !current.archivedAt) {
    auditTasks.push(writeAudit({
      action: "ORDER_ARCHIVED",
      orderId: id,
      user,
      summary: "Archived order",
      metadata: {
        total: current.total,
        paymentMethod: current.paymentMethod,
        geideaRegisteredAt: registeredAt,
        archivedAt,
        automatic: true,
      },
    }));
  }

  const [serializedOrder] = await Promise.all([
    findSerializedOrder(id),
    ...auditTasks,
  ]);

  return NextResponse.json({
    success: true,
    order: serializedOrder,
    geideaRegisteredAt: registeredAt,
    archivedAt,
    geideaEmployee: geideaEmployee?.name || user.employee?.name || user.name || "",
  });
}
