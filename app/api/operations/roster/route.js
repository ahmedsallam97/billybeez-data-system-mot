import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authorizeApi } from "@/lib/api-auth";
import { getSetting } from "@/lib/settings";
import { offerAppliesOnDate } from "@/lib/operations/planning";
import { applyCashierFallbacks } from "@/lib/operations/cashiers";

export async function GET(request) {
  const { error } = await authorizeApi("OPS_SCHEDULE_READ");
  if (error) return error;
  const date = String(new URL(request.url).searchParams.get("date") || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ success: false, error: "Date must use YYYY-MM-DD" }, { status: 400 });
  try {
  const parse = (value, fallback) => { try { return JSON.parse(value); } catch { return fallback; } };
  const branchConfig = parse(await getSetting("OPS_BRANCH_CONFIG", "{}"), {});
  const branch = branchConfig.branchCode || "MOT";
  const rotationRules = parse(await getSetting("OPS_ROTATION_RULES", "{}"), {});
  const schedule = await prisma.opsSchedule.findFirst({ where: { status: "PUBLISHED", periodStart: { lte: date }, periodEnd: { gte: date } }, orderBy: { version: "desc" } });
  if (!schedule) return NextResponse.json({ success: true, date, schedule: null, roster: [] });
  const [assignments, shiftDefinitions, operationsDay, attendanceDay, trips, events, offerRows, notices, stockRows, cashierConfigRaw, phrasesRaw] = await Promise.all([
    prisma.opsScheduleAssignment.findMany({ where: { scheduleId: schedule.id, workDate: date, employee: { department: { in: ["OPERATION", "CASHIER"] } } }, include: { employee: { select: { id: true, name: true, nameEn: true, operationalName: true, gender: true, operationsTeamLeader: true, hrisNumber: true, localEmployeeCode: true, jobTitle: true, department: true } } }, orderBy: [{ shiftCode: "asc" }, { employee: { name: "asc" } }] }),
    prisma.opsShiftDefinition.findMany({ where: { active: true }, select: { code: true, label: true, labelAr: true, startTime: true, endTime: true }, orderBy: { sortOrder: "asc" } }),
    prisma.opsOperationsDay.findFirst({
      where: { workDate: date },
      orderBy: { version: "desc" },
      include: {
        rotationPlans: {
          orderBy: { version: "desc" },
          take: 1,
          include: {
            assignments: {
              include: {
                employee: { select: { id: true, name: true } },
                position: { select: { code: true, label: true, labelAr: true } },
              },
              orderBy: [{ startTime: "asc" }, { employee: { name: "asc" } }],
            },
            breaks: { include: { employee: { select: { id: true, name: true } } }, orderBy: { startTime: "asc" } },
          },
        },
      },
    }),
    prisma.opsAttendanceDay.findFirst({ where: { workDate: date }, orderBy: { version: "desc" }, include: { records: true } }),
    prisma.opsDailyTrip.findMany({ where: { branch, workDate: date, status: { not: "CANCELLED" } }, orderBy: { startTime: "asc" } }),
    prisma.opsDailyEvent.findMany({ where: { branch, workDate: date, status: { not: "CANCELLED" } }, orderBy: { startTime: "asc" } }),
    prisma.opsDailyOffer.findMany({ where: { branch, active: true }, orderBy: { title: "asc" } }),
    prisma.opsOperationalNotice.findMany({ where: { branch, active: true, effectiveFrom: { lte: date }, OR: [{ effectiveTo: null }, { effectiveTo: { gte: date } }] }, orderBy: { priority: "asc" } }),
    prisma.opsWristbandStock.findMany({ where: { branch, workDate: { in: ["ALL", date] } }, orderBy: [{ workDate: "asc" }, { wristbandType: "asc" }] }),
    getSetting("OPS_CASHIER_CONFIG", "{}"),
    getSetting("OPS_MOTIVATION_PHRASES", "[]"),
  ]);
  const cashierConfig = parse(cashierConfigRaw, { primaryEmployeeIds: [], backupEmployeeIds: [] });
  const phrases = parse(phrasesRaw, []);
  const offers = offerRows.filter((offer) => offerAppliesOnDate(offer, date));
  const globalStock = stockRows.filter((item) => item.workDate === "ALL");
  const wristbands = globalStock.length ? globalStock : stockRows.filter((item) => item.workDate === date);
  const phraseIndex = Math.abs(new Date(`${date}T00:00:00Z`).getTime() / 86400000) % Math.max(phrases.length, 1);
  const earlyRule = rotationRules.earlyTripRule || {}; const earlyShift = earlyRule.shiftCode || "AM"; const earlyTrigger = earlyRule.triggerTime || "09:00";
  const hasEarlyTrip = earlyRule.enabled !== false && trips.some((trip) => String(trip.startTime || "").startsWith(earlyTrigger.slice(0, 3)));
  const shifts = Object.fromEntries(shiftDefinitions.map((shift) => [shift.code, shift.code === earlyShift && hasEarlyTrip ? { ...shift, startTime: earlyRule.startTime || "09:00", endTime: earlyRule.endTime || "17:00" } : shift]));
  const rotationPlan = operationsDay?.rotationPlans?.[0] || null;
  const rosterAssignments = applyCashierFallbacks(assignments, cashierConfig);
  return NextResponse.json({
    success: true,
    date,
    source: "PUBLISHED_MONTHLY_SCHEDULE",
    schedule: { id: schedule.id, version: schedule.version, status: schedule.status, publishedAt: schedule.publishedAt, operationalYear: schedule.operationalYear, operationalMonth: schedule.operationalMonth },
    shifts,
    roster: rosterAssignments.map((item) => ({ id: item.id, code: item.code, shiftCode: item.shiftCode, rawValue: item.importRawValue, metadata: item.metadata || (item.importMetadata ? parse(item.importMetadata, null) : null), employee: item.employee })).sort((left, right) => {
      const leftCashier = left.metadata?.frontAssignment === "FRONT_CASHIER" ? 0 : left.employee.department === "CASHIER" ? 1 : 2;
      const rightCashier = right.metadata?.frontAssignment === "FRONT_CASHIER" ? 0 : right.employee.department === "CASHIER" ? 1 : 2;
      return String(left.shiftCode || left.code || "").localeCompare(String(right.shiftCode || right.code || "")) || leftCashier - rightCashier || String(left.employee.name || "").localeCompare(String(right.employee.name || ""));
    }),
    attendance: attendanceDay ? { id: attendanceDay.id, status: attendanceDay.status, records: attendanceDay.records } : null,
    rotation: rotationPlan ? { id: rotationPlan.id, version: rotationPlan.version, status: rotationPlan.status, assignments: rotationPlan.assignments, breaks: rotationPlan.breaks } : null,
    trips, events, offers, notices, wristbands, cashierConfig, rotationRules, branchConfig, motivationalPhrase: phrases[phraseIndex] || "Great teams make great days.",
  });
  } catch (requestError) {
    console.error("Failed to load daily operations roster", { date, error: requestError });
    return NextResponse.json({ success: false, error: "Roster data could not be loaded", detail: requestError instanceof Error ? requestError.message : String(requestError) }, { status: 500 });
  }
}
