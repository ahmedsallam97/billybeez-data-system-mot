import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authorizeApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { ensureDefaultSettings } from "@/lib/settings";

const editableKeys = new Set([
  "BUSINESS_DAY_PASSWORD",
  "BUSINESS_OPEN_HOUR",
  "BUSINESS_CLOSE_HOUR",
  "BRANCH_NAME",
  "BRANCH_TIN",
  "KITCHEN_PRINTER_NAME",
  "ARCHIVE_REQUIRES_CUSTOMER_LEFT",
  "UI_MESSAGE_CONFIG",
  "EMPLOYEE_NAME_STYLE_CONFIG",
]);

function serializeSetting(setting) {
  return {
    key: setting.key,
    value: setting.value,
    description: setting.description || "",
    updatedBy: setting.updatedBy || "",
    updatedAt: setting.updatedAt,
  };
}

export async function GET() {
  const { error } = await authorizeApi("SYSTEM_SETTING_READ");
  if (error) return error;

  await ensureDefaultSettings();
  const settings = await prisma.systemSetting.findMany({ orderBy: { key: "asc" } });

  return NextResponse.json({ success: true, settings: settings.map(serializeSetting) });
}

export async function PATCH(request) {
  const { user, error } = await authorizeApi("SYSTEM_SETTING_MANAGE");
  if (error) return error;

  await ensureDefaultSettings();
  const body = await request.json().catch(() => ({}));
  const key = String(body.key || "").trim();
  const value = String(body.value ?? "").trim();

  if (!editableKeys.has(key)) {
    return NextResponse.json({ success: false, error: "Setting cannot be edited" }, { status: 400 });
  }

  const before = await prisma.systemSetting.findUnique({ where: { key } });
  const setting = await prisma.systemSetting.update({
    where: { key },
    data: {
      value,
      updatedBy: user.id,
    },
  });

  await writeAudit({
    action: "SYSTEM_SETTING_UPDATED",
    user,
    summary: `Updated setting ${key}`,
    before: before ? serializeSetting(before) : null,
    after: serializeSetting(setting),
    reason: "Manager updated system setting",
  });

  return NextResponse.json({ success: true, setting: serializeSetting(setting) });
}
