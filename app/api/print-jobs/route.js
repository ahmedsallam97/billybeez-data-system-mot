import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authorizeApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { actorFields, upsertOrderRecord } from "@/lib/order-records";
import { includeOrderDetails, routeOrderId, serializeOrder } from "@/lib/orders";
import { nextSequence } from "@/lib/numbering";
import { nextWorkflowState, orderAuditSnapshot } from "@/lib/order-workflow";
import { filterKitchenTicketItems } from "@/lib/kitchen-ticket-rules";
import { getSetting } from "@/lib/settings";

function serializePrintJob(job) {
  return {
    id: job.id,
    orderId: job.orderId,
    type: job.type,
    status: job.status,
    ticketNumber: job.ticketNumber || null,
    printerName: job.printerName || "",
    error: job.error || "",
    printedAt: job.printedAt,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    payload: job.payload ? JSON.parse(job.payload) : null,
  };
}

export async function GET(request) {
  const { error } = await authorizeApi("PRINT_JOB_READ");
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status") || "PENDING";
  const type = searchParams.get("type") || "KITCHEN";

  const jobs = await prisma.printJob.findMany({
    where: { status, type },
    orderBy: { createdAt: "asc" },
    take: 50,
  });

  return NextResponse.json({ success: true, jobs: jobs.map(serializePrintJob) });
}

export async function POST(request) {
  const { user, error } = await authorizeApi("PRINT_JOB_CREATE");
  if (error) return error;

  const body = await request.json().catch(() => ({}));
  const orderId = routeOrderId(body.orderId);
  const type = body.type === "INVOICE" ? "INVOICE" : "KITCHEN";
  const printerName = String(body.printerName || "").trim() || null;

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: includeOrderDetails(),
  });

  if (!order) {
    return NextResponse.json({ success: false, error: "Order not found" }, { status: 404 });
  }

  const existingPending = await prisma.printJob.findFirst({
    where: { orderId, type, status: "PENDING" },
    orderBy: { createdAt: "desc" },
  });

  if (existingPending) {
    return NextResponse.json({
      success: true,
      job: serializePrintJob(existingPending),
      order: serializeOrder(order),
      reused: true,
    });
  }

  const serializedOrder = serializeOrder(order);
  delete serializedOrder.kitchenPrintJob;

  if (type === "KITCHEN") {
    const ticketRules = await getSetting("KITCHEN_TICKET_CATEGORIES", "");
    serializedOrder.items = filterKitchenTicketItems(serializedOrder.items, ticketRules).items;
  }

  const payload = {
    order: serializedOrder,
    requestedBy: {
      id: user.id,
      name: user.name,
      role: user.role,
    },
  };

  const job = await prisma.printJob.create({
    data: {
      orderId,
      type,
      ticketNumber: await nextSequence(type === "KITCHEN" ? "kitchenTicket" : "invoice"),
      printerName,
      payload: JSON.stringify(payload),
    },
  });

  const updatedOrder = await prisma.order.update({
    where: { id: orderId },
    data: {
      workflowState: nextWorkflowState(order, "PREPARING"),
    },
  });

  if (type === "KITCHEN") {
    await upsertOrderRecord(prisma, updatedOrder, {
      preparationStartedAt: job.createdAt,
      ...actorFields("preparationStarted", user, user.employee?.department === "RESTAURANT" ? user.employee : null),
    });
  }

  await writeAudit({
    action: "PRINT_JOB_CREATED",
    orderId,
    user,
    summary: `Created ${type.toLowerCase()} print job`,
    metadata: {
      printJobId: job.id,
      type,
      printerName,
    },
    before: orderAuditSnapshot(order),
    after: orderAuditSnapshot(updatedOrder),
    reason: "Restaurant started preparation and queued kitchen ticket",
  });

  const freshOrder = await prisma.order.findUnique({
    where: { id: orderId },
    include: includeOrderDetails(),
  });

  return NextResponse.json({ success: true, job: serializePrintJob(job), order: serializeOrder(freshOrder) });
}
