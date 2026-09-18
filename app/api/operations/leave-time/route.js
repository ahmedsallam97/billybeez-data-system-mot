import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authorizeApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { getSetting } from "@/lib/settings";
import { allocateLeaveDates, assertLeaveEligible, assertNonNegativeLeaveBalance, attendanceStatusForLeaveType, leaveDateRange } from "@/lib/operations/leave";
import { assertNonNegativeBalance, hoursToMinutes, overtimeSummary } from "@/lib/operations/overtime";

const WORKED_HOLIDAY_STATUSES = ["PRESENT", "LATE", "EARLY_LEAVE", "UNEXPECTED_PRESENT"];
const LEAVE_ATTENDANCE_STATUSES = ["LEAVE", "REPLACEMENT_LEAVE"];
function validDate(value) { return /^\d{4}-\d{2}-\d{2}$/.test(String(value || "")); }
function localDate() { const now = new Date(); return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10); }
function requiredReason(body) { const reason = String(body.reason || "").trim(); if (!reason) throw new Error("A reason is required"); return reason; }

async function employeeAccounts(tx, employeeId, year) {
  const accounts = await tx.opsLeaveAccount.findMany({ where: { employeeId, leaveYear: year }, include: { transactions: { where: { status: "VALID" } } } });
  return accounts.map((account) => ({ ...account, balance: account.transactions.reduce((sum, item) => sum + item.amount, 0) }));
}

async function reverseBookingLedger(tx, allocations, userId, reason, referencePrefix) {
  const transactionIds = [...new Set(allocations.map((item) => item.leaveTransactionId).filter(Boolean))];
  for (const transactionId of transactionIds) {
    const source = await tx.opsLeaveTransaction.findUnique({ where: { id: transactionId } });
    if (!source || await tx.opsLeaveTransaction.findUnique({ where: { reversesTransactionId: source.id } })) continue;
    const current = await tx.opsLeaveTransaction.aggregate({ where: { leaveAccountId: source.leaveAccountId, status: "VALID" }, _sum: { amount: true } });
    assertNonNegativeLeaveBalance(current._sum.amount || 0, -source.amount);
    await tx.opsLeaveTransaction.create({ data: { leaveAccountId: source.leaveAccountId, amount: -source.amount, effectiveDate: localDate(), transactionType: "REVERSAL", sourceType: "LEAVE_BOOKING_REVERSAL", sourceReferenceId: `${referencePrefix}:${source.id}`, note: reason, reversesTransactionId: source.id, createdBy: userId } });
  }
}

async function applyBookingLedger(tx, booking, plan, userId, reason, sourceType) {
  const year = Number(booking.startDate.slice(0, 4));
  const transactionByType = new Map();
  const revision = `${Date.now()}`;
  for (const leaveType of [...new Set(plan.map((item) => item.leaveType))]) {
    const account = await tx.opsLeaveAccount.upsert({ where: { employeeId_leaveType_leaveYear: { employeeId: booking.employeeId, leaveType, leaveYear: year } }, update: {}, create: { employeeId: booking.employeeId, leaveType, leaveYear: year, entitlement: null, policyVersion: "LEDGER" } });
    const amount = -plan.filter((item) => item.leaveType === leaveType).reduce((sum, item) => sum + item.amount, 0);
    const current = await tx.opsLeaveTransaction.aggregate({ where: { leaveAccountId: account.id, status: "VALID" }, _sum: { amount: true } });
    assertNonNegativeLeaveBalance(current._sum.amount || 0, amount);
    const transaction = await tx.opsLeaveTransaction.create({ data: { leaveAccountId: account.id, amount, effectiveDate: booking.startDate, transactionType: "LEAVE_BOOKING_DEBIT", sourceType, sourceReferenceId: `${booking.id}:${revision}:${leaveType}`, note: reason, createdBy: userId } });
    transactionByType.set(leaveType, transaction.id);
  }
  await tx.opsLeaveBookingAllocation.createMany({ data: plan.map((item) => ({ leaveBookingId: booking.id, leaveDate: item.leaveDate, leaveType: item.leaveType, amount: item.amount, leaveTransactionId: transactionByType.get(item.leaveType) })) });
}

async function syncBookingAttendance(tx, booking, oldAllocations, newPlan, userId, reason) {
  const dates = [...new Set([...oldAllocations.map((item) => item.leaveDate), ...newPlan.map((item) => item.leaveDate)])];
  if (!dates.length) return;
  const records = await tx.opsAttendanceRecord.findMany({ where: { employeeId: booking.employeeId, attendanceDay: { workDate: { in: dates } } }, include: { attendanceDay: true } });
  const desiredByDate = new Map(newPlan.map((item) => [item.leaveDate, attendanceStatusForLeaveType(item.leaveType)]));
  const oldDates = new Set(oldAllocations.map((item) => item.leaveDate));
  for (const record of records) {
    const desired = desiredByDate.get(record.attendanceDay.workDate) || (oldDates.has(record.attendanceDay.workDate) && LEAVE_ATTENDANCE_STATUSES.includes(record.status) ? "PRESENT" : null);
    if (!desired || desired === record.status) continue;
    const update = { status: desired, source: record.attendanceDay.status === "FINALIZED" ? "CORRECTION" : "MANUAL", note: reason };
    if (record.attendanceDay.status === "FINALIZED") await tx.opsAttendanceCorrection.create({ data: { attendanceRecordId: record.id, oldSnapshotJson: JSON.stringify({ status: record.status, actualIn: record.actualIn, actualOut: record.actualOut, note: record.note }), newSnapshotJson: JSON.stringify({ ...update, actualIn: record.actualIn, actualOut: record.actualOut }), reason, createdBy: userId } });
    await tx.opsAttendanceRecord.update({ where: { id: record.id }, data: update });
  }
}

export async function GET(request) {
  const { error } = await authorizeApi("OPS_LEAVE_READ");
  if (error) return error;
  const year = Number(new URL(request.url).searchParams.get("year") || new Date().getFullYear());
  let leaveRules = {}; try { leaveRules = JSON.parse(await getSetting("OPS_LEAVE_RULES", "{}")); } catch {}
  const [employees, holidays, bookings] = await Promise.all([
    prisma.employee.findMany({ where: { active: true }, include: { leaveAccounts: { where: { leaveYear: year }, include: { transactions: { orderBy: { createdAt: "desc" } } } }, overtimeAccount: { include: { transactions: { orderBy: { createdAt: "desc" } } } } }, orderBy: { name: "asc" } }),
    prisma.opsOfficialHolidayPeriod.findMany({ where: { startDate: { startsWith: String(year) } }, orderBy: { startDate: "asc" } }),
    prisma.opsLeaveBooking.findMany({ where: { startDate: { startsWith: String(year) } }, include: { employee: { select: { id: true, name: true, hrisNumber: true, localEmployeeCode: true } }, allocations: { orderBy: { leaveDate: "asc" } } }, orderBy: [{ startDate: "desc" }, { createdAt: "desc" }] }),
  ]);
  const bookingPriority = { DRAFT: 0, APPROVED: 1, CANCELLED: 2 };
  bookings.sort((first, second) => (bookingPriority[first.status] - bookingPriority[second.status]) || new Date(second.createdAt) - new Date(first.createdAt));
  return NextResponse.json({ success: true, year, holidays, bookings, employees: employees.map((employee) => ({ id: employee.id, name: employee.name, nameEn: employee.nameEn, hrisNumber: employee.hrisNumber, localEmployeeCode: employee.localEmployeeCode, employmentType: employee.employmentType, leaveAccounts: employee.leaveAccounts.map((account) => ({ id: account.id, leaveType: account.leaveType, entitlement: account.entitlement, balance: account.transactions.filter((item) => item.status === "VALID").reduce((sum, item) => sum + item.amount, 0), transactions: account.transactions })), overtime: overtimeSummary(employee.overtimeAccount?.transactions.reduce((sum, item) => sum + item.minutes, 0) || 0, leaveRules.overtimeHoursPerDay || 8), overtimeTransactions: employee.overtimeAccount?.transactions || [] })) });
}

export async function POST(request) {
  const body = await request.json();
  const permission = ["createBooking", "approveBooking", "correctBooking", "cancelBooking"].includes(body.action) ? "OPS_LEAVE_MANAGE" : "OPS_TIME_MANAGE";
  const { user, error } = await authorizeApi(permission);
  if (error) return error;
  try {
    if (body.action === "createBooking") {
      const reason = requiredReason(body);
      const employee = await prisma.employee.findUnique({ where: { id: String(body.employeeId || "") } });
      if (!employee) throw new Error("Employee not found");
      const dates = leaveDateRange(String(body.startDate || ""), String(body.endDate || ""));
      if (dates[0].slice(0, 4) !== dates.at(-1).slice(0, 4)) throw new Error("A leave request must stay within one balance year");
      const requestedType = String(body.requestedType || "SMART").toUpperCase();
      if (!["SMART", "ANNUAL", "REPLACEMENT"].includes(requestedType)) throw new Error("Invalid leave allocation type");
      if (requestedType === "REPLACEMENT") assertLeaveEligible(employee, requestedType);
      const overlap = await prisma.opsLeaveBooking.findFirst({ where: { employeeId: employee.id, status: { in: ["DRAFT", "APPROVED"] }, startDate: { lte: dates.at(-1) }, endDate: { gte: dates[0] } } });
      if (overlap) throw new Error("Employee already has an overlapping leave request");
      const booking = await prisma.$transaction(async (tx) => {
        const created = await tx.opsLeaveBooking.create({ data: { employeeId: employee.id, startDate: dates[0], endDate: dates.at(-1), requestedDays: dates.length, note: reason, createdBy: user.id } });
        await tx.opsLeaveBookingAllocation.createMany({ data: dates.map((leaveDate) => ({ leaveBookingId: created.id, leaveDate, leaveType: requestedType, amount: 1 })) });
        return created;
      });
      await writeAudit({ action: "OPS_LEAVE_BOOKING_CREATED", user, summary: `Created leave request for ${employee.name}`, metadata: { bookingId: booking.id, startDate: booking.startDate, endDate: booking.endDate, requestedType }, reason });
      return NextResponse.json({ success: true, booking }, { status: 201 });
    }
    if (["approveBooking", "correctBooking", "cancelBooking"].includes(body.action)) {
      const reason = requiredReason(body);
      const bookingId = String(body.bookingId || "");
      const result = await prisma.$transaction(async (tx) => {
        const booking = await tx.opsLeaveBooking.findUnique({ where: { id: bookingId }, include: { employee: true, allocations: true } });
        if (!booking) throw new Error("Leave request not found");
        if (body.action === "approveBooking" && booking.status !== "DRAFT") throw new Error("Only draft leave requests can be approved");
        if (body.action === "correctBooking" && booking.status !== "APPROVED") throw new Error("Only approved leave requests can be corrected");
        if (body.action === "cancelBooking" && booking.status === "CANCELLED") throw new Error("Leave request is already cancelled");
        const oldAllocations = booking.allocations;
        if (booking.status === "APPROVED" && body.action !== "approveBooking") await reverseBookingLedger(tx, oldAllocations, user.id, reason, `${booking.id}:${body.action}`);
        if (body.action === "cancelBooking") {
          await syncBookingAttendance(tx, booking, oldAllocations, [], user.id, reason);
          return tx.opsLeaveBooking.update({ where: { id: booking.id }, data: { status: "CANCELLED", note: reason } });
        }
        const dates = body.action === "correctBooking" ? leaveDateRange(String(body.startDate || ""), String(body.endDate || "")) : oldAllocations.map((item) => item.leaveDate).sort();
        if (dates[0].slice(0, 4) !== dates.at(-1).slice(0, 4)) throw new Error("A leave request must stay within one balance year");
        if (body.action === "correctBooking" && await tx.opsLeaveBooking.findFirst({ where: { id: { not: booking.id }, employeeId: booking.employeeId, status: { in: ["DRAFT", "APPROVED"] }, startDate: { lte: dates.at(-1) }, endDate: { gte: dates[0] } } })) throw new Error("Employee already has an overlapping leave request");
        const requestedType = String(body.requestedType || oldAllocations[0]?.leaveType || "SMART").toUpperCase();
        const year = Number(dates[0].slice(0, 4));
        const accounts = await employeeAccounts(tx, booking.employeeId, year);
        const plan = allocateLeaveDates(dates, accounts, booking.employee, requestedType);
        await tx.opsLeaveBookingAllocation.deleteMany({ where: { leaveBookingId: booking.id } });
        const updated = await tx.opsLeaveBooking.update({ where: { id: booking.id }, data: { startDate: dates[0], endDate: dates.at(-1), requestedDays: dates.length, status: "APPROVED", approvedAt: new Date(), approvedBy: user.id, note: reason } });
        await applyBookingLedger(tx, updated, plan, user.id, reason, body.action === "correctBooking" ? "LEAVE_BOOKING_CORRECTION" : "LEAVE_BOOKING");
        await syncBookingAttendance(tx, booking, oldAllocations, plan, user.id, reason);
        return updated;
      }, { timeout: 30000 });
      const action = body.action === "approveBooking" ? "OPS_LEAVE_BOOKING_APPROVED" : body.action === "correctBooking" ? "OPS_LEAVE_BOOKING_CORRECTED" : "OPS_LEAVE_BOOKING_CANCELLED";
      await writeAudit({ action, user, summary: `${body.action} ${result.id}`, metadata: { bookingId: result.id, employeeId: result.employeeId, startDate: result.startDate, endDate: result.endDate }, reason });
      return NextResponse.json({ success: true, booking: result });
    }
    if (body.action === "adjustLeave" || body.kind === "leave") {
      const reason = requiredReason(body);
      const employee = await prisma.employee.findUnique({ where: { id: String(body.employeeId || "") } });
      if (!employee) throw new Error("Employee not found");
      const leaveType = String(body.leaveType || "").toUpperCase();
      if (!["ANNUAL", "REPLACEMENT"].includes(leaveType)) throw new Error("Invalid leave type");
      assertLeaveEligible(employee, leaveType);
      const amount = Number(body.amount);
      if (!Number.isFinite(amount) || amount === 0) throw new Error("Amount must be a non-zero number");
      const year = Number(body.year || new Date().getFullYear());
      const result = await prisma.$transaction(async (tx) => {
        const account = await tx.opsLeaveAccount.upsert({ where: { employeeId_leaveType_leaveYear: { employeeId: employee.id, leaveType, leaveYear: year } }, update: {}, create: { employeeId: employee.id, leaveType, leaveYear: year, entitlement: null, policyVersion: "MANUAL" } });
        const current = await tx.opsLeaveTransaction.aggregate({ where: { leaveAccountId: account.id, status: "VALID" }, _sum: { amount: true } });
        assertNonNegativeLeaveBalance(current._sum.amount || 0, amount);
        return tx.opsLeaveTransaction.create({ data: { leaveAccountId: account.id, amount, effectiveDate: String(body.date || localDate()), transactionType: amount > 0 ? "MANUAL_CREDIT" : "MANUAL_DEBIT", sourceType: "MANUAL_ADJUSTMENT", note: reason, createdBy: user.id } });
      });
      await writeAudit({ action: "OPS_LEAVE_ADJUSTED", user, summary: `Adjusted ${leaveType} balance for ${employee.name}`, metadata: { employeeId: employee.id, leaveType, amount, transactionId: result.id }, reason });
      return NextResponse.json({ success: true, transaction: result });
    }
    if (body.action === "reverseLeave") {
      const reason = requiredReason(body);
      const source = await prisma.opsLeaveTransaction.findUnique({ where: { id: String(body.transactionId || "") } });
      if (!source || source.reversesTransactionId || source.sourceType !== "MANUAL_ADJUSTMENT") throw new Error("Only a manual leave adjustment can be reversed here");
      const result = await prisma.$transaction(async (tx) => {
        if (await tx.opsLeaveTransaction.findUnique({ where: { reversesTransactionId: source.id } })) throw new Error("Leave transaction is already reversed");
        const current = await tx.opsLeaveTransaction.aggregate({ where: { leaveAccountId: source.leaveAccountId, status: "VALID" }, _sum: { amount: true } });
        assertNonNegativeLeaveBalance(current._sum.amount || 0, -source.amount);
        return tx.opsLeaveTransaction.create({ data: { leaveAccountId: source.leaveAccountId, amount: -source.amount, effectiveDate: String(body.date || localDate()), transactionType: "REVERSAL", sourceType: "MANUAL_REVERSAL", sourceReferenceId: source.id, note: reason, reversesTransactionId: source.id, createdBy: user.id } });
      });
      await writeAudit({ action: "OPS_LEAVE_TRANSACTION_REVERSED", user, summary: `Reversed leave transaction ${source.id}`, metadata: { transactionId: source.id, reversalId: result.id }, reason });
      return NextResponse.json({ success: true, transaction: result });
    }
    if (body.action === "adjustOvertime" || body.kind === "overtime") {
      const reason = requiredReason(body);
      const employee = await prisma.employee.findUnique({ where: { id: String(body.employeeId || "") } });
      if (!employee) throw new Error("Employee not found");
      const minutes = hoursToMinutes(body.hours, { allowNegative: true });
      const result = await prisma.$transaction(async (tx) => {
        const account = await tx.opsOvertimeAccount.upsert({ where: { employeeId: employee.id }, update: {}, create: { employeeId: employee.id } });
        const current = await tx.opsOvertimeTransaction.aggregate({ where: { overtimeAccountId: account.id }, _sum: { minutes: true } });
        assertNonNegativeBalance(current._sum.minutes || 0, minutes);
        return tx.opsOvertimeTransaction.create({ data: { overtimeAccountId: account.id, employeeId: employee.id, transactionDate: String(body.date || localDate()), minutes, transactionType: minutes > 0 ? "MANUAL_CREDIT" : "MANUAL_DEBIT", source: "MANUAL_ADJUSTMENT", reason, createdBy: user.id } });
      });
      await writeAudit({ action: "OPS_OVERTIME_ADJUSTED", user, summary: `Adjusted overtime for ${employee.name}`, metadata: { employeeId: employee.id, minutes, transactionId: result.id }, reason });
      return NextResponse.json({ success: true, transaction: result });
    }
    if (body.action === "reverseOvertime") {
      const reason = requiredReason(body);
      const source = await prisma.opsOvertimeTransaction.findUnique({ where: { id: String(body.transactionId || "") } });
      if (!source || source.reversalOfTransactionId || source.source !== "MANUAL_ADJUSTMENT") throw new Error("Only a manual overtime adjustment can be reversed here");
      const result = await prisma.$transaction(async (tx) => {
        if (await tx.opsOvertimeTransaction.findUnique({ where: { reversalOfTransactionId: source.id } })) throw new Error("Overtime transaction is already reversed");
        const current = await tx.opsOvertimeTransaction.aggregate({ where: { overtimeAccountId: source.overtimeAccountId }, _sum: { minutes: true } });
        assertNonNegativeBalance(current._sum.minutes || 0, -source.minutes);
        return tx.opsOvertimeTransaction.create({ data: { overtimeAccountId: source.overtimeAccountId, employeeId: source.employeeId, transactionDate: String(body.date || localDate()), minutes: -source.minutes, transactionType: "REVERSAL", source: "MANUAL_REVERSAL", reason, reversalOfTransactionId: source.id, createdBy: user.id } });
      });
      await writeAudit({ action: "OPS_OVERTIME_TRANSACTION_REVERSED", user, summary: `Reversed overtime transaction ${source.id}`, metadata: { transactionId: source.id, reversalId: result.id }, reason });
      return NextResponse.json({ success: true, transaction: result });
    }
    if (body.action === "createHoliday" || body.kind === "holiday") {
      const reason = requiredReason(body);
      const name = String(body.name || "").trim(); const startDate = String(body.startDate || ""); const endDate = String(body.endDate || "");
      if (!name || !validDate(startDate) || !validDate(endDate) || endDate < startDate) throw new Error("Valid holiday name and date range are required");
      const holiday = await prisma.opsOfficialHolidayPeriod.create({ data: { name, startDate, endDate, note: reason, createdBy: user.id } });
      await writeAudit({ action: "OPS_HOLIDAY_CREATED", user, summary: `Created official holiday ${name}`, metadata: { holidayId: holiday.id, startDate, endDate }, reason });
      return NextResponse.json({ success: true, holiday });
    }
    if (body.action === "reconcileHoliday") {
      const reason = requiredReason(body);
      const holiday = await prisma.opsOfficialHolidayPeriod.findUnique({ where: { id: String(body.holidayId || "") } });
      if (!holiday || !holiday.active) throw new Error("Active official holiday not found");
      let holidayRules = {}; try { holidayRules = JSON.parse(await getSetting("OPS_LEAVE_RULES", "{}")); } catch {}
      const holidayCredit = Number(holidayRules.holidayWorkCreditDays || 2);
      const result = await prisma.$transaction(async (tx) => {
        const records = await tx.opsAttendanceRecord.findMany({ where: { attendanceDay: { status: "FINALIZED", workDate: { gte: holiday.startDate, lte: holiday.endDate } }, status: { in: WORKED_HOLIDAY_STATUSES }, employee: { employmentType: "HRIS", hrisNumber: { not: null } } }, include: { attendanceDay: true } });
        const eligibleRefs = new Set(records.map((record) => `${holiday.id}:${record.id}`));
        const existingCredits = await tx.opsLeaveTransaction.findMany({ where: { sourceType: "OFFICIAL_HOLIDAY", sourceReferenceId: { startsWith: `${holiday.id}:` } } });
        let credited = 0; let reversed = 0;
        for (const record of records) {
          const reference = `${holiday.id}:${record.id}`;
          if (existingCredits.some((item) => item.sourceReferenceId === reference)) continue;
          const year = Number(record.attendanceDay.workDate.slice(0, 4));
          const account = await tx.opsLeaveAccount.upsert({ where: { employeeId_leaveType_leaveYear: { employeeId: record.employeeId, leaveType: "REPLACEMENT", leaveYear: year } }, update: {}, create: { employeeId: record.employeeId, leaveType: "REPLACEMENT", leaveYear: year, entitlement: null, policyVersion: "HOLIDAY_WORK" } });
          await tx.opsLeaveTransaction.create({ data: { leaveAccountId: account.id, amount: holidayCredit, effectiveDate: record.attendanceDay.workDate, transactionType: "HOLIDAY_WORK_CREDIT", sourceType: "OFFICIAL_HOLIDAY", sourceReferenceId: reference, note: reason, createdBy: user.id } });
          credited += 1;
        }
        for (const source of existingCredits.filter((item) => !eligibleRefs.has(item.sourceReferenceId))) {
          if (await tx.opsLeaveTransaction.findUnique({ where: { reversesTransactionId: source.id } })) continue;
          const current = await tx.opsLeaveTransaction.aggregate({ where: { leaveAccountId: source.leaveAccountId, status: "VALID" }, _sum: { amount: true } });
          assertNonNegativeLeaveBalance(current._sum.amount || 0, -source.amount);
          await tx.opsLeaveTransaction.create({ data: { leaveAccountId: source.leaveAccountId, amount: -source.amount, effectiveDate: localDate(), transactionType: "REVERSAL", sourceType: "OFFICIAL_HOLIDAY_REVERSAL", sourceReferenceId: source.id, note: reason, reversesTransactionId: source.id, createdBy: user.id } });
          reversed += 1;
        }
        return { eligible: records.length, credited, reversed };
      }, { timeout: 30000 });
      await writeAudit({ action: "OPS_HOLIDAY_REPLACEMENT_RECONCILED", user, summary: `Reconciled replacement credits for ${holiday.name}`, metadata: { holidayId: holiday.id, ...result }, reason });
      return NextResponse.json({ success: true, ...result });
    }
    throw new Error("Unknown leave/time operation");
  } catch (operationError) {
    return NextResponse.json({ success: false, error: operationError.message }, { status: 400 });
  }
}
