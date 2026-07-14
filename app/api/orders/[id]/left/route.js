import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authorizeApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { assertActiveBraceletAvailable, claimActiveBracelet, isBraceletLockConflict, releaseActiveBracelet } from "@/lib/active-bracelets";
import { ensureBusinessDayState } from "@/lib/business-day";
import { actorFields, upsertOrderRecord } from "@/lib/order-records";
import { findSerializedOrder, routeOrderId } from "@/lib/orders";
import { orderAuditSnapshot } from "@/lib/order-workflow";
import { getSetting } from "@/lib/settings";
import { isDataDepartment } from "@/lib/employee-departments";
import { loadWorkflowRules, validateCustomerExitAllowed } from "@/lib/workflow-rules";

export async function POST(request, { params }) {
  const { user, error } = await authorizeApi("ORDER_CUSTOMER_LEFT");
  if (error) return error;

  const { id: rawId } = await params;
  const id = routeOrderId(rawId);
  await ensureBusinessDayState();
  const body = await request.json().catch(() => ({}));
  const departmentConfig = await getSetting("EMPLOYEE_DEPARTMENT_CONFIG", "");
  const userIsDataEmployee = user.employee ? isDataDepartment(user.employee.department, departmentConfig) : false;
  const exitEmployeeId = String(userIsDataEmployee ? user.employeeId : body.exitEmployeeId || "");
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
      },
    });
    if (exitEmployee && !isDataDepartment(exitEmployee.department, departmentConfig)) {
      exitEmployee = null;
    }
  }

  if (!nextCustomerLeft && ["CASHIER", "DATA"].includes(user.role) && managerPassword !== rules.businessDayPassword) {
    return NextResponse.json({ success: false, error: "Manager password is required" }, { status: 403 });
  }

  if (nextCustomerLeft && ["CASHIER", "DATA"].includes(user.role) && !exitEmployee) {
    return NextResponse.json({ success: false, error: "Data employee is required" }, { status: 400 });
  }

  const shouldArchive = nextCustomerLeft && current.geideaRegisteredAt;
  const restoredStatus = current.paymentStatus === "PAID" ? "PAID" : current.kitchenStatus === "DELIVERED" ? "DELIVERED" : "OPEN";
  const archivedAt = shouldArchive ? (current.archivedAt || new Date()) : null;
  const customerLeftAt = nextCustomerLeft ? (current.customerLeftAt || new Date()) : null;

  if (!shouldArchive && current.archivedAt) {
    const duplicateBraceletOrder = await assertActiveBraceletAvailable(prisma, current.braceletNo, id);
    if (duplicateBraceletOrder) {
      return NextResponse.json({ success: false, error: duplicateBraceletOrder.message }, { status: duplicateBraceletOrder.status });
    }
  }

  let order;
  try {
    order = await prisma.$transaction(async (tx) => {
      const updatedOrder = await tx.order.update({
        where: { id },
        data: {
          customerLeft: nextCustomerLeft,
          customerLeftAt,
          exitEmployeeId: nextCustomerLeft ? (exitEmployee?.id || current.exitEmployeeId) : null,
          status: shouldArchive ? "ARCHIVED" : restoredStatus,
          workflowState: shouldArchive ? "ARCHIVED" : nextCustomerLeft ? "CUSTOMER_LEFT" : restoredStatus,
          archivedAt,
        },
      });
      if (shouldArchive) {
        await releaseActiveBracelet(tx, id);
      } else if (current.archivedAt) {
        await claimActiveBracelet(tx, current.braceletNo, id);
      }
      await upsertOrderRecord(tx, updatedOrder, nextCustomerLeft ? {
        customerLeftAt,
        archivedAt,
        ...actorFields("customerLeft", user, exitEmployee),
      } : {
        customerLeftAt: null,
        customerLeftByUserId: null,
        customerLeftByUserName: null,
        customerLeftByEmployeeId: null,
        customerLeftByEmployeeName: null,
        archivedAt: null,
      });
      return updatedOrder;
    });
  } catch (error) {
    if (isBraceletLockConflict(error)) {
      return NextResponse.json({ success: false, error: `Bracelet ${current.braceletNo} already has an active order` }, { status: 409 });
    }
    throw error;
  }

  const auditTasks = [
    writeAudit({
      action: nextCustomerLeft ? "CUSTOMER_LEFT" : "CUSTOMER_RETURNED",
      orderId: id,
      user,
      summary: nextCustomerLeft ? "Customer left" : "Customer returned",
      metadata: {
        paymentStatus: order.paymentStatus,
        kitchenStatus: order.kitchenStatus,
        exitEmployee: exitEmployee?.name || null,
        customerLeftAt,
        managerPasswordUsed: !nextCustomerLeft && ["CASHIER", "DATA"].includes(user.role),
      },
      before: orderAuditSnapshot(current),
      after: orderAuditSnapshot(order),
      reason: nextCustomerLeft ? "Data team marked customer left" : "Customer returned with manager password",
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
        geideaRegisteredAt: current.geideaRegisteredAt,
        archivedAt,
        automatic: true,
        reason: "Customer left after system registration",
      },
    }));
  }

  const [serializedOrder] = await Promise.all([
    findSerializedOrder(id),
    ...auditTasks,
  ]);

  return NextResponse.json({ success: true, order: serializedOrder });
}
