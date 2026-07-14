import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authorizeApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { releaseActiveBracelet } from "@/lib/active-bracelets";
import { ensureBusinessDayState } from "@/lib/business-day";
import { actorFields, upsertOrderRecord } from "@/lib/order-records";
import { findSerializedOrder, routeOrderId } from "@/lib/orders";
import { orderAuditSnapshot } from "@/lib/order-workflow";
import { loadWorkflowRules, validatePaymentAllowed } from "@/lib/workflow-rules";

const supportedPaymentMethods = new Set(["CASH", "VISA", "KIDZAPP", "WAFFARHA", "E_INVOICE", "CUSTOM_1", "CUSTOM_2"]);

export async function POST(request, { params }) {
  const { user, error } = await authorizeApi("ORDER_PAY");
  if (error) return error;

  const { id: rawId } = await params;
  const id = routeOrderId(rawId);
  await ensureBusinessDayState();
  const body = await request.json();
  const requestedMethod = String(body.paymentMethod || "CASH").toUpperCase();
  const paymentMethod = supportedPaymentMethods.has(requestedMethod) ? requestedMethod : "CASH";
  const paymentEmployeeId = String(user.employee?.department === "KITCHEN" ? user.employeeId : body.paymentEmployeeId || "");
  const current = await prisma.order.findUnique({
    where: { id },
    include: {
      payments: true,
    },
  });

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

  const provider = await prisma.paymentProvider.findFirst({
    where: {
      OR: [
        { id: String(body.paymentProviderId || "").trim() },
        { method: paymentMethod },
      ],
      active: true,
    },
  });

  const paidSoFar = current.payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
  const amountToPay = Math.max(0, Number(current.total || 0) - paidSoFar);

  const order = await prisma.$transaction(async (tx) => {
    const paidAt = new Date();
    const shouldRegisterSystem = !isEmployeeOnlyUpdate && !current.geideaRegisteredAt;
    const systemRegisteredAt = shouldRegisterSystem ? paidAt : current.geideaRegisteredAt;
    const shouldArchive = shouldRegisterSystem && current.customerLeft;
    const updated = await tx.order.update({
      where: { id },
      data: isEmployeeOnlyUpdate
        ? { paymentEmployeeId: paymentEmployee?.id || current.paymentEmployeeId }
        : {
            paymentStatus: "PAID",
            paymentMethod,
            paymentProviderId: provider?.id || null,
            status: shouldArchive ? "ARCHIVED" : "PAID",
            workflowState: shouldArchive ? "ARCHIVED" : "GEIDEA_REGISTERED",
            paymentEmployeeId: paymentEmployee?.id || current.paymentEmployeeId,
            geideaRegisteredAt: systemRegisteredAt,
            geideaEmployeeId: paymentEmployee?.id || current.geideaEmployeeId,
            archivedAt: shouldArchive ? (current.archivedAt || paidAt) : current.archivedAt,
          },
    });

    if (!isEmployeeOnlyUpdate && amountToPay > 0) {
      await tx.orderPayment.create({
        data: {
          orderId: id,
          paymentProviderId: provider?.id || null,
          method: paymentMethod,
          amount: amountToPay,
          reference: String(body.reference || "").trim() || null,
        },
      });
    }

    if (shouldArchive) {
      await releaseActiveBracelet(tx, id);
    }

    return updated;
  });

  const paidAt = new Date();
  const recordFields = {
    paymentMethod: order.paymentMethod,
    ...actorFields("paid", user, paymentEmployee),
  };
  if (!isEmployeeOnlyUpdate) {
    recordFields.paidAt = paidAt;
    if (!current.geideaRegisteredAt) {
      recordFields.geideaRegisteredAt = paidAt;
      Object.assign(recordFields, actorFields("geidea", user, paymentEmployee));
    }
    if (order.archivedAt && !current.archivedAt) recordFields.archivedAt = order.archivedAt;
  }
  await upsertOrderRecord(prisma, order, recordFields);

  const [serializedOrder] = await Promise.all([
    findSerializedOrder(id),
    writeAudit({
      action: "ORDER_PAID",
      orderId: id,
      user,
      summary: `Marked paid by ${paymentMethod}`,
      metadata: {
        paymentMethod: order.paymentMethod,
        paymentProvider: provider?.name || null,
        total: order.total,
        paidSoFar,
        paidNow: isEmployeeOnlyUpdate ? 0 : amountToPay,
        paymentEmployee: paymentEmployee?.name || null,
        employeeOnlyUpdate: isEmployeeOnlyUpdate,
      },
      before: orderAuditSnapshot(current),
      after: orderAuditSnapshot(order),
      reason: isEmployeeOnlyUpdate ? "Updated payment receiver" : `Marked order paid by ${paymentMethod}`,
    }),
  ]);

  return NextResponse.json({ success: true, order: serializedOrder });
}
