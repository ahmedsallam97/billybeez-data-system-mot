import { withAccountAccess } from '@/lib/accounts/routes';
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authorizeApi } from "@/lib/api-auth";
import {
  authorizePerformanceSettingsScope,
  changePerformanceSettings,
  getPerformanceSettingsState,
} from "@/lib/operations/performance-settings-service";

function errorResponse(error) {
  const status = Number(error?.status) || 400;
  return NextResponse.json({
    success: false,
    error: error?.message || "Performance settings request failed",
    code: error?.code || "PERFORMANCE_SETTINGS_ERROR",
    ...(error?.issues ? { issues: error.issues } : {}),
    ...(error?.details ? { details: error.details } : {}),
  }, { status });
}

async function GETHandler(request) {
  const { user, error } = await authorizeApi("OPS_EMPLOYEE_READ");
  if (error) return error;
  try {
    const url = new URL(request.url);
    const requestedScope = url.searchParams.get("scope") || url.searchParams.get("branch") || null;
    const date = url.searchParams.get("date") || undefined;
    const access = await authorizePerformanceSettingsScope(prisma, user, requestedScope);
    const state = await getPerformanceSettingsState(prisma, { scope: access.scope.branch || access.scope.type, date });
    if (access.visibleBranches) state.branches = state.branches.filter((branch) => access.visibleBranches.includes(branch));
    return NextResponse.json({ success: true, state });
  } catch (requestError) {
    return errorResponse(requestError);
  }
}

async function POSTHandler(request) {
  const { user, error } = await authorizeApi("SYSTEM_SETTING_MANAGE");
  if (error) return error;
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) return errorResponse(Object.assign(new Error("A JSON request body is required"), { code: "INVALID_BODY", status: 400 }));
  try {
    const result = await changePerformanceSettings(prisma, {
      user,
      action: body.action,
      scope: body.scope || body.branch || null,
      value: body.config ?? body.value,
      expectedRevision: body.expectedRevision,
      effectiveFrom: body.effectiveFrom,
      reason: body.reason,
    });
    return NextResponse.json({ success: true, ...result });
  } catch (requestError) {
    return errorResponse(requestError);
  }
}

export const GET=withAccountAccess(GETHandler);
export const POST=withAccountAccess(POSTHandler);
