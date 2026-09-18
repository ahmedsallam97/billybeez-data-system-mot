import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authorizeApi } from "@/lib/api-auth";
import { getSetting } from "@/lib/settings";

function todayInTimezone(timeZone) {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

export async function GET() {
  const { error } = await authorizeApi("OPERATIONS_DASHBOARD_READ");
  if (error) return error;
  let branchConfig = {}; try { branchConfig = JSON.parse(await getSetting("OPS_BRANCH_CONFIG", "{}")); } catch {}
  const today = todayInTimezone(branchConfig.timezone || "Africa/Cairo");
  const nextWeek = new Date(`${today}T00:00:00Z`); nextWeek.setUTCDate(nextWeek.getUTCDate() + 7); const nextWeekDate = nextWeek.toISOString().slice(0, 10);
  const [activeEmployees, hrisEmployees, partTimeEmployees, schedules, attendanceDay, draftAppraisals, draftLeaveRequests, latestApproved, activeMismatch, missingRosterNames, upcomingTrips, upcomingEvents, lowStock] = await Promise.all([
    prisma.employee.count({ where: { active: true } }),
    prisma.employee.count({ where: { active: true, employmentType: "HRIS" } }),
    prisma.employee.count({ where: { active: true, employmentType: "PART_TIME" } }),
    prisma.opsSchedule.findMany({ where: { status: "PUBLISHED" }, select: { id: true, periodStart: true, periodEnd: true, operationalYear: true, operationalMonth: true } }),
    prisma.opsAttendanceDay.findFirst({ where: { workDate: today }, include: { records: { include: { employee: { select: { id: true, name: true, jobTitle: true } } } } }, orderBy: { version: "desc" } }),
    prisma.opsMonthlyAppraisal.count({ where: { status: { in: ["DRAFT", "REVIEWED", "REOPENED"] } } }),
    prisma.opsLeaveBooking.count({ where: { status: "DRAFT" } }),
    prisma.opsMonthlyAppraisal.findFirst({ where: { status: "APPROVED", employee: { active: true } }, orderBy: [{ year: "desc" }, { month: "desc" }, { version: "desc" }], select: { year: true, month: true } }),
    prisma.employee.count({ where: { OR: [{ active: true, employmentStatus: { not: "ACTIVE" } }, { active: false, employmentStatus: "ACTIVE" }] } }),
    prisma.employee.count({ where: { active: true, OR: [{ operationalName: null }, { operationalName: "" }] } }),
    prisma.opsDailyTrip.count({ where: { workDate: { gte: today, lte: nextWeekDate }, status: { not: "CANCELLED" } } }),
    prisma.opsDailyEvent.count({ where: { workDate: { gte: today, lte: nextWeekDate }, status: { not: "CANCELLED" } } }),
    prisma.opsWristbandStock.count({ where: { workDate: today, availableStock: { lte: 10 } } }),
  ]);
  const currentSchedule = schedules.find((schedule) => schedule.periodStart <= today && schedule.periodEnd >= today) || null;
  const attention = [];
  if (!currentSchedule) attention.push({ code: "SCHEDULE_NOT_PUBLISHED", severity: "danger", target: "schedule", message: "No published operational schedule covers today" });
  if (currentSchedule && !attendanceDay) attention.push({ code: "ATTENDANCE_NOT_STARTED", severity: "warning", target: "daily", message: "Today's attendance has not been opened" });
  if (attendanceDay) {
    const missing = attendanceDay.records.filter((record) => record.status === "MISSING").length;
    if (missing) attention.push({ code: "MISSING_ATTENDANCE", severity: "warning", target: "daily", message: `${missing} attendance records still need action` });
  }
  if (draftAppraisals) attention.push({ code: "APPRAISALS_PENDING", severity: "info", target: "performance", message: `${draftAppraisals} appraisals are awaiting review or approval` });
  if (draftLeaveRequests) attention.push({ code: "LEAVE_REQUESTS_PENDING", severity: "info", target: "time", message: `${draftLeaveRequests} leave requests are awaiting approval` });
  if (activeMismatch) attention.push({ code: "EMPLOYEE_STATUS_MISMATCH", severity: "warning", target: "employees", message: `${activeMismatch} employee records have inconsistent active status` });
  if (lowStock) attention.push({ code: "LOW_STOCK", severity: "warning", target: "stock", message: `${lowStock} stock items are at or below the warning level` });
  const approvedAppraisals = latestApproved ? await prisma.opsMonthlyAppraisal.findMany({ where: { year: latestApproved.year, month: latestApproved.month, status: "APPROVED", employee: { active: true } }, include: { employee: { select: { id: true, name: true, nameEn: true, jobTitle: true } } }, orderBy: [{ totalScore: "desc" }, { employee: { name: "asc" } }] }) : [];
  const performanceRows = approvedAppraisals.map((appraisal) => ({
    employee: appraisal.employee,
    score: appraisal.totalScore,
    year: appraisal.year,
    month: appraisal.month,
  })).sort((a, b) => Number(b.score) - Number(a.score));
  const performance = {
    top: performanceRows.slice(0, 3),
    needsSupport: performanceRows.slice(-3).reverse(),
    source: latestApproved,
  };
  return NextResponse.json({ success: true, today, metrics: { activeEmployees, hrisEmployees, partTimeEmployees, publishedSchedules: schedules.length, draftAppraisals, draftLeaveRequests }, currentSchedule, attendanceDay: attendanceDay ? { status: attendanceDay.status, records: attendanceDay.records.length } : null, performance, attention, planning: { upcomingTrips, upcomingEvents, upcomingBookings: upcomingTrips + upcomingEvents, lowStock }, dataQuality: { inconsistentActiveStatus: activeMismatch, missingRosterNames } });
}
