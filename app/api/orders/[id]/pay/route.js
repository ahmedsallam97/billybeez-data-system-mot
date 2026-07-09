import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authorizeApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { ensureBusinessDayState } from "@/lib/business-day";
import { actorFields, upsertOrderRecord } from "@/lib/order-records";
import { includeOrderDetails, routeOrderId, serializeOrder } from "@/lib/orders";
import { orderAuditSnapshot } from "@/lib/order-workflow";
import { loadWorkflowRules, validatePaymentAllowed } from "@/lib/workflow-rules";

export async function POST(request, { params }) {
  const { user, error } = await authorizeApi("ORDER_PAY");
  if (error) return error;

  const { id: rawId } = await params;
  const id = routeOrderId(rawId);
  await ensureBusinessDayState();
  const body = await request.json();
  const paymentMethod = body.paymentMethod === "VISA" ? "VISA" : "CASH";
  const paymentEmployeeId = String(user.employee?.department === "KITCHEN" ? user.employeeId : body.paymentEmployeeId || "");
  const current = await prisma.order.findUnique({ where: { id } });

  if (!current) {
    return NextResponse.json({ success: false, error: "Order not found" }, { status: 404 });
  }

  const rules = await loadWorkflowRules();
  const paymentError = validatePaymentAllowed(current, rules);
  const isEmployeeOnlyUpdate = current.paymentStatus === "PAID" && user.role === "KITCHEN";
  if (paymentError && !isEmployeeOnlyUpdate) {
    return NextResponse.json({ success: false, error: paymentError.message }, { status: paymentError.status });
  }

  let paymentEmployee = null;

  if (paymentEmployeeId) {
    paymentEmployee = await prisma.employee.findFirst({
      where: {
        id: paymentEmployeeId,
        active: true,
        department: "KITCHEN",
      },
    });
  }

  if (user.role === "KITCHEN" && !paymentEmployee) {
    return NextResponse.json({ success: false, error: "Restaurant employee is required" }, { status: 400 });
  }

  const order = await prisma.order.update({
    where: { id },
    data: isEmployeeOnlyUpdate
      ? { paymentEmployeeId: paymentEmployee?.id || current.paymentEmployeeId }
      : {
          paymentStatus: "PAID",
          paymentMethod,
          status: "PAID",
          workflowState: "PAID",
          paymentEmployeeId: paymentEmployee?.id || current.paymentEmployeeId,
        },
  });

  const recordFields = {
    paymentMethod: order.paymentMethod,
    ...actorFields("paid", user, paymentEmployee),
  };
  if (!isEmployeeOnlyUpdate) recordFields.paidAt = new Date();
  await upsertOrderRecord(prisma, order, recordFields);

  await writeAudit({
    action: "ORDER_PAID",
    orderId: id,
    user,
    summary: `Marked paid by ${paymentMethod}`,
    metadata: {
      paymentMethod: order.paymentMethod,
      total: order.total,
      paymentEmployee: paymentEmployee?.name || null,
      employeeOnlyUpdate: isEmployeeOnlyUpdate,
    },
    before: orderAuditSnapshot(current),
    after: orderAuditSnapshot(order),
    reason: isEmployeeOnlyUpdate ? "Updated payment receiver" : `Marked order paid by ${paymentMethod}`,
  });

  const freshOrder = await prisma.order.findUnique({
    where: { id },
    include: includeOrderDetails(),
  });
  const record = await prisma.orderTransactionRecord.findUnique({ where: { orderId: id } });

  return NextResponse.json({ success: true, order: serializeOrder(freshOrder, record) });
}
