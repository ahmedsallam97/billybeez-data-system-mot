import { withAccountAccess } from '@/lib/accounts/routes';
import {readScheduleState,publishedScheduleForBranch,scheduleBranch} from "@/lib/operations/schedule-state";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authorizeApi } from "@/lib/api-auth";
import { getSetting } from "@/lib/settings";
import { offerAppliesOnDate } from "@/lib/operations/planning";
import { orderRoster } from "@/lib/operations/roster";
import { dayRoles, applyDayRoles } from "@/lib/operations/day-responsibilities";
import { applyCashierFallbacks } from "@/lib/operations/cashiers";
import { loadBraceletRoster } from "@/lib/operations/bracelet-roster-service";

async function GETHandler(request) {
  const { user,error } = await authorizeApi("OPS_SCHEDULE_READ");
  if (error) return error;
  const date = String(new URL(request.url).searchParams.get("date") || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ success: false, error: "Date must use YYYY-MM-DD" }, { status: 400 });
  try {
  const parse = (value, fallback) => { try { return JSON.parse(value); } catch { return fallback; } };
  const branchConfig = parse(await getSetting("OPS_BRANCH_CONFIG", "{}"), {});
  const branch = await scheduleBranch(prisma,user,new URL(request.url).searchParams.get("branch"));
  const rotationRules = parse(await getSetting("OPS_ROTATION_RULES", "{}"), {});
  const schedule = await publishedScheduleForBranch(prisma,date,branch);
  if (!schedule) return NextResponse.json({ success: true, date, schedule: null, roster: [] });
  const [assignments, shiftDefinitions, operationsDay, attendanceDay, trips, events, offerRows, notices, stockRows, cashierConfigRaw, phrasesRaw] = await Promise.all([
    prisma.opsScheduleAssignment.findMany({ where: { scheduleId: schedule.id, workDate: date, employee: { department: { in: ["OPERATION", "CASHIER"] } } }, include: { employee: { select: { id: true, name: true, nameEn: true, operationalName: true, gender: true, operationsTeamLeader: true, hrisNumber: true, localEmployeeCode: true, jobTitle: true, department: true } } }, orderBy: [{ shiftCode: "asc" }, { employee: { name: "asc" } }] }),
    prisma.opsShiftDefinition.findMany({ where: { active: true }, select: { code: true, label: true, labelAr: true, startTime: true, endTime: true }, orderBy: { sortOrder: "asc" } }),
    prisma.opsOperationsDay.findFirst({
      where: { workDate: date, branch },
      orderBy: { version: "desc" },
      include: {
        rotationPlans: {
          where: { status: { in: ["ACTIVE", "DRAFT"] } },
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
  const braceletRoster = await loadBraceletRoster(prisma, { branch, date, items: wristbands, day: operationsDay, context:{hasTrips:trips.length>0,hasBirthdays:events.some(item=>item.eventType==='BIRTHDAY')} });
  const phraseIndex = Math.abs(new Date(`${date}T00:00:00Z`).getTime() / 86400000) % Math.max(phrases.length, 1);
  const earlyRule = rotationRules.earlyTripRule || {}; const earlyShift = earlyRule.shiftCode || "AM"; const earlyTrigger = earlyRule.triggerTime || "09:00";
  const hasEarlyTrip = earlyRule.enabled !== false && trips.some((trip) => String(trip.startTime || "").startsWith(earlyTrigger.slice(0, 3)));
  const shifts = Object.fromEntries(shiftDefinitions.map((shift) => [shift.code, shift.code === earlyShift && hasEarlyTrip ? { ...shift, startTime: earlyRule.startTime || "09:00", endTime: earlyRule.endTime || "17:00" } : shift]));
  const rotationPlan = operationsDay?.rotationPlans?.[0] || null;
  const scheduleState=(await readScheduleState(prisma,schedule.id)).state;
  const savedOrder=scheduleState.displayOrder || [];
  const responsibilities=dayRoles(scheduleState,date);
  const rosterAssignments = applyCashierFallbacks(assignments, cashierConfig);
  return NextResponse.json({
    success: true,
    date,
    source: "PUBLISHED_MONTHLY_SCHEDULE",
    schedule: { id: schedule.id, version: schedule.version, status: schedule.status, publishedAt: schedule.publishedAt, operationalYear: schedule.operationalYear, operationalMonth: schedule.operationalMonth },
    shifts,
    roster: orderRoster(applyDayRoles(rosterAssignments.map((item) => ({ id: item.id, code: item.code, shiftCode: item.shiftCode, rawValue: item.importRawValue, metadata: item.metadata || (item.importMetadata ? parse(item.importMetadata, null) : null), employee: item.employee })),responsibilities),savedOrder),
    branch, responsibilities, braceletRoster,
    attendance: attendanceDay ? { id: attendanceDay.id, status: attendanceDay.status, records: attendanceDay.records } : null,
    rotation: rotationPlan ? { id: rotationPlan.id, version: rotationPlan.version, status: rotationPlan.status, assignments: rotationPlan.assignments, breaks: rotationPlan.breaks } : null,
    trips: trips.map(item=>({...item,responsibleEmployee:rosterAssignments.find(row=>row.employeeId===(responsibilities.trips[item.id]||responsibilities.TRIP))?.employee || null})), events: events.map(item=>({...item,responsibleEmployee:rosterAssignments.find(row=>row.employeeId===(responsibilities.birthdays[item.id]||responsibilities.BIRTHDAY))?.employee || null})), offers, notices, wristbands, cashierConfig, rotationRules, branchConfig, motivationalPhrase: phrases[phraseIndex] || "Great teams make great days.",
  });
  } catch (requestError) {
    console.error("Failed to load daily operations roster", { date, error: requestError });
    return NextResponse.json({ success: false, error: "Roster data could not be loaded", detail: requestError instanceof Error ? requestError.message : String(requestError) }, { status: 500 });
  }
}

export const GET=withAccountAccess(GETHandler);
