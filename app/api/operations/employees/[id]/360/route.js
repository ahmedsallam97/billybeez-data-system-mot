import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authorizeApi } from "@/lib/api-auth";
import { serializeOperationsEmployee } from "@/lib/operations/employees";
import { writeAudit } from "@/lib/audit";
import { buildEmployeeTimeline, documentExpiryStatus } from "@/lib/operations/employee360";

export async function GET(_request, { params }) {
  const { error } = await authorizeApi("OPS_EMPLOYEE_SENSITIVE_READ");
  if (error) return error;
  const { id } = await params;
  const employee = await prisma.employee.findUnique({ where: { id }, include: {
    employmentPeriods: { orderBy: { startDate: "desc" }, include: { assignments: { orderBy: { effectiveFrom: "desc" } } } },
    employmentEvents: { orderBy: { effectiveDate: "desc" } }, documents: { orderBy: { uploadedAt: "desc" } },
    trainingRecords: { orderBy: { completedDate: "desc" } }, qualifications: { include: { position: true }, orderBy: { createdAt: "desc" } },
    scheduleAssignments: { include: { schedule: true }, orderBy: { workDate: "desc" }, take: 100 }, attendanceRecords: { include: { attendanceDay: true }, orderBy: { createdAt: "desc" }, take: 100 },
    leaveAccounts: { include: { transactions: { orderBy: { effectiveDate: "desc" } } } }, overtimeAccount: { include: { transactions: { orderBy: { transactionDate: "desc" } } } },
    dailyEvaluations: { include: { dailyEvaluationDay: true }, orderBy: { createdAt: "desc" }, take: 100 }, monthlyAppraisals: { orderBy: [{ year: "desc" }, { month: "desc" }] },
    eotmWins: { where: { status: "LOCKED" }, orderBy: [{ year: "desc" }, { month: "desc" }] }, successionCandidates: { include: { reviews: { orderBy: { reviewDate: "desc" } } } },
  } });
  if (!employee) return NextResponse.json({ success: false, error: "Employee not found" }, { status: 404 });
  const documents = employee.documents.map((item) => ({ ...item, expiryStatus: documentExpiryStatus(item.expiryDate) }));
  const timeline = buildEmployeeTimeline({ ...employee, documents });
  const operationalPositions = await prisma.opsOperationalPosition.findMany({ where: { active: true }, orderBy: { label: "asc" }, select: { id: true, label: true, code: true, requiresQualification: true } });
  return NextResponse.json({ success: true, employee: { ...serializeOperationsEmployee(employee, { includeNationalId: true }), documents, employmentPeriods: employee.employmentPeriods, employmentEvents: employee.employmentEvents, trainingRecords: employee.trainingRecords, qualifications: employee.qualifications, scheduleAssignments: employee.scheduleAssignments, attendanceRecords: employee.attendanceRecords, leaveAccounts: employee.leaveAccounts, overtimeTransactions: employee.overtimeAccount?.transactions || [], dailyEvaluations: employee.dailyEvaluations, monthlyAppraisals: employee.monthlyAppraisals, recognition: employee.eotmWins, succession: employee.successionCandidates, timeline, operationalPositions, photo: documents.find((item) => item.documentType === "EMPLOYEE_PHOTO" && item.status === "ACTIVE") || null } });
}

export async function POST(request, { params }) {
  const { user, error } = await authorizeApi("OPS_EMPLOYEE_MANAGE"); if (error) return error;
  const { id } = await params; const body = await request.json(); const employee = await prisma.employee.findUnique({ where: { id } }); if (!employee) return NextResponse.json({ success: false, error: "Employee not found" }, { status: 404 });
  try { if (body.action === "employmentEvent") { const fieldByEvent = { POSITION_CHANGE: "jobTitle", BRANCH_TRANSFER: "branch", SUPERVISOR_CHANGE: "supervisorId" }; const field = fieldByEvent[String(body.eventType)]; const newValue = String(body.newValue || "").trim(); if (!body.eventType || !body.effectiveDate || !newValue) throw new Error("Event type, effective date, and new value are required"); const event = await prisma.$transaction(async (tx) => { if (field && body.applyCurrent !== false) await tx.employee.update({ where: { id }, data: { [field]: newValue } }); return tx.employeeEmploymentEvent.create({ data: { employeeId: id, eventType: String(body.eventType), effectiveDate: new Date(String(body.effectiveDate)), previousValue: field ? (employee[field] || null) : (String(body.previousValue || "") || null), newValue, reason: String(body.reason || "") || null, createdBy: user.id } }); }); await writeAudit({ action: "OPS_EMPLOYEE_EMPLOYMENT_EVENT", user, summary: `Recorded ${event.eventType} for ${employee.name}`, metadata: { employeeId: id, eventId: event.id, appliedCurrent: Boolean(field && body.applyCurrent !== false) }, reason: event.reason || undefined }); return NextResponse.json({ success: true, event }); }
    if (body.action === "training") { if (!String(body.name || "").trim()) throw new Error("Training name is required"); const record = await prisma.employeeTrainingRecord.create({ data: { employeeId: id, name: String(body.name).trim(), category: String(body.category || "") || null, completedDate: body.completedDate ? new Date(body.completedDate) : null, expiryDate: body.expiryDate ? new Date(body.expiryDate) : null, status: String(body.status || "COMPLETED"), provider: String(body.provider || "") || null, notes: String(body.notes || "") || null, createdBy: user.id } }); await writeAudit({ action: "OPS_EMPLOYEE_TRAINING_RECORDED", user, summary: `Recorded training for ${employee.name}`, metadata: { employeeId: id, trainingId: record.id } }); return NextResponse.json({ success: true, record }); }
    if (body.action === "qualification") { if (!body.operationalPositionId) throw new Error("Operational position is required"); const item = await prisma.employeeQualification.upsert({ where: { employeeId_operationalPositionId: { employeeId: id, operationalPositionId: String(body.operationalPositionId) } }, update: { status: String(body.status || "NOT_QUALIFIED"), effectiveDate: body.effectiveDate ? new Date(body.effectiveDate) : null, expiryDate: body.expiryDate ? new Date(body.expiryDate) : null, notes: String(body.notes || "") || null }, create: { employeeId: id, operationalPositionId: String(body.operationalPositionId), status: String(body.status || "NOT_QUALIFIED"), effectiveDate: body.effectiveDate ? new Date(body.effectiveDate) : null, expiryDate: body.expiryDate ? new Date(body.expiryDate) : null, notes: String(body.notes || "") || null, createdBy: user.id } }); await writeAudit({ action: "OPS_EMPLOYEE_QUALIFICATION_UPDATED", user, summary: `Updated qualification for ${employee.name}`, metadata: { employeeId: id, qualificationId: item.id } }); return NextResponse.json({ success: true, qualification: item }); }
    throw new Error("Unknown Employee 360 action"); } catch (e) { return NextResponse.json({ success: false, error: e.message }, { status: 400 }); }
}
