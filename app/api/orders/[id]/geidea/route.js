import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authorizeApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { ensureBusinessDayState } from "@/lib/business-day";
import { routeOrderId } from "@/lib/orders";

export async function POST(request, { params }) {
  const { user, error } = await authorizeApi("ORDER_GEIDEA_REGISTER");
  if (error) return error;

  const { id: rawId } = await params;
  const id = routeOrderId(rawId);
  const body = await request.json().catch(() => ({}));
  const geideaEmployeeId = body.geideaEmployeeId || body.restaurantEmployeeId || null;
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
        department: "RESTAURANT",
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

  await prisma.order.update({
    where: { id },
    data: {
      status: shouldArchive ? "ARCHIVED" : current.status,
      geideaRegisteredAt: registeredAt,
      geideaEmployeeId: geideaEmployee?.id || current.geideaEmployeeId,
      archivedAt,
    },
  });

  await writeAudit({
    action: "ORDER_GEIDEA_REGISTERED",
    orderId: id,
    user,
    summary: "Registered order on Geidea",
    metadata: {
      total: current.total,
      paymentMethod: current.paymentMethod,
      forcedByManager: canForceRegister,
      geideaEmployee: geideaEmployee?.name || null,
      registeredAt,
    },
  });

  if (shouldArchive && !current.archivedAt) {
    await writeAudit({
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
    });
  }

  return NextResponse.json({ success: true, geideaRegisteredAt: registeredAt, archivedAt });
}
