import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authorizeApi } from "@/lib/api-auth";
import { getSetting } from "@/lib/settings";

function todayInTimezone(timeZone) {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

function isoDaysBefore(value, days) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

export async function GET() {
  const { error } = await authorizeApi("OPERATIONS_DASHBOARD_READ");
  if (error) return error;
  let branchConfig = {}; try { branchConfig = JSON.parse(await getSetting("OPS_BRANCH_CONFIG", "{}")); } catch {}
  let stockRules = {}; try { stockRules = JSON.parse(await getSetting("OPS_STOCK_RULES", "{}")); } catch {}
  const lowStockThreshold = Math.max(0, Number(stockRules.lowStockThreshold ?? 10));
  const today = todayInTimezone(branchConfig.timezone || "Africa/Cairo");
  const currentYear = Number(today.slice(0, 4));
  const currentMonth = Number(today.slice(5, 7));
  const attendanceLookbackDate = isoDaysBefore(today, 60);
  const nextWeek = new Date(`${today}T00:00:00Z`); nextWeek.setUTCDate(nextWeek.getUTCDate() + 7); const nextWeekDate = nextWeek.toISOString().slice(0, 10);
  const [activeEmployees, hrisEmployees, partTimeEmployees, schedules, attendanceDay, draftAppraisals, draftLeaveRequests, latestApproved, activeMismatch, missingRosterNames, upcomingTrips, upcomingEvents, lowStock, attendanceIssues, staleAttendanceDays, openDiscipline, openIncidents, competitionRows, appraisalPeriods] = await Promise.all([
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
    prisma.opsWristbandStock.count({ where: { workDate: { in: ["ALL", today] }, availableStock: { lte: lowStockThreshold } } }),
    prisma.opsAttendanceRecord.findMany({
      where: {
        employee: { active: true },
        attendanceDay: { workDate: { gte: attendanceLookbackDate, lte: today }, status: "FINALIZED" },
        OR: [{ status: { in: ["LATE", "EARLY_LEAVE", "ABSENT"] } }, { lateMinutes: { gt: 0 } }, { earlyLeaveMinutes: { gt: 0 } }],
      },
      include: { employee: { select: { id: true, name: true, nameEn: true, operationalName: true } }, attendanceDay: { select: { workDate: true } } },
      orderBy: { attendanceDay: { workDate: "desc" } },
      take: 500,
    }),
    prisma.opsAttendanceDay.findMany({
      where: { workDate: { lt: today }, status: { in: ["OPEN", "REOPENED"] }, records: { some: { status: "MISSING" } } },
      select: { workDate: true, records: { where: { status: "MISSING" }, select: { id: true } } },
      orderBy: { workDate: "asc" },
      take: 31,
    }),
    prisma.employeeGuidanceRecord.findMany({
      where: { status: { notIn: ["CLOSED", "RESOLVED", "CANCELLED"] }, recordType: { in: ["WARNING", "PENALTY"] }, employee: { active: true } },
      include: { employee: { select: { id: true, name: true, nameEn: true, operationalName: true } } },
      orderBy: [{ followUpDate: "asc" }, { recordDate: "desc" }],
      take: 100,
    }),
    prisma.employeeIncident.findMany({
      where: { status: { not: "CLOSED" }, severity: { in: ["HIGH", "CRITICAL"] }, employee: { active: true } },
      include: { employee: { select: { id: true, name: true, nameEn: true, operationalName: true } } },
      orderBy: [{ severity: "desc" }, { incidentDate: "desc" }],
      take: 100,
    }),
    prisma.opsEotmCompetition.findMany({
      where: { year: currentYear, month: { lt: currentMonth } },
      select: { month: true, version: true, status: true, winnerEmployeeId: true },
      orderBy: [{ month: "asc" }, { version: "desc" }],
    }),
    prisma.opsMonthlyAppraisal.groupBy({
      by: ["month", "status"],
      where: { year: currentYear, month: { lt: currentMonth }, employee: { active: true } },
      _count: { _all: true },
    }),
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

  const employeeName = (employee) => employee.operationalName || employee.nameEn || employee.name;
  const attendanceByEmployee = new Map();
  attendanceIssues.forEach((record) => {
    const current = attendanceByEmployee.get(record.employeeId) || { employeeId: record.employeeId, name: employeeName(record.employee), lateOccurrences: 0, earlyLeaveOccurrences: 0, absences: 0, lateMinutes: 0, earlyLeaveMinutes: 0, dates: [] };
    if (record.status === "LATE" || record.lateMinutes > 0) current.lateOccurrences += 1;
    if (record.status === "EARLY_LEAVE" || record.earlyLeaveMinutes > 0) current.earlyLeaveOccurrences += 1;
    if (record.status === "ABSENT") current.absences += 1;
    current.lateMinutes += record.lateMinutes || 0;
    current.earlyLeaveMinutes += record.earlyLeaveMinutes || 0;
    current.dates.push(record.attendanceDay.workDate);
    attendanceByEmployee.set(record.employeeId, current);
  });
  const attendancePriorities = [...attendanceByEmployee.values()]
    .map((item) => ({ ...item, score: item.absences * 180 + item.lateMinutes + item.earlyLeaveMinutes + (item.lateOccurrences + item.earlyLeaveOccurrences) * 15 }))
    .sort((left, right) => right.score - left.score || left.name.localeCompare(right.name))
    .slice(0, 4);

  const latestCompetitionByMonth = new Map();
  competitionRows.forEach((competition) => { if (!latestCompetitionByMonth.has(competition.month)) latestCompetitionByMonth.set(competition.month, competition); });
  const appraisalCounts = new Map();
  appraisalPeriods.forEach((period) => {
    const current = appraisalCounts.get(period.month) || { approved: 0, pending: 0 };
    if (period.status === "APPROVED") current.approved += period._count._all;
    if (["DRAFT", "REVIEWED", "REOPENED"].includes(period.status)) current.pending += period._count._all;
    appraisalCounts.set(period.month, current);
  });
  const recognitionMonths = Array.from({ length: Math.max(0, currentMonth - 1) }, (_, index) => index + 1).flatMap((month) => {
    const competition = latestCompetitionByMonth.get(month);
    if (competition?.status === "LOCKED" && competition.winnerEmployeeId) return [];
    const counts = appraisalCounts.get(month) || { approved: 0, pending: 0 };
    return [{ month, status: counts.approved > 0 ? "READY_FOR_WINNER" : counts.pending > 0 ? "APPRAISALS_PENDING" : "NOT_STARTED", approvedAppraisals: counts.approved, pendingAppraisals: counts.pending, competitionStatus: competition?.status || null }];
  });

  const disciplineEmployeeIds = new Set([...openDiscipline, ...openIncidents].map((item) => item.employeeId));
  const assistantInsights = [];
  if (attendancePriorities.length) assistantInsights.push({ code: "ATTENDANCE_COACHING", severity: "warning", target: "employees", lookbackDays: 60, employees: attendancePriorities });
  if (staleAttendanceDays.length) assistantInsights.push({ code: "STALE_ATTENDANCE_DAYS", severity: "danger", target: "daily", dayCount: staleAttendanceDays.length, missingRecords: staleAttendanceDays.reduce((sum, day) => sum + day.records.length, 0), oldestDate: staleAttendanceDays[0].workDate, dates: staleAttendanceDays.map((day) => day.workDate) });
  if (disciplineEmployeeIds.size) assistantInsights.push({ code: "DISCIPLINARY_FOLLOWUP", severity: "danger", target: "employees", employeeCount: disciplineEmployeeIds.size, warningCount: openDiscipline.length, incidentCount: openIncidents.length, overdueFollowUps: openDiscipline.filter((item) => item.followUpDate && item.followUpDate.toISOString().slice(0, 10) < today).length, employees: [...new Map([...openDiscipline, ...openIncidents].map((item) => [item.employeeId, { employeeId: item.employeeId, name: employeeName(item.employee) }])).values()].slice(0, 4) });
  if (recognitionMonths.length) assistantInsights.push({ code: "RECOGNITION_MONTHS_PENDING", severity: recognitionMonths.some((item) => item.status === "READY_FOR_WINNER") ? "warning" : "info", target: "performance", year: currentYear, months: recognitionMonths });

  return NextResponse.json({ success: true, today, metrics: { activeEmployees, hrisEmployees, partTimeEmployees, publishedSchedules: schedules.length, draftAppraisals, draftLeaveRequests }, currentSchedule, attendanceDay: attendanceDay ? { status: attendanceDay.status, records: attendanceDay.records.length } : null, performance, attention, assistant: { name: "Billy Assistant", generatedAt: new Date().toISOString(), insights: assistantInsights }, planning: { upcomingTrips, upcomingEvents, upcomingBookings: upcomingTrips + upcomingEvents, lowStock }, dataQuality: { inconsistentActiveStatus: activeMismatch, missingRosterNames } });
}
