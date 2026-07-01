import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authorizeApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { ensureDefaultSettings } from "@/lib/settings";

const editableKeys = new Set([
  "BUSINESS_DAY_PASSWORD",
  "BUSINESS_OPEN_HOUR",
  "BUSINESS_CLOSE_HOUR",
  "BUSINESS_MANUAL_CLOSE_ONLY",
  "BRANCH_ADDRESS",
  "BRANCH_NAME",
  "BRANCH_PHONE",
  "BRANCH_TIN",
  "COMPANY_NAME",
  "POS_NAME",
  "INVOICE_LOGO_URL",
  "INVOICE_PAPER_SIZE",
  "INVOICE_FOOTER_MESSAGE",
  "INVOICE_SHOW_TAX",
  "INVOICE_TAX_RATE",
  "INVOICE_CONTACT_NUMBER",
  "INVOICE_WEBSITE",
  "INVOICE_PRINTER_NAME",
  "KITCHEN_PRINTER_NAME",
  "PRINT_COPIES_INVOICE",
  "PRINT_COPIES_KITCHEN",
  "PRINT_AUTO_INVOICE",
  "PRINT_AUTO_KITCHEN",
  "KITCHEN_TICKET_CATEGORIES",
  "ARCHIVE_REQUIRES_CUSTOMER_LEFT",
  "WORKFLOW_ALLOW_PAID_ORDER_EDIT_ROLES",
  "WORKFLOW_ALLOW_PAYMENT_BEFORE_DELIVERY",
  "WORKFLOW_REQUIRE_GEIDEA_BEFORE_ARCHIVE",
  "WORKFLOW_ALLOW_EXIT_BEFORE_PAYMENT",
  "REPORT_DEFAULT_TAB",
  "REPORT_SHOW_CASH_VISA_GEIDEA",
  "REPORT_ENABLE_EXCEL_EXPORT",
  "REPORT_ENABLE_PDF_EXPORT",
  "AUDIT_RETENTION_DAYS",
  "AUDIT_EXPORT_ENABLED",
  "BACKUP_AUTO_DAILY",
  "BACKUP_RETENTION_DAYS",
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
