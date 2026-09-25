import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authorizeApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { readEmployeeFile } from "@/lib/employee-file-storage";
import { buildCompleteEmployeeFilePdf } from "@/lib/operations/employee-file-pdf";

export async function GET(request, { params }) {
  const { user, error } = await authorizeApi("OPS_EMPLOYEE_SENSITIVE_READ");
  if (error) return error;
  const { id } = await params;
  const url = new URL(request.url);
  const year = Number(url.searchParams.get("year")) || new Date().getFullYear();
  const endDate = url.searchParams.get("endDate") || `${year}-12-31`;
  if (year < 2000 || year > 2200 || !/^\d{4}-\d{2}-\d{2}$/.test(endDate) || !endDate.startsWith(`${year}-`)) return NextResponse.json({ success: false, error: "Invalid employee file period" }, { status: 400 });
  const from = new Date(`${year}-01-01T00:00:00.000Z`); const to = new Date(`${endDate}T23:59:59.999Z`);
  const employee = await prisma.employee.findUnique({ where: { id }, include: {
    documents: { where: { status: "ACTIVE" }, orderBy: { uploadedAt: "asc" } },
    scheduleAssignments: { where: { workDate: { gte: `${year}-01-01`, lte: endDate } } }, attendanceRecords: { where: { attendanceDay: { workDate: { gte: `${year}-01-01`, lte: endDate } } } },
    dailyEvaluations: { where: { dailyEvaluationDay: { evaluationDate: { gte: `${year}-01-01`, lte: endDate } } } }, monthlyAppraisals: { where: { year } },
    guestFeedback: { where: { feedbackDate: { gte: from, lte: to } }, orderBy: { feedbackDate: "desc" } },
    guidanceRecords: { where: { recordDate: { gte: from, lte: to } }, orderBy: { recordDate: "desc" } },
    incidents: { where: { incidentDate: { gte: from, lte: to } }, orderBy: { incidentDate: "desc" } },
    trainingRecords: { where: { OR: [{ completedDate: { gte: from, lte: to } }, { completedDate: null }] } }, qualifications: true,
  } });
  if (!employee) return NextResponse.json({ success: false, error: "Employee not found" }, { status: 404 });
  try {
    const pdf = await buildCompleteEmployeeFilePdf({ employee, year, endDate, readAttachment: (document) => readEmployeeFile(document.storageKey) });
    await writeAudit({ action: "OPS_EMPLOYEE_COMPLETE_FILE_EXPORTED", user, summary: `Exported complete employee file for ${employee.name}`, metadata: { employeeId: id, year, endDate, attachmentCount: employee.documents.length } });
    const filename = `employee-${String(employee.hrisNumber || employee.localEmployeeCode || id).replace(/[^a-zA-Z0-9_-]/g, "_")}-${year}.pdf`;
    return new NextResponse(pdf, { headers: { "content-type": "application/pdf", "content-disposition": `attachment; filename="${filename}"`, "cache-control": "private, no-store", "x-content-type-options": "nosniff" } });
  } catch (exportError) {
    return NextResponse.json({ success: false, error: exportError.message || "Could not create employee file PDF" }, { status: 500 });
  }
}
