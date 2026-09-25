import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authorizeApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { defaultAttendanceStatus } from "@/lib/operations/attendance";
import { attendanceStatusForLeaveType } from "@/lib/operations/leave";
import { getSetting } from "@/lib/settings";

const WORKING_CODES = ["AM", "PM", "BW", "MISSION"];
const ATTENDANCE_STATUSES = ["PRESENT", "LATE", "ABSENT", "MISSING", "EARLY_LEAVE", "LEAVE", "REPLACEMENT_LEAVE", "SICK_LEAVE", "HOLIDAY", "OFF", "UNEXPECTED_PRESENT"];

async function publishedAssignments(date) {
  const parse = (value, fallback = {}) => { try { return JSON.parse(value); } catch { return fallback; } };
  const [branchConfig, rotationRules] = await Promise.all([getSetting("OPS_BRANCH_CONFIG", "{}").then((value) => parse(value)), getSetting("OPS_ROTATION_RULES", "{}").then((value) => parse(value))]);
  const branch = branchConfig.branchCode || "MOT"; const earlyRule = rotationRules.earlyTripRule || {};
  const schedule = await prisma.opsSchedule.findFirst({ where: { status: "PUBLISHED", periodStart: { lte: date }, periodEnd: { gte: date } }, orderBy: { version: "desc" } });
  if (!schedule) return { schedule: null, assignments: [] };
  const [assignments, shiftRows, trips] = await Promise.all([
    prisma.opsScheduleAssignment.findMany({ where: { scheduleId: schedule.id, workDate: date, code: { in: WORKING_CODES }, employee: { department: { in: ["OPERATION", "CASHIER"] } } }, include: { employee: { select: { id: true, name: true, nameEn: true, hrisNumber: true, localEmployeeCode: true, department: true } } }, orderBy: { employee: { name: "asc" } } }),
    prisma.opsShiftDefinition.findMany({ where: { active: true }, select: { code: true, startTime: true, endTime: true } }),
    prisma.opsDailyTrip.findMany({ where: { branch, workDate: date, status: { not: "CANCELLED" } }, select: { startTime: true } }),
  ]);
  const earlyShift = earlyRule.shiftCode || "AM"; const earlyTrigger = earlyRule.triggerTime || "09:00";
  const hasEarlyTrip = earlyRule.enabled !== false && trips.some((trip) => String(trip.startTime || "").startsWith(earlyTrigger.slice(0, 3)));
  const shiftTimes = Object.fromEntries(shiftRows.map((shift) => [shift.code, shift.code === earlyShift && hasEarlyTrip ? { startTime: earlyRule.startTime || "09:00", endTime: earlyRule.endTime || "17:00" } : shift]));
  return { schedule, assignments, shiftTimes };
}

function validDate(value) { return /^\d{4}-\d{2}-\d{2}$/.test(String(value || "")); }

function timeMinutes(value) {
  const match = String(value || "").match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function attendanceTiming(record, body, rules) {
  const actualIn = body.actualIn || null;
  const actualOut = body.actualOut || null;
  const expectedIn = timeMinutes(record.expectedStart);
  const expectedOut = timeMinutes(record.expectedEnd);
  const inMinutes = timeMinutes(actualIn);
  const outMinutes = timeMinutes(actualOut);
  const rawLate = expectedIn === null || inMinutes === null ? 0 : Math.max(0, inMinutes - expectedIn);
  const rawEarly = expectedOut === null || outMinutes === null ? 0 : Math.max(0, expectedOut - outMinutes);
  const lateMinutes = rawLate > Math.max(0, Number(rules.lateGraceMinutes || 0)) ? rawLate : 0;
  const earlyLeaveMinutes = rawEarly > Math.max(0, Number(rules.earlyLeaveGraceMinutes || 0)) ? rawEarly : 0;
  let status = body.status;
  if (["PRESENT", "LATE", "EARLY_LEAVE"].includes(status)) {
    status = lateMinutes > 0 ? "LATE" : earlyLeaveMinutes > 0 ? "EARLY_LEAVE" : "PRESENT";
  }
  return { status, actualIn, actualOut, lateMinutes, earlyLeaveMinutes };
}

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
  let attendanceRules = {}; try { attendanceRules = JSON.parse(await getSetting("OPS_ATTENDANCE_RULES", "{}")); } catch {}
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
    if (attendanceRules.allowBulkExpectedTimes === false) return NextResponse.json({ success: false, error: "Bulk expected attendance defaults are disabled in Settings" }, { status: 409 });
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
  if (body.action === "correct" && attendanceRules.requireReasonAfterClose !== false && !String(body.reason || "").trim()) return NextResponse.json({ success: false, error: "Correction reason is required" }, { status: 400 });
  const timing = attendanceTiming(record, body, attendanceRules);
  const update = { ...timing, note: String(body.note || "").trim() || null, source: body.action === "correct" ? "CORRECTION" : "MANUAL" };
  const result = await prisma.$transaction(async (tx) => {
    if (body.action === "correct") await tx.opsAttendanceCorrection.create({ data: { attendanceRecordId: record.id, oldSnapshotJson: JSON.stringify({ status: record.status, actualIn: record.actualIn, actualOut: record.actualOut, lateMinutes: record.lateMinutes, earlyLeaveMinutes: record.earlyLeaveMinutes, note: record.note }), newSnapshotJson: JSON.stringify(update), reason: String(body.reason || "Manager correction").trim(), createdBy: user.id } });
    return tx.opsAttendanceRecord.update({ where: { id: record.id }, data: update });
  });
  await writeAudit({ action: body.action === "correct" ? "OPS_ATTENDANCE_CORRECTED" : "OPS_ATTENDANCE_UPDATED", user, summary: `Updated attendance for ${record.attendanceDay.workDate}`, metadata: { recordId: record.id, employeeId: record.employeeId, status: update.status }, reason: body.reason });
  return NextResponse.json({ success: true, record: result });
}
