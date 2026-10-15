import {withAccountAccess} from '@/lib/accounts/routes';
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authorizeApi } from "@/lib/api-auth";

async function GETHandler(request) {
  const { user, error } = await authorizeApi("DASHBOARD_READ");
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const take = Math.min(200, Math.max(1, Number(searchParams.get("take")) || 50));
  const orderId = searchParams.get("orderId");

  const scope=require('@/lib/accounts/context').context.getStore();
  let logs = await prisma.auditLog.findMany({
    where: scope ? {action:{startsWith:'OPS_'}} : orderId ? { orderReference: orderId } : {},
    include: { user: true },
    orderBy: { createdAt: "desc" },
    take,
  });
  if(scope&&!scope.unrestricted)logs=logs.filter(log=>{let meta;try{meta=JSON.parse(log.metadata||'{}');}catch{return false;}if(meta.employeeId)return scope.employeeIds.includes(meta.employeeId);if(meta.branch)return scope.branches.includes(meta.branch);return log.userId===user.id;});

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

export const GET=withAccountAccess(GETHandler,{legacyShared:true});
