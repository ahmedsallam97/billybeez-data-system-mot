import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authorizeApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { ensureDefaultSettings, getSetting } from "@/lib/settings";

const OPS_KEYS = [
  "DAILY_OPERATIONS_TEMPLATE_CONFIG", "OPS_MOTIVATION_PHRASES", "OPS_CASHIER_CONFIG", "OPS_BRANCH_CONFIG",
  "OPS_SCHEDULE_CODE_CONFIG", "OPS_ROTATION_RULES", "OPS_ATTENDANCE_RULES", "OPS_EVALUATION_RULES", "OPS_LEAVE_RULES", "OPS_PLANNING_CATALOGS",
  "RECOGNITION_ARTWORK_CONFIG",
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
    prisma.employee.findMany({ where: { active: true }, select: { id: true, name: true, nameEn: true, operationalName: true, gender: true, operationsTeamLeader: true, department: true, jobTitle: true, documents: { where: { documentType: "EMPLOYEE_PHOTO", status: "ACTIVE" }, select: { id: true }, orderBy: { uploadedAt: "desc" }, take: 1 } }, orderBy: { name: "asc" } }),
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
    let branchConfig = {}; try { branchConfig = JSON.parse(await getSetting("OPS_BRANCH_CONFIG", "{}")); } catch {}
    const defaultBranch = String(branchConfig.branchCode || "MOT");
    let record;
    if (body.action === "saveShift") {
      const code = String(body.code || "").trim().toUpperCase();
      if (!code || !body.startTime || !body.endTime) throw new Error("Shift code and times are required");
      record = await prisma.opsShiftDefinition.upsert({ where: { code }, update: { label: String(body.label || code), labelAr: String(body.labelAr || "") || null, startTime: String(body.startTime), endTime: String(body.endTime), colorKey: String(body.colorKey || code), active: body.active !== false }, create: { code, label: String(body.label || code), labelAr: String(body.labelAr || "") || null, startTime: String(body.startTime), endTime: String(body.endTime), colorKey: String(body.colorKey || code), active: true } });
    } else if (body.action === "savePosition") {
      const code = String(body.code || "").trim().toUpperCase();
      if (!code) throw new Error("Position code is required");
      const sortOrder = Number.isFinite(Number(body.sortOrder)) ? Number(body.sortOrder) : 0;
      record = await prisma.opsOperationalPosition.upsert({ where: { code }, update: { label: String(body.label || code), labelAr: String(body.labelAr || "") || null, critical: Boolean(body.critical), requiresQualification: body.requiresQualification !== false, active: body.active !== false, sortOrder }, create: { code, label: String(body.label || code), labelAr: String(body.labelAr || "") || null, critical: Boolean(body.critical), requiresQualification: body.requiresQualification !== false, sortOrder } });
    } else if (body.action === "saveRequirement") {
      const position = await prisma.opsOperationalPosition.findUnique({ where: { id: String(body.operationalPositionId || "") } });
      const shiftCode = String(body.shiftCode || "").trim().toUpperCase();
      const effectiveFrom = String(body.effectiveFrom || "2000-01-01");
      if (!position || !["AM", "BW", "PM"].includes(shiftCode)) throw new Error("Position and shift are required");
      const current = await prisma.opsPositionStaffingRequirement.findFirst({ where: { operationalPositionId: position.id, shiftCode, effectiveTo: null }, orderBy: { effectiveFrom: "desc" } });
      const data = { shiftCode, startTime: String(body.startTime || "") || null, endTime: String(body.endTime || "") || null, minEmployees: Math.max(0, Number(body.minEmployees || 0)), effectiveFrom, effectiveTo: String(body.effectiveTo || "") || null };
      record = current ? await prisma.opsPositionStaffingRequirement.update({ where: { id: current.id }, data }) : await prisma.opsPositionStaffingRequirement.create({ data: { ...data, operationalPositionId: position.id } });
    } else if (body.action === "savePartner") {
      const branch = String(body.branch || defaultBranch);
      const name = String(body.name || "").trim(); if (!name) throw new Error("Academy name is required");
      const values = { name, supervisorName: String(body.supervisorName || "").trim() || null, supervisorPhone: String(body.supervisorPhone || "").trim() || null, notes: String(body.notes || "").trim() || null, updatedBy: user.id };
      if (body.partnerId) {
        const current = await prisma.opsTripPartner.findFirst({ where: { id: String(body.partnerId), branch } });
        if (!current) throw new Error("Academy not found");
        record = await prisma.opsTripPartner.update({ where: { id: current.id }, data: values });
      } else record = await prisma.opsTripPartner.upsert({ where: { branch_name: { branch, name } }, update: values, create: { branch, ...values, createdBy: user.id } });
    } else if (body.action === "deletePartner") {
      const current = await prisma.opsTripPartner.findFirst({ where: { id: String(body.partnerId || ""), branch: String(body.branch || defaultBranch) } });
      if (!current) throw new Error("Academy not found");
      record = await prisma.opsTripPartner.delete({ where: { id: current.id } });
    } else if (body.action === "saveCustomer") {
      const branch = String(body.branch || defaultBranch);
      const phone = String(body.phone || "").trim(); const customerName = String(body.customerName || "").trim();
      if (!phone || !customerName) throw new Error("Customer name and phone are required");
      const values = { phone, customerName, childName: String(body.childName || "").trim() || null, notes: String(body.notes || "").trim() || null, updatedBy: user.id };
      if (body.customerId) {
        const current = await prisma.opsBirthdayCustomer.findFirst({ where: { id: String(body.customerId), branch } });
        if (!current) throw new Error("Customer not found");
        record = await prisma.opsBirthdayCustomer.update({ where: { id: current.id }, data: values });
      } else record = await prisma.opsBirthdayCustomer.upsert({ where: { branch_phone: { branch, phone } }, update: values, create: { branch, ...values, createdBy: user.id } });
    } else if (body.action === "deleteCustomer") {
      const current = await prisma.opsBirthdayCustomer.findFirst({ where: { id: String(body.customerId || ""), branch: String(body.branch || defaultBranch) } });
      if (!current) throw new Error("Customer not found");
      record = await prisma.opsBirthdayCustomer.delete({ where: { id: current.id } });
    } else if (body.action === "saveOperationalName") {
      record = await prisma.employee.update({ where: { id: String(body.employeeId || "") }, data: { operationalName: String(body.operationalName || "").trim() || null, gender: ["MALE", "FEMALE"].includes(body.gender) ? body.gender : null, operationsTeamLeader: body.operationsTeamLeader === true || body.operationsTeamLeader === "on" } });
    } else if (body.action === "saveNotice") {
      const title = String(body.title || "").trim(); const message = String(body.message || "").trim(); const effectiveFrom = String(body.effectiveFrom || "");
      if (!title || !message || !effectiveFrom) throw new Error("Notice title, message and start date are required");
      record = await prisma.opsOperationalNotice.create({ data: { branch: defaultBranch, title, message, priority: String(body.priority || "INFO"), effectiveFrom, effectiveTo: String(body.effectiveTo || "") || null, active: true, createdBy: user.id, updatedBy: user.id } });
    } else {
      throw new Error("Unknown settings action");
    }
    await writeAudit({ action: "OPS_CONFIGURATION_UPDATED", user, summary: `Updated operations configuration: ${body.action}`, metadata: { action: body.action, recordId: record.id } });
    return NextResponse.json({ success: true, record });
  } catch (operationError) {
    return NextResponse.json({ success: false, error: operationError.message }, { status: 400 });
  }
}
