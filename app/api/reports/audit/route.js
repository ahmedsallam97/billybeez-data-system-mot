import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authorizeApi } from "@/lib/api-auth";

export async function GET(request) {
  const { error } = await authorizeApi("DASHBOARD_READ");
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const take = Math.min(200, Math.max(1, Number(searchParams.get("take")) || 50));
  const orderId = searchParams.get("orderId");

  const logs = await prisma.auditLog.findMany({
    where: orderId ? { orderReference: orderId } : {},
    include: { user: true },
    orderBy: { createdAt: "desc" },
    take,
  });

  return NextResponse.json({
    success: true,
    logs: logs.map((log) => ({
      id: log.id,
      action: log.action,
      orderId: log.orderReference || log.orderId,
      user: log.user?.name || "System",
      summary: log.summary,
      metadata: log.metadata ? JSON.parse(log.metadata) : null,
      createdAt: log.createdAt,
    })),
  });
}
