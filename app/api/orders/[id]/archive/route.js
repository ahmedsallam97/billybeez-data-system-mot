import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authorizeApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { releaseActiveBracelet } from "@/lib/active-bracelets";
import { ensureBusinessDayState } from "@/lib/business-day";
import { routeOrderId } from "@/lib/orders";
import { orderAuditSnapshot } from "@/lib/order-workflow";
import { loadWorkflowRules, validateArchiveAllowed } from "@/lib/workflow-rules";

export async function POST(_request, { params }) {
  const { user, error } = await authorizeApi("ORDER_ARCHIVE");
  if (error) return error;

  const { id: rawId } = await params;
  const id = routeOrderId(rawId);
  await ensureBusinessDayState();

  const current = await prisma.order.findUnique({ where: { id } });

  if (!current) {
    return NextResponse.json({ success: false, error: "Order not found" }, { status: 404 });
  }

  const archiveError = validateArchiveAllowed(current, await loadWorkflowRules());
  if (archiveError) {
    return NextResponse.json({ success: false, error: archiveError.message }, { status: archiveError.status });
  }

  const updatedOrder = await prisma.$transaction(async (tx) => {
    const order = await tx.order.update({
      where: { id },
      data: {
        status: "ARCHIVED",
        workflowState: "ARCHIVED",
        archivedAt: new Date(),
      },
    });
    await releaseActiveBracelet(tx, id);
    return order;
  });

  await writeAudit({
    action: "ORDER_ARCHIVED",
    orderId: id,
    user,
    summary: "Archived order",
    metadata: {
      total: current.total,
      paymentMethod: current.paymentMethod,
      geideaRegisteredAt: current.geideaRegisteredAt,
    },
    before: orderAuditSnapshot(current),
    after: orderAuditSnapshot(updatedOrder),
    reason: "Manual archive after Geidea and customer left",
  });

  return NextResponse.json({ success: true });
}
