import { withAccountAccess } from '@/lib/accounts/routes';
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authorizeApi } from "@/lib/api-auth";
import { readEmployeeFile } from "@/lib/employee-file-storage";
import { buildCompleteEmployeeFilePdf } from "@/lib/operations/employee-file-pdf";
import { buildEmployeeTimeline, FILE_SECTIONS } from "@/lib/operations/employee360";

async function GETHandler(request, { params }) {
  const { user, error } = await authorizeApi("OPS_EMPLOYEE_SENSITIVE_READ");
  if (error) return error;
  const { id } = await params;
  const url = new URL(request.url);
  const year = url.searchParams.has("year") ? Number(url.searchParams.get("year")) : new Date().getFullYear();
  const requestedEndDate = url.searchParams.get("endDate") || `${year}-12-31`;
  const language = url.searchParams.get("language") === "ar" ? "ar" : "en";
  const mode = url.searchParams.get("mode") || "FULL_RESTRICTED";
  const customSections = (url.searchParams.get("sections") || "").split(",").filter(Boolean);
  const allowedSections = new Set(Object.values(FILE_SECTIONS).flat());
  if (![...Object.keys(FILE_SECTIONS), "CUSTOM"].includes(mode) || (mode === "CUSTOM" && (!customSections.length || customSections.some(section => !allowedSections.has(section))))) return NextResponse.json({ success: false, error: "Invalid profile mode or sections" }, { status: 400 });
  const requestedSections=mode==='CUSTOM'?customSections:FILE_SECTIONS[mode];
  const required={'Documents':['files.view','files.download'],'Files':['files.view','files.download'],'Schedule & Attendance':['schedules.view','attendance.view'],'Leaves & Balances':['leave.view'],'Performance':['evaluations.view','appraisals.view'],'Training & Qualifications':['competencies.view'],'Recognition':['eom.view'],'Timeline':['files.view','schedules.view','attendance.view','evaluations.view','appraisals.view','competencies.view','eom.view','succession.view']};
  for(const section of requestedSections)for(const key of required[section]||[]){if(!user.permissions?.[key])return NextResponse.json({success:false,error:`Permission ${key} is required for ${section}`},{status:403});const scope=await require('@/lib/accounts/enforcement').resolveScope(require('@/lib/db').basePrisma,user,key);if(!scope.unrestricted&&!scope.employeeIds.includes(id))return NextResponse.json({success:false,error:`${section} is outside your access scope`},{status:403});}
  if (!Number.isInteger(year) || year < 2000 || year > 2200 || !/^\d{4}-\d{2}-\d{2}$/.test(requestedEndDate) || !requestedEndDate.startsWith(`${year}-`) || !Number.isFinite(Date.parse(`${requestedEndDate}T00:00:00Z`)) || new Date(`${requestedEndDate}T00:00:00Z`).toISOString().slice(0,10) !== requestedEndDate) return NextResponse.json({ success: false, error: "Invalid employee file period" }, { status: 400 });
  const today = new Date().toISOString().slice(0, 10);
  const endDate = year === Number(today.slice(0, 4)) && requestedEndDate > today ? today : requestedEndDate;
  const from = new Date(`${year}-01-01T00:00:00.000Z`); const to = new Date(`${endDate}T23:59:59.999Z`);
  const employee = await prisma.employee.findUnique({ where: { id }, include: {
    documents: { where: { status: "ACTIVE" }, orderBy: { uploadedAt: "asc" } },
    employmentPeriods: { include: { assignments: true }, orderBy: { startDate: "desc" } }, employmentEvents: { where: { effectiveDate: { lte: to } } },
    scheduleAssignments: { where: { workDate: { gte: `${year}-01-01`, lte: `${year}-12-31` }, schedule: { status: "PUBLISHED" } }, include: { schedule: true } }, attendanceRecords: { where: { attendanceDay: { workDate: { gte: `${year}-01-01`, lte: endDate } } }, include: { attendanceDay: true } },
    dailyEvaluations: { where: { dailyEvaluationDay: { evaluationDate: { gte: `${year}-01-01`, lte: endDate } } }, include: { dailyEvaluationDay: true } }, monthlyAppraisals: { where: { year } },
    eotmWins: { where: { year, status: "LOCKED" } },
    guestFeedback: { where: { feedbackDate: { gte: from, lte: to } }, orderBy: { feedbackDate: "desc" } },
    guidanceRecords: { where: { recordDate: { gte: from, lte: to } }, orderBy: { recordDate: "desc" } },
    incidents: { where: { incidentDate: { gte: from, lte: to } }, orderBy: { incidentDate: "desc" } },
    trainingRecords: { where: { OR: [{ completedDate: { gte: from, lte: to } }, { completedDate: null }] } }, qualifications: { include: { position: true } },
    leaveAccounts: { include: { transactions: { where: { status: "VALID" } } } },
  } });
  if (!employee) return NextResponse.json({ success: false, error: "Employee not found" }, { status: 404 });
  try {
    employee.operationalPositions = await prisma.opsOperationalPosition.findMany({ where: { active: true }, orderBy: { label: "asc" } });
    employee.timeline = buildEmployeeTimeline(employee, endDate).filter(item => new Date(item.date) <= to);
    const pdf = await buildCompleteEmployeeFilePdf({ employee, year, endDate, language, mode, customSections, includeAttachments: url.searchParams.get("attachments") !== "0", readAttachment: (document) => readEmployeeFile(document.storageKey) });
    const filename = `employee-${String(employee.hrisNumber || employee.localEmployeeCode || id).replace(/[^a-zA-Z0-9_-]/g, "_")}-${year}.pdf`;
    return new NextResponse(pdf, { headers: { "content-type": "application/pdf", "content-disposition": `${url.searchParams.get("inline") === "1" ? "inline" : "attachment"}; filename="${filename}"`, "cache-control": "private, no-store", "x-content-type-options": "nosniff" } });
  } catch (exportError) {
    return NextResponse.json({ success: false, error: exportError.message || "Could not create employee file PDF" }, { status: 500 });
  }
}

export const GET=withAccountAccess(GETHandler);
