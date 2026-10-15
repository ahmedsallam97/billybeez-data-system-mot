import { withAccountAccess } from '@/lib/accounts/routes';
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authorizeApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { getSettingsRows, getSetting } from "@/lib/settings";
import { parseOperationsSetting } from "@/lib/operations/config-validation";
import { isOperationsWorkspaceSetting } from "@/lib/operations/settings-scope";
import { operationsBranch } from '@/lib/operations/business-access';
import {loadDistributions,saveDistributions} from '@/lib/operations/rotation-distributions';

async function GETHandler(request) {
  const { user, error } = await authorizeApi("OPS_EMPLOYEE_READ");
  if (error) return error;
  if (!user.permissions?.['settings.view']) return NextResponse.json({ success: false, error: "Permission denied" }, { status: 403 });
  const [settings, shifts, scheduleCodes, positions, criteriaVersion, partners, customers, employees, notices] = await Promise.all([
    getSettingsRows().then(rows => rows.filter(row => isOperationsWorkspaceSetting(row.key))),
    prisma.opsShiftDefinition.findMany({ orderBy: [{ sortOrder: "asc" }, { code: "asc" }] }),
    prisma.opsScheduleCode.findMany({ orderBy: [{ sortOrder: "asc" }, { code: "asc" }] }),
    prisma.opsOperationalPosition.findMany({ include: { staffingRequirements: { orderBy: { effectiveFrom: "desc" } } }, orderBy: [{ sortOrder: "asc" }, { code: "asc" }] }),
    prisma.opsEvaluationCriteriaVersion.findFirst({ where: { active: true }, include: { criteria: { include: { reasons: true }, orderBy: { sortOrder: "asc" } } }, orderBy: { createdAt: "desc" } }),
    prisma.opsTripPartner.findMany({ orderBy: { name: "asc" } }),
    prisma.opsBirthdayCustomer.findMany({ orderBy: { customerName: "asc" } }),
    prisma.employee.findMany({ where: { active: true }, select: { id: true, name: true, nameEn: true, operationalName: true, gender: true, operationsTeamLeader: true, department: true, jobTitle: true, documents: { where: { documentType: "EMPLOYEE_PHOTO", status: "ACTIVE" }, select: { id: true }, orderBy: { uploadedAt: "desc" }, take: 1 } }, orderBy: { name: "asc" } }),
    prisma.opsOperationalNotice.findMany({ orderBy: [{ active: "desc" }, { effectiveFrom: "desc" }], take: 50 }),
  ]);
  let parsedSettings;
  try { parsedSettings = Object.fromEntries(settings.map((item) => [item.key, parseOperationsSetting(item.key, item.value)])); }
  catch (configError) { return NextResponse.json({ success: false, error: configError.message }, { status: 422 }); }
  const defaultBranch=parsedSettings.OPS_BRANCH_CONFIG?.branchCode||'MOT';
  const branch=await operationsBranch(prisma,user,new URL(request.url).searchParams.get('branch')||defaultBranch);
  const distributions=await loadDistributions(prisma,{branch,positions,legacy:parsedSettings.OPS_ROTATION_RULES||{},defaultBranch});
  return NextResponse.json({
    success: true,
    settings: parsedSettings,
    shifts, scheduleCodes, positions, criteriaVersion, partners, customers, employees, notices,distributions,branch,
    branches:user.profile?.allBranches?[...new Set([defaultBranch,branch,...(await prisma.employee.findMany({select:{branch:true},distinct:['branch']})).map(e=>e.branch).filter(Boolean)])]:user.profile?.branches||[branch],
  });
}

async function POSTHandler(request) {
  const { user, error } = await authorizeApi("SYSTEM_SETTING_MANAGE");
  if (error) return error;
  const body = await request.json().catch(() => ({}));
  try {
    const branchConfig = JSON.parse(await getSetting("OPS_BRANCH_CONFIG", "{}"));
    const defaultBranch = String(branchConfig.branchCode || "MOT");
    let record;
    if(body.action==='saveDistributions'){
      const branch=await operationsBranch(prisma,user,body.branch||defaultBranch);
      const positions=await prisma.opsOperationalPosition.findMany({include:{staffingRequirements:true}});
      record=await saveDistributions(prisma,{user,branch,positions,value:body.value,expectedRevision:body.expectedRevision});
      return NextResponse.json({success:true,distributions:record});
    } else if (body.action === "saveShift") {
      const code = String(body.code || "").trim().toUpperCase();
      if (!code || !body.startTime || !body.endTime) throw new Error("Shift code and times are required");
      record = await prisma.opsShiftDefinition.upsert({ where: { code }, update: { label: String(body.label || code), labelAr: String(body.labelAr || "") || null, startTime: String(body.startTime), endTime: String(body.endTime), colorKey: String(body.colorKey || code), active: body.active !== false }, create: { code, label: String(body.label || code), labelAr: String(body.labelAr || "") || null, startTime: String(body.startTime), endTime: String(body.endTime), colorKey: String(body.colorKey || code), active: true } });
    } else if (body.action === "savePosition") {
      const code = String(body.code || "").trim().toUpperCase();
      if (!code) throw new Error("Position code is required");
      const sortOrder = Number.isFinite(Number(body.sortOrder)) ? Number(body.sortOrder) : 0;
      if(body.sortOrder!==undefined&&(!Number.isInteger(sortOrder)||sortOrder<0||sortOrder>1000))throw new Error('Location priority must be a whole number from 0 to 1000');
      const color = /^#[0-9a-f]{6}$/i.test(String(body.color || "")) ? String(body.color).toLowerCase() : null;
      const existing=await prisma.opsOperationalPosition.findUnique({where:{code}});
      record = await prisma.opsOperationalPosition.upsert({ where: { code }, update: { label: String(body.label || code), labelAr: String(body.labelAr || "") || null, color, requiresQualification: body.requiresQualification !== false, active: body.active !== false, ...(body.sortOrder!==undefined?{sortOrder}:{}),...(body.critical!==undefined?{critical:Boolean(body.critical)}:{}) }, create: { code, label: String(body.label || code), labelAr: String(body.labelAr || "") || null, color, requiresQualification: body.requiresQualification !== false,active:body.active!==false,sortOrder:body.sortOrder!==undefined?sortOrder:0,critical:Boolean(body.critical) } });
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
      const title = String(body.title || "").trim(); const titleAr = String(body.titleAr || "").trim(); const message = String(body.message || "").trim(); const messageAr = String(body.messageAr || "").trim(); const effectiveFrom = String(body.effectiveFrom || "");
      if (!title || !titleAr || !message || !messageAr || !effectiveFrom) throw new Error("English and Arabic notice text and start date are required");
      const values = { title, titleAr, message, messageAr, priority: String(body.priority || "INFO"), effectiveFrom, effectiveTo: String(body.effectiveTo || "") || null, startTime: String(body.startTime || "") || null, endTime: String(body.endTime || "") || null, active: body.active !== false, updatedBy: user.id };
      if (body.noticeId) {
        const current = await prisma.opsOperationalNotice.findFirst({ where: { id: String(body.noticeId), branch: defaultBranch } });
        if (!current) throw new Error("Operational notice not found");
        record = await prisma.opsOperationalNotice.update({ where: { id: current.id }, data: values });
      } else record = await prisma.opsOperationalNotice.create({ data: { branch: defaultBranch, ...values, createdBy: user.id } });
    } else if (body.action === "deleteNotice") {
      const current = await prisma.opsOperationalNotice.findFirst({ where: { id: String(body.noticeId || ""), branch: defaultBranch } });
      if (!current) throw new Error("Operational notice not found");
      record = await prisma.opsOperationalNotice.update({ where: { id: current.id }, data: { active: false, updatedBy: user.id } });
    } else if (body.action === "restoreNotice") {
      const current = await prisma.opsOperationalNotice.findFirst({ where: { id: String(body.noticeId || ""), branch: defaultBranch } });
      if (!current) throw new Error("Operational notice not found");
      record = await prisma.opsOperationalNotice.update({ where: { id: current.id }, data: { active: true, updatedBy: user.id } });
    } else {
      throw new Error("Unknown settings action");
    }
    await writeAudit({ action: "OPS_CONFIGURATION_UPDATED", user, summary: `Updated operations configuration: ${body.action}`, metadata: { action: body.action, recordId: record.id } });
    return NextResponse.json({ success: true, record });
  } catch (operationError) {
    return NextResponse.json({ success: false, error: operationError.message }, { status: operationError.status||400 });
  }
}

export const GET=withAccountAccess(GETHandler);
export const POST=withAccountAccess(POSTHandler);
