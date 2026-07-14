import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authorizeApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { ensureBusinessDayState } from "@/lib/business-day";
import { includeOrderDetails, routeOrderId, serializeOrder } from "@/lib/orders";
import { orderAuditSnapshot, restoredStatus, workflowStateFromOrder } from "@/lib/order-workflow";

function splitChildNames(value) {
  return String(value || "")
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean);
}

function mergeChildNames(orders) {
  const seen = new Set();
  const names = [];

  orders.forEach((order) => {
    splitChildNames(order.childNames).forEach((name) => {
      const key = name.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      names.push(name);
    });
  });

  return names;
}

export async function POST(request, { params }) {
  const { user, error } = await authorizeApi("ORDER_MERGE");
  if (error) return error;

  const { id: rawId } = await params;
  const targetId = routeOrderId(rawId);
  await ensureBusinessDayState();

  const body = await request.json().catch(() => ({}));
  const sourceOrderIds = [...new Set((Array.isArray(body.sourceOrderIds) ? body.sourceOrderIds : [])
    .map((sourceId) => routeOrderId(sourceId))
    .filter((sourceId) => sourceId && sourceId !== targetId))];

  if (!sourceOrderIds.length) {
    return NextResponse.json({ success: false, error: "Source orders are required" }, { status: 400 });
  }

  const target = await prisma.order.findUnique({ where: { id: targetId }, include: { items: true } });
  if (!target) {
    return NextResponse.json({ success: false, error: "Target order not found" }, { status: 404 });
  }
  if (target.archivedAt) {
    return NextResponse.json({ success: false, error: "Target order must be active" }, { status: 400 });
  }

  const sourceOrders = await prisma.order.findMany({
    where: { id: { in: sourceOrderIds } },
    include: { items: true },
  });

  if (sourceOrders.length !== sourceOrderIds.length) {
    return NextResponse.json({ success: false, error: "One or more source orders were not found" }, { status: 404 });
  }

  const invalidSource = sourceOrders.find((order) => order.archivedAt || order.braceletNo !== target.braceletNo);
  if (invalidSource) {
    return NextResponse.json({ success: false, error: "Only active orders with the same bracelet can be merged" }, { status: 400 });
  }

  const mergedAt = new Date();
  const sourceTotal = sourceOrders.reduce((sum, order) => sum + Number(order.total || 0), 0);
  const mergedChildNames = mergeChildNames([target, ...sourceOrders]);
  const beforeTarget = orderAuditSnapshot(target);
  const beforeSources = sourceOrders.map(orderAuditSnapshot);

  const updatedTarget = await prisma.$transaction(async (tx) => {
    await tx.orderItem.updateMany({
      where: { orderId: { in: sourceOrderIds } },
      data: { orderId: targetId },
    });

    await tx.order.updateMany({
      where: { id: { in: sourceOrderIds } },
      data: {
        total: 0,
        status: "ARCHIVED",
        workflowState: "ARCHIVED",
        archivedAt: mergedAt,
      },
    });

    await tx.activeBraceletLock.deleteMany({
      where: {
        OR: [
          { orderId: { in: [targetId, ...sourceOrderIds] } },
          { braceletNo: target.braceletNo },
        ],
      },
    });

    await tx.activeBraceletLock.create({
      data: {
        braceletNo: target.braceletNo,
        orderId: targetId,
      },
    });

    return tx.order.update({
      where: { id: targetId },
      data: {
        total: { increment: sourceTotal },
        childNames: mergedChildNames.join(", "),
        childrenCount: mergedChildNames.length || target.childrenCount,
        allowOpenCharges: Boolean(target.allowOpenCharges || sourceOrders.some((order) => order.allowOpenCharges)),
        status: restoredStatus(target),
        workflowState: workflowStateFromOrder({ ...target, total: target.total + sourceTotal, geideaRegisteredAt: null, archivedAt: null }),
        geideaRegisteredAt: null,
        geideaEmployeeId: null,
        archivedAt: null,
      },
      include: includeOrderDetails(),
    });
  });

  await writeAudit({
    action: "ORDERS_MERGED",
    orderId: targetId,
    user,
    summary: `Merged orders into ${targetId}`,
    metadata: {
      targetId,
      sourceOrderIds,
      braceletNo: target.braceletNo,
      mergedTotal: sourceTotal,
      mergedChildNames,
      sourceSnapshots: beforeSources,
    },
    before: beforeTarget,
    after: orderAuditSnapshot(updatedTarget),
    reason: "Manager merged duplicate bracelet orders",
  });

  await Promise.all(sourceOrders.map((sourceOrder) => writeAudit({
    action: "ORDER_MERGED_SOURCE",
    orderId: sourceOrder.id,
    user,
    summary: `Merged order ${sourceOrder.id} into ${targetId}`,
    metadata: {
      targetId,
      braceletNo: target.braceletNo,
      movedItems: sourceOrder.items.length,
      movedTotal: sourceOrder.total,
    },
    before: orderAuditSnapshot(sourceOrder),
    after: {
      ...orderAuditSnapshot(sourceOrder),
      status: "ARCHIVED",
      workflowState: "ARCHIVED",
      total: 0,
      archivedAt: mergedAt,
    },
    reason: "Source order archived after duplicate merge",
  })));

  return NextResponse.json({ success: true, order: serializeOrder(updatedTarget) });
}
