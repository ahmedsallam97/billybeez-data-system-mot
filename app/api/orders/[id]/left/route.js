import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authorizeApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { ensureBusinessDayState } from "@/lib/business-day";
import { routeOrderId } from "@/lib/orders";
import { orderAuditSnapshot } from "@/lib/order-workflow";
import { loadWorkflowRules, validateCustomerExitAllowed } from "@/lib/workflow-rules";

export async function POST(request, { params }) {
  const { user, error } = await authorizeApi("ORDER_CUSTOMER_LEFT");
  if (error) return error;

  const { id: rawId } = await params;
  const id = routeOrderId(rawId);
  await ensureBusinessDayState();
  const body = await request.json().catch(() => ({}));
  const exitEmployeeId = String(user.employee?.department === "OPERATION" ? user.employeeId : body.exitEmployeeId || "");
  const nextCustomerLeft = body.customerLeft === false ? false : true;
  const managerPassword = String(body.managerPassword || "");

  const current = await prisma.order.findUnique({ where: { id } });

  if (!current) {
    return NextResponse.json({ success: false, error: "Order not found" }, { status: 404 });
  }

  const rules = await loadWorkflowRules();
  const exitError = nextCustomerLeft ? validateCustomerExitAllowed(current, rules) : null;
  if (exitError) {
    return NextResponse.json({ success: false, error: exitError.message }, { status: exitError.status });
  }

  let exitEmployee = null;

  if (exitEmployeeId) {
    exitEmployee = await prisma.employee.findFirst({
      where: {
        id: exitEmployeeId,
        active: true,
        department: "OPERATION",
      },
    });
  }

  if (!nextCustomerLeft && user.role === "CASHIER" && managerPassword !== rules.businessDayPassword) {
    return NextResponse.json({ success: false, error: "Manager password is required" }, { status: 403 });
  }

  if (nextCustomerLeft && user.role === "CASHIER" && !exitEmployee) {
    return NextResponse.json({ success: false, error: "Operation employee is required" }, { status: 400 });
  }

  const shouldArchive = nextCustomerLeft && current.geideaRegisteredAt;
  const restoredStatus = current.paymentStatus === "PAID" ? "PAID" : current.kitchenStatus === "DELIVERED" ? "DELIVERED" : "OPEN";
  const archivedAt = shouldArchive ? (current.archivedAt || new Date()) : null;

  const order = await prisma.order.update({
    where: { id },
    data: {
      customerLeft: nextCustomerLeft,
      exitEmployeeId: nextCustomerLeft ? (exitEmployee?.id || current.exitEmployeeId) : null,
      status: shouldArchive ? "ARCHIVED" : restoredStatus,
      workflowState: shouldArchive ? "ARCHIVED" : nextCustomerLeft ? "CUSTOMER_LEFT" : restoredStatus,
      archivedAt,
    },
  });

  await writeAudit({
    action: nextCustomerLeft ? "CUSTOMER_LEFT" : "CUSTOMER_RETURNED",
    orderId: id,
    user,
    summary: nextCustomerLeft ? "Customer left" : "Customer returned",
    metadata: {
      paymentStatus: order.paymentStatus,
      kitchenStatus: order.kitchenStatus,
      exitEmployee: exitEmployee?.name || null,
      managerPasswordUsed: !nextCustomerLeft && user.role === "CASHIER",
    },
    before: orderAuditSnapshot(current),
    after: orderAuditSnapshot(order),
    reason: nextCustomerLeft ? "Data team marked customer left" : "Customer returned with manager password",
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
        geideaRegisteredAt: current.geideaRegisteredAt,
        archivedAt,
        automatic: true,
        reason: "Customer left after Geidea registration",
      },
    });
  }

  return NextResponse.json({ success: true });
}
