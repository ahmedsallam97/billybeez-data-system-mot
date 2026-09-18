import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authorizeApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { defaultAttendanceStatus } from "@/lib/operations/attendance";
import { attendanceStatusForLeaveType } from "@/lib/operations/leave";

const WORKING_CODES = ["AM", "PM", "BW", "MISSION"];
const ATTENDANCE_STATUSES = ["PRESENT", "LATE", "ABSENT", "MISSING", "EARLY_LEAVE", "LEAVE", "REPLACEMENT_LEAVE", "SICK_LEAVE", "HOLIDAY", "OFF", "UNEXPECTED_PRESENT"];

async function publishedAssignments(date) {
  const schedule = await prisma.opsSchedule.findFirst({ where: { status: "PUBLISHED", periodStart: { lte: date }, periodEnd: { gte: date } }, orderBy: { version: "desc" } });
  if (!schedule) return { schedule: null, assignments: [] };
  const [assignments, shiftRows, trips] = await Promise.all([
    prisma.opsScheduleAssignment.findMany({ where: { scheduleId: schedule.id, workDate: date, code: { in: WORKING_CODES }, employee: { department: { in: ["OPERATION", "CASHIER"] } } }, include: { employee: { select: { id: true, name: true, nameEn: true, hrisNumber: true, localEmployeeCode: true, department: true } } }, orderBy: { employee: { name: "asc" } } }),
    prisma.opsShiftDefinition.findMany({ where: { active: true }, select: { code: true, startTime: true, endTime: true } }),
    prisma.opsDailyTrip.findMany({ where: { branch: "MOT", workDate: date, status: { not: "CANCELLED" } }, select: { startTime: true } }),
  ]);
  const startsAtNine = trips.some((trip) => String(trip.startTime || "").startsWith("09:"));
  const shiftTimes = Object.fromEntries(shiftRows.map((shift) => [shift.code, shift.code === "AM" && startsAtNine ? { startTime: "09:00", endTime: "17:00" } : shift]));
  return { schedule, assignments, shiftTimes };
}

function validDate(value) { return /^\d{4}-\d{2}-\d{2}$/.test(String(value || "")); }

export async function GET(request) {
  const { error } = await authorizeApi("OPS_ATTENDANCE_READ");
  if (error) return error;
  const date = String(new URL(request.url).searchParams.get("date") || "");
  if (!validDate(date)) return NextResponse.json({ success: false, error: "Date must use YYYY-MM-DD" }, { status: 400 });
  const [{ schedule, assignments, shiftTimes = {} }, day] = await Promise.all([
    publishedAssignments(date),
    prisma.opsAttendanceDay.findFirst({ where: { workDate: date }, include: { records: { include: { employee: { select: { id: true, name: true, nameEn: true, hrisNumber: true, localEmployeeCode: true } } }, orderBy: { employee: { name: "asc" } } } }, orderBy: { version: "desc" } }),
  ]);
  return NextResponse.json({ success: true, date, schedule: schedule ? { id: schedule.id, version: schedule.version } : null, expected: assignments.map((item) => ({ assignmentId: item.id, employee: item.employee, code: item.code, expectedStart: shiftTimes[item.shiftCode]?.startTime || null, expectedEnd: shiftTimes[item.shiftCode]?.endTime || null })), day });
}

export async function POST(request) {
  const { user, error } = await authorizeApi("OPS_ATTENDANCE_MANAGE");
  if (error) return error;
  const body = await request.json();
  const date = String(body.date || "");
  if (!validDate(date)) return NextResponse.json({ success: false, error: "Invalid date" }, { status: 400 });
  if (body.action !== "open") return NextResponse.json({ success: false, error: "Unknown action" }, { status: 400 });
  const existing = await prisma.opsAttendanceDay.findFirst({ where: { workDate: date }, orderBy: { version: "desc" } });
  if (existing) return NextResponse.json({ success: true, day: existing, existing: true });
  const { schedule, assignments, shiftTimes = {} } = await publishedAssignments(date);
  if (!schedule) return NextResponse.json({ success: false, error: "A published schedule is required" }, { status: 409 });
  const leaveAllocations = await prisma.opsLeaveBookingAllocation.findMany({ where: { leaveDate: date, leaveBooking: { status: "APPROVED" } }, include: { leaveBooking: { select: { employeeId: true } } } });
  const leaveByEmployee = new Map(leaveAllocations.map((item) => [item.leaveBooking.employeeId, item.leaveType]));
  const day = await prisma.$transaction(async (tx) => {
    const created = await tx.opsAttendanceDay.create({ data: { workDate: date } });
    if (assignments.length) await tx.opsAttendanceRecord.createMany({ data: assignments.map((item) => ({ attendanceDayId: created.id, employeeId: item.employeeId, scheduleAssignmentId: item.id, expectedCode: item.code, expectedStart: shiftTimes[item.shiftCode]?.startTime || null, expectedEnd: shiftTimes[item.shiftCode]?.endTime || null, status: leaveByEmployee.has(item.employeeId) ? attendanceStatusForLeaveType(leaveByEmployee.get(item.employeeId)) : defaultAttendanceStatus(item.code), source: "SYSTEM" })) });
    return created;
  });
  await writeAudit({ action: "OPS_ATTENDANCE_OPENED", user, summary: `Opened attendance for ${date}`, metadata: { dayId: day.id, expectedEmployees: assignments.length, scheduleId: schedule.id } });
  return NextResponse.json({ success: true, day }, { status: 201 });
}

export async function PATCH(request) {
  const body = await request.json();
  const permission = body.action === "finalize" ? "OPS_ATTENDANCE_FINALIZE" : body.action === "correct" ? "OPS_ATTENDANCE_CORRECT" : "OPS_ATTENDANCE_MANAGE";
  const { user, error } = await authorizeApi(permission);
  if (error) return error;
  if (body.action === "finalize") {
    const day = await prisma.opsAttendanceDay.findUnique({ where: { id: String(body.dayId || "") }, include: { records: true } });
    if (!day) return NextResponse.json({ success: false, error: "Attendance day not found" }, { status: 404 });
    if (day.records.some((record) => record.status === "MISSING")) return NextResponse.json({ success: false, error: "Resolve all missing attendance before finalizing" }, { status: 409 });
    const updated = await prisma.opsAttendanceDay.update({ where: { id: day.id }, data: { status: "FINALIZED", finalizedAt: new Date(), finalizedBy: user.id } });
    await writeAudit({ action: "OPS_ATTENDANCE_FINALIZED", user, summary: `Finalized attendance for ${day.workDate}`, metadata: { dayId: day.id } });
    return NextResponse.json({ success: true, day: updated });
  }
  if (body.action === "applyExpectedDefaults") {
    const day = await prisma.opsAttendanceDay.findUnique({ where: { id: String(body.dayId || "") }, include: { records: true } });
    if (!day) return NextResponse.json({ success: false, error: "Attendance day not found" }, { status: 404 });
    if (day.status !== "OPEN") return NextResponse.json({ success: false, error: "Only open attendance can receive expected defaults" }, { status: 409 });
    const untouched = day.records.filter((record) => record.status === "MISSING" && record.source === "SYSTEM" && !record.actualIn && !record.actualOut);
    if (untouched.length !== day.records.length) return NextResponse.json({ success: false, error: "Defaults can only be applied before attendance is edited" }, { status: 409 });
    const leaveAllocations = await prisma.opsLeaveBookingAllocation.findMany({ where: { leaveDate: day.workDate, leaveBooking: { status: "APPROVED", employeeId: { in: day.records.map((record) => record.employeeId) } } }, include: { leaveBooking: { select: { employeeId: true } } } });
    const leaveByEmployee = new Map(leaveAllocations.map((item) => [item.leaveBooking.employeeId, item.leaveType]));
    await prisma.$transaction(day.records.map((record) => {
      const onLeave = leaveByEmployee.has(record.employeeId);
      return prisma.opsAttendanceRecord.update({ where: { id: record.id }, data: { status: onLeave ? attendanceStatusForLeaveType(leaveByEmployee.get(record.employeeId)) : "PRESENT", actualIn: onLeave ? null : record.expectedStart, actualOut: onLeave ? null : record.expectedEnd } });
    }));
    await writeAudit({ action: "OPS_ATTENDANCE_EXPECTED_DEFAULTS_APPLIED", user, summary: `Applied expected attendance defaults for ${day.workDate}`, metadata: { dayId: day.id, employeeCount: untouched.length } });
    return NextResponse.json({ success: true, updated: untouched.length });
  }
  if (body.action === "applyExpectedTimes") {
    const day = await prisma.opsAttendanceDay.findUnique({ where: { id: String(body.dayId || "") }, include: { records: true } });
    if (!day) return NextResponse.json({ success: false, error: "Attendance day not found" }, { status: 404 });
    if (day.status !== "OPEN") return NextResponse.json({ success: false, error: "Only open attendance can receive expected times" }, { status: 409 });
    const { assignments, shiftTimes = {} } = await publishedAssignments(day.workDate);
    const assignmentByEmployee = new Map(assignments.map((item) => [item.employeeId, item]));
    const eligible = day.records.filter((record) => record.source === "SYSTEM" && ["PRESENT", "MISSING"].includes(record.status));
    await prisma.$transaction(eligible.map((record) => {
      const assignment = assignmentByEmployee.get(record.employeeId);
      const expectedStart = shiftTimes[assignment?.shiftCode]?.startTime || record.expectedStart;
      const expectedEnd = shiftTimes[assignment?.shiftCode]?.endTime || record.expectedEnd;
      return prisma.opsAttendanceRecord.update({ where: { id: record.id }, data: { expectedStart, expectedEnd, actualIn: record.actualIn || expectedStart, actualOut: record.actualOut || expectedEnd } });
    }));
    await writeAudit({ action: "OPS_ATTENDANCE_EXPECTED_TIMES_APPLIED", user, summary: `Applied scheduled attendance times for ${day.workDate}`, metadata: { dayId: day.id, employeeCount: eligible.length } });
    return NextResponse.json({ success: true, updated: eligible.length });
  }
  const record = await prisma.opsAttendanceRecord.findUnique({ where: { id: String(body.recordId || "") }, include: { attendanceDay: true } });
  if (!record) return NextResponse.json({ success: false, error: "Attendance record not found" }, { status: 404 });
  if (!ATTENDANCE_STATUSES.includes(body.status)) return NextResponse.json({ success: false, error: "Invalid attendance status" }, { status: 400 });
  if (record.attendanceDay.status === "FINALIZED" && body.action !== "correct") return NextResponse.json({ success: false, error: "Finalized attendance requires a correction" }, { status: 409 });
  if (body.action === "correct" && !String(body.reason || "").trim()) return NextResponse.json({ success: false, error: "Correction reason is required" }, { status: 400 });
  const update = { status: body.status, actualIn: body.actualIn || null, actualOut: body.actualOut || null, lateMinutes: Math.max(0, Number(body.lateMinutes || 0)), earlyLeaveMinutes: Math.max(0, Number(body.earlyLeaveMinutes || 0)), note: String(body.note || "").trim() || null, source: body.action === "correct" ? "CORRECTION" : "MANUAL" };
  const result = await prisma.$transaction(async (tx) => {
    if (body.action === "correct") await tx.opsAttendanceCorrection.create({ data: { attendanceRecordId: record.id, oldSnapshotJson: JSON.stringify({ status: record.status, actualIn: record.actualIn, actualOut: record.actualOut, lateMinutes: record.lateMinutes, earlyLeaveMinutes: record.earlyLeaveMinutes, note: record.note }), newSnapshotJson: JSON.stringify(update), reason: String(body.reason).trim(), createdBy: user.id } });
    return tx.opsAttendanceRecord.update({ where: { id: record.id }, data: update });
  });
  await writeAudit({ action: body.action === "correct" ? "OPS_ATTENDANCE_CORRECTED" : "OPS_ATTENDANCE_UPDATED", user, summary: `Updated attendance for ${record.attendanceDay.workDate}`, metadata: { recordId: record.id, employeeId: record.employeeId, status: update.status }, reason: body.reason });
  return NextResponse.json({ success: true, record: result });
}
