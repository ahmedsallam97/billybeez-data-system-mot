import { withAccountAccess } from '@/lib/accounts/routes';
import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { authorizeApi } from "@/lib/api-auth";
import { prisma } from "@/lib/db";
import { clearSettingsCache, getSettingsRows } from "@/lib/settings";
import { parseOperationsSetting } from "@/lib/operations/config-validation";
import { isOperationsWorkspaceSetting } from "@/lib/operations/settings-scope";
import { normalizePlanningCatalogs } from "@/lib/operations/stock-catalog";

async function authorizeSettings(permission) {
  const result = await authorizeApi(permission);
  if (result.error) return result;
  // Legacy role configuration must not grant access to Operations settings.
  if (!result.user.permissions?.['settings.view'] && require('@/lib/accounts/context').context.getStore()?.permission?.startsWith('settings.')) {
    return { error: NextResponse.json({ success: false, error: "Permission denied" }, { status: 403 }) };
  }
  return result;
}

async function GETHandler(request) {
  const { error } = await authorizeSettings("OPS_EMPLOYEE_READ");
  if (error) return error;
  const keys = new Set((request.nextUrl.searchParams.get("keys") || "").split(",").map(key => key.trim()).filter(Boolean));
  const settings = (await getSettingsRows()).filter(row =>
    isOperationsWorkspaceSetting(row.key) && (!keys.size || keys.has(row.key)));
  return NextResponse.json({ success: true, settings });
}

async function PATCHHandler(request) {
  const { user, error } = await authorizeSettings("SYSTEM_SETTING_MANAGE");
  if (error) return error;
  const body = await request.json().catch(() => null);
  const key = typeof body?.key === "string" ? body.key.trim() : "";
  if (!isOperationsWorkspaceSetting(key)) {
    return NextResponse.json({ success: false, error: "Setting is outside Operations scope" }, { status: 400 });
  }
  if (key === "OPS_EVALUATION_RULES") {
    return NextResponse.json({ success: false, error: "Evaluation business rules must be saved and published through Performance & Reports settings." }, { status: 409 });
  }
  let value = typeof body.value === "string" ? body.value.trim() : "";
  if (value.length > (key === "OPS_DASHBOARD_UI_CONFIG" ? 20000 : 100000)) {
    return NextResponse.json({ success: false, error: "Operations settings are too large" }, { status: 400 });
  }
  try { const parsed = parseOperationsSetting(key, value); if (key === 'OPS_PLANNING_CATALOGS') value = JSON.stringify(normalizePlanningCatalogs(parsed)); }
  catch (validationError) {
    return NextResponse.json({ success: false, error: validationError.message }, { status: 400 });
  }
  let setting;
  try {
    setting = await prisma.$transaction(async tx => {
      const before = await tx.systemSetting.findUnique({ where: { key } });
      const after = await tx.systemSetting.upsert({ where: { key }, create: { key, value, updatedBy: user.id }, update: { value, updatedBy: user.id } });
      await tx.auditLog.create({ data: { action: "OPS_SETTING_UPDATED", userId: user.id, summary: "Updated Operations setting " + key, metadata: JSON.stringify({ before, after, reason: "Manager updated Operations setting" }) } });
      return after;
    });
  } catch { return NextResponse.json({ success: false, error: "Settings could not be saved. Please retry." }, { status: 500 }); }
  clearSettingsCache();
  if (key === "OPS_DASHBOARD_UI_CONFIG") { revalidatePath("/opmanager", "layout"); revalidatePath("/operations", "layout"); }
  return NextResponse.json({ success: true, setting });
}

export const GET=withAccountAccess(GETHandler);
export const PATCH=withAccountAccess(PATCHHandler);
