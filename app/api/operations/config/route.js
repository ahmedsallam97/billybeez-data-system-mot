import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authorizeApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { ensureDefaultSettings } from "@/lib/settings";

const OPS_KEYS = [
  "DAILY_OPERATIONS_TEMPLATE_CONFIG", "OPS_MOTIVATION_PHRASES", "OPS_CASHIER_CONFIG", "OPS_BRANCH_CONFIG",
  "OPS_SCHEDULE_CODE_CONFIG", "OPS_ROTATION_RULES", "OPS_ATTENDANCE_RULES", "OPS_EVALUATION_RULES", "OPS_LEAVE_RULES", "OPS_PLANNING_CATALOGS",
];

export async function GET() {
  const { error } = await authorizeApi("SYSTEM_SETTING_READ");
  if (error) return error;
  await ensureDefaultSettings();
  const [settings, shifts, scheduleCodes, positions, criteriaVersion, partners, customers, employees, notices] = await Promise.all([
    prisma.systemSetting.findMany({ where: { key: { in: OPS_KEYS } }, orderBy: { key: "asc" } }),
    prisma.opsShiftDefinition.findMany({ orderBy: [{ sortOrder: "asc" }, { code: "asc" }] }),
    prisma.opsScheduleCode.findMany({ orderBy: [{ sortOrder: "asc" }, { code: "asc" }] }),
    prisma.opsOperationalPosition.findMany({ include: { staffingRequirements: { orderBy: { effectiveFrom: "desc" } } }, orderBy: [{ sortOrder: "asc" }, { code: "asc" }] }),
    prisma.opsEvaluationCriteriaVersion.findFirst({ where: { active: true }, include: { criteria: { include: { reasons: true }, orderBy: { sortOrder: "asc" } } }, orderBy: { createdAt: "desc" } }),
    prisma.opsTripPartner.findMany({ orderBy: { name: "asc" } }),
    prisma.opsBirthdayCustomer.findMany({ orderBy: { customerName: "asc" } }),
    prisma.employee.findMany({ where: { active: true }, select: { id: true, name: true, operationalName: true, gender: true, operationsTeamLeader: true, department: true, jobTitle: true }, orderBy: { name: "asc" } }),
    prisma.opsOperationalNotice.findMany({ orderBy: [{ active: "desc" }, { effectiveFrom: "desc" }], take: 50 }),
  ]);
  return NextResponse.json({
    success: true,
    settings: Object.fromEntries(settings.map((item) => { try { return [item.key, JSON.parse(item.value)]; } catch { return [item.key, item.value]; } })),
    shifts, scheduleCodes, positions, criteriaVersion, partners, customers, employees, notices,
  });
}

export async function POST(request) {
  const { user, error } = await authorizeApi("SYSTEM_SETTING_MANAGE");
  if (error) return error;
  const body = await request.json().catch(() => ({}));
  try {
    let record;
    if (body.action === "saveShift") {
      const code = String(body.code || "").trim().toUpperCase();
      if (!code || !body.startTime || !body.endTime) throw new Error("Shift code and times are required");
      record = await prisma.opsShiftDefinition.upsert({ where: { code }, update: { label: String(body.label || code), labelAr: String(body.labelAr || "") || null, startTime: String(body.startTime), endTime: String(body.endTime), colorKey: String(body.colorKey || code), active: body.active !== false }, create: { code, label: String(body.label || code), labelAr: String(body.labelAr || "") || null, startTime: String(body.startTime), endTime: String(body.endTime), colorKey: String(body.colorKey || code), active: true } });
    } else if (body.action === "savePosition") {
      const code = String(body.code || "").trim().toUpperCase();
      if (!code) throw new Error("Position code is required");
      record = await prisma.opsOperationalPosition.upsert({ where: { code }, update: { label: String(body.label || code), labelAr: String(body.labelAr || "") || null, critical: Boolean(body.critical), requiresQualification: body.requiresQualification !== false, active: body.active !== false }, create: { code, label: String(body.label || code), labelAr: String(body.labelAr || "") || null, critical: Boolean(body.critical), requiresQualification: body.requiresQualification !== false } });
    } else if (body.action === "savePartner") {
      const name = String(body.name || "").trim(); if (!name) throw new Error("Academy name is required");
      record = await prisma.opsTripPartner.upsert({ where: { branch_name: { branch: "MOT", name } }, update: { supervisorName: String(body.supervisorName || "") || null, supervisorPhone: String(body.supervisorPhone || "") || null, notes: String(body.notes || "") || null, updatedBy: user.id }, create: { branch: "MOT", name, supervisorName: String(body.supervisorName || "") || null, supervisorPhone: String(body.supervisorPhone || "") || null, notes: String(body.notes || "") || null, createdBy: user.id, updatedBy: user.id } });
    } else if (body.action === "saveCustomer") {
      const phone = String(body.phone || "").trim(); const customerName = String(body.customerName || "").trim();
      if (!phone || !customerName) throw new Error("Customer name and phone are required");
      record = await prisma.opsBirthdayCustomer.upsert({ where: { branch_phone: { branch: "MOT", phone } }, update: { customerName, childName: String(body.childName || "") || null, notes: String(body.notes || "") || null, updatedBy: user.id }, create: { branch: "MOT", phone, customerName, childName: String(body.childName || "") || null, notes: String(body.notes || "") || null, createdBy: user.id, updatedBy: user.id } });
    } else if (body.action === "saveOperationalName") {
      record = await prisma.employee.update({ where: { id: String(body.employeeId || "") }, data: { operationalName: String(body.operationalName || "").trim() || null, gender: ["MALE", "FEMALE"].includes(body.gender) ? body.gender : null, operationsTeamLeader: body.operationsTeamLeader === true || body.operationsTeamLeader === "on" } });
    } else if (body.action === "saveNotice") {
      const title = String(body.title || "").trim(); const message = String(body.message || "").trim(); const effectiveFrom = String(body.effectiveFrom || "");
      if (!title || !message || !effectiveFrom) throw new Error("Notice title, message and start date are required");
      record = await prisma.opsOperationalNotice.create({ data: { branch: "MOT", title, message, priority: String(body.priority || "INFO"), effectiveFrom, effectiveTo: String(body.effectiveTo || "") || null, active: true, createdBy: user.id, updatedBy: user.id } });
    } else {
      throw new Error("Unknown settings action");
    }
    await writeAudit({ action: "OPS_CONFIGURATION_UPDATED", user, summary: `Updated operations configuration: ${body.action}`, metadata: { action: body.action, recordId: record.id } });
    return NextResponse.json({ success: true, record });
  } catch (operationError) {
    return NextResponse.json({ success: false, error: operationError.message }, { status: 400 });
  }
}
