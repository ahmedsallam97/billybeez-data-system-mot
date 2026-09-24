import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authorizeApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { getSetting } from "@/lib/settings";
import { buildExpectedTeam, mergeExpectedActual, canAssign, overlaps, generateRotation, normalizeRotationRules, coverageFor, buildReadiness, needsAttention, closeDayValidation } from "@/lib/operations/live-daily";
import { normalizeWeekdays, offerAppliesOnDate, stockAvailable, stockKey } from "@/lib/operations/planning";
import { applyCashierFallbacks } from "@/lib/operations/cashiers";

const validDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
const parseJson = (value) => { try { return JSON.parse(value || "{}"); } catch { return {}; } };
const isToday = (date) => date === new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
function hourlySlots(shifts, team = [], slotCount = 8) { return ["AM", "BW", "PM"].flatMap((shiftCode) => { const shift = shifts[shiftCode]; if (!shift?.startTime || !shift?.endTime || !team.some((item) => item.shiftCode === shiftCode && item.working)) return []; const start = Number(shift.startTime.slice(0, 2)); return Array.from({ length: Math.max(1, Number(slotCount) || 8) }, (_, index) => ({ shiftCode, startTime: `${String((start + index) % 24).padStart(2, "0")}:00`, endTime: `${String((start + index + 1) % 24).padStart(2, "0")}:00` })); }); }

function offerValues(body, userId) {
  const title = String(body.title || "").trim();
  if (!title) throw new Error("Offer title is required");
  const from = validDate(body.effectiveFrom) ? String(body.effectiveFrom) : "2000-01-01";
  const to = validDate(body.effectiveTo) ? String(body.effectiveTo) : "2999-12-31";
  if (from > to) throw new Error("Offer end date must be on or after its start date");
  const weekdays = normalizeWeekdays(body.weekdays);
  const permanent = body.offerMode === "PERMANENT" || (!validDate(body.effectiveFrom) && !validDate(body.effectiveTo));
  return {
    title,
    details: String(body.details || "").trim() || null,
    priceBefore: body.priceBefore === "" || body.priceBefore == null ? null : Number(body.priceBefore),
    priceAfter: body.priceAfter === "" || body.priceAfter == null ? null : Number(body.priceAfter),
    permanent,
    effectiveFrom: permanent ? "2000-01-01" : from,
    effectiveTo: permanent ? "2999-12-31" : to,
    weekdaysJson: JSON.stringify(weekdays),
    startTime: String(body.startTime || "") || null,
    endTime: String(body.endTime || "") || null,
    active: true,
    updatedBy: userId,
  };
}

function bool(value) { return value === true || value === "true" || value === "on" || value === "YES"; }
function braceletFor(stockRows, usageType, offset = 0) {
  const candidates = (stockRows || [])
    .filter((item) => item.stockCategory === "BRACELET" && item.usageType === usageType && stockAvailable(item) > 0)
    .sort((left, right) => stockAvailable(right) - stockAvailable(left) || String(left.color || "").localeCompare(String(right.color || "")));
  if (!candidates.length) return { braceletType: null, braceletColor: null, braceletMaterial: null };
  const item = candidates[offset % candidates.length];
  return { braceletType: item.wristbandType, braceletColor: item.color || null, braceletMaterial: item.material || null };
}

async function loadDaily(date, branch = "MOT") {
  const timelineStart = new Date(`${date}T00:00:00.000Z`);
  const timelineEnd = new Date(`${date}T00:00:00.000Z`);
  timelineEnd.setUTCDate(timelineEnd.getUTCDate() + 1);
  const [schedule, attendanceDay, day, shiftRows, positions, trips, events, offerRows, notices, stockRows, tripPartners, birthdayCustomers, timeline, cashierConfigRaw] = await Promise.all([
    prisma.opsSchedule.findFirst({ where: { status: "PUBLISHED", periodStart: { lte: date }, periodEnd: { gte: date } }, orderBy: { version: "desc" } }),
    prisma.opsAttendanceDay.findFirst({ where: { workDate: date }, include: { records: true }, orderBy: { version: "desc" } }),
    prisma.opsOperationsDay.findFirst({ where: { workDate: date, branch }, include: { rotationPlans: { orderBy: { version: "desc" }, include: { assignments: { include: { employee: { select: { id: true, name: true, jobTitle: true } }, position: true }, orderBy: [{ startTime: "asc" }, { employee: { name: "asc" } }] }, breaks: { include: { employee: { select: { id: true, name: true } } }, orderBy: { startTime: "asc" } } } } }, orderBy: { version: "desc" } }),
    prisma.opsShiftDefinition.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
    prisma.opsOperationalPosition.findMany({ where: { active: true }, include: { staffingRequirements: true }, orderBy: { sortOrder: "asc" } }),
    prisma.opsDailyTrip.findMany({ where: { branch, workDate: date, status: { not: "CANCELLED" } }, orderBy: { startTime: "asc" } }),
    prisma.opsDailyEvent.findMany({ where: { branch, workDate: date, status: { not: "CANCELLED" } }, orderBy: { startTime: "asc" } }),
    prisma.opsDailyOffer.findMany({ where: { branch, active: true }, orderBy: [{ title: "asc" }, { createdAt: "desc" }] }),
    prisma.opsOperationalNotice.findMany({ where: { branch, active: true, effectiveFrom: { lte: date }, OR: [{ effectiveTo: null }, { effectiveTo: { gte: date } }] }, orderBy: { priority: "asc" } }),
    prisma.opsWristbandStock.findMany({ where: { branch, workDate: { in: ["ALL", date] } }, orderBy: [{ workDate: "asc" }, { stockCategory: "asc" }, { wristbandType: "asc" }] }),
    prisma.opsTripPartner.findMany({ where: { branch }, orderBy: { name: "asc" } }),
    prisma.opsBirthdayCustomer.findMany({ where: { branch }, orderBy: [{ customerName: "asc" }, { childName: "asc" }] }),
    prisma.auditLog.findMany({ where: { action: { startsWith: "OPS_" }, createdAt: { gte: timelineStart, lt: timelineEnd } }, include: { user: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 30 }),
    getSetting("OPS_CASHIER_CONFIG", "{}"),
  ]);
  const offers = offerRows.filter((offer) => offerAppliesOnDate(offer, date));
  const globalStock = stockRows.filter((item) => item.workDate === "ALL");
  const wristbands = globalStock.length ? globalStock : stockRows.filter((item) => item.workDate === date);
  const amStartsAtNine = trips.some((trip) => String(trip.startTime || "").startsWith("09:"));
  const shifts = Object.fromEntries(shiftRows.map((item) => [item.code, item.code === "AM" && amStartsAtNine ? { ...item, startTime: "09:00", endTime: "17:00" } : item]));
  const rawScheduleAssignments = schedule ? await prisma.opsScheduleAssignment.findMany({ where: { scheduleId: schedule.id, workDate: date }, include: { employee: { select: { id: true, name: true, nameEn: true, operationalName: true, gender: true, operationsTeamLeader: true, hrisNumber: true, localEmployeeCode: true, jobTitle: true, department: true, employmentType: true, employmentStatus: true, active: true } } }, orderBy: [{ shiftCode: "asc" }, { employee: { name: "asc" } }] }) : [];
  const scheduleAssignments = applyCashierFallbacks(rawScheduleAssignments, parseJson(cashierConfigRaw));
  const expected = buildExpectedTeam(scheduleAssignments, shifts);
  const live = isToday(date);
  const team = mergeExpectedActual(expected, attendanceDay?.records || [], live).map((item) => ({ ...item, liveDay: live }));
  const employeeIds = team.map((item) => item.employeeId);
  const qualifications = employeeIds.length ? await prisma.employeeQualification.findMany({ where: { employeeId: { in: employeeIds } }, include: { position: true } }) : [];
  const plan = day?.rotationPlans?.find((item) => ["ACTIVE", "DRAFT"].includes(item.status)) || day?.rotationPlans?.[0] || null;
  const assignments = plan?.assignments || [];
  const breaks = plan?.breaks || [];
  const coverage = coverageFor({ workDate: date, team, positions, qualifications, assignments });
  const readiness = buildReadiness({ schedule, team, liveDay: live, attendanceDay, coverage, rotationAssignments: assignments, breaks, trips, wristbands, notices });
  const attention = needsAttention({ readiness, team, coverage, qualifications, breaks, trips, wristbands, notices });
  const close = closeDayValidation({ attendanceDay, alerts: attention, rotationAssignments: assignments, breaks });
  return { date, branch, liveMode: live ? "LIVE" : "PLANNING", schedule, attendanceDay, day, shifts, positions, expected, team, qualifications, plan, assignments, breaks, coverage, readiness, attention, close, trips, events, offers, offerCatalog: offerRows, notices, wristbands, tripPartners, birthdayCustomers, timeline };
}

function serialize(data) {
  return { success: true, date: data.date, branch: data.branch, liveMode: data.liveMode, source: "PUBLISHED_MONTHLY_SCHEDULE", schedule: data.schedule ? { id: data.schedule.id, version: data.schedule.version, status: data.schedule.status, periodStart: data.schedule.periodStart, periodEnd: data.schedule.periodEnd, publishedAt: data.schedule.publishedAt } : null, attendanceDay: data.attendanceDay, day: data.day ? { ...data.day, rotationPlans: undefined } : null, shifts: data.shifts, positions: data.positions, expected: data.expected, team: data.team, qualifications: data.qualifications, rotation: data.plan ? { id: data.plan.id, version: data.plan.version, status: data.plan.status, assignments: data.assignments, breaks: data.breaks } : null, coverage: data.coverage, readiness: data.readiness, attention: data.attention, close: data.close, trips: data.trips, events: data.events, offers: data.offers, offerCatalog: data.offerCatalog, notices: data.notices, wristbands: data.wristbands, tripPartners: data.tripPartners, birthdayCustomers: data.birthdayCustomers, timeline: data.timeline.map((item) => ({ id: item.id, action: item.action, summary: item.summary, createdAt: item.createdAt, user: item.user?.name || "System" })) };
}

export async function GET(request) {
  const { error } = await authorizeApi("OPS_SCHEDULE_READ"); if (error) return error;
  const url = new URL(request.url); const date = String(url.searchParams.get("date") || ""); const branch = String(url.searchParams.get("branch") || "MOT");
  if (!validDate(date)) return NextResponse.json({ success: false, error: "Invalid date" }, { status: 400 });
  return NextResponse.json(serialize(await loadDaily(date, branch)));
}

async function ensureDay(date, branch, user, teamNote = "") {
  let day = await prisma.opsOperationsDay.findFirst({ where: { workDate: date, branch }, orderBy: { version: "desc" } });
  if (day) return day;
  const schedule = await prisma.opsSchedule.findFirst({ where: { status: "PUBLISHED", periodStart: { lte: date }, periodEnd: { gte: date } } });
  if (!schedule) throw new Error("A published schedule is required");
  day = await prisma.opsOperationsDay.create({ data: { workDate: date, branch, teamNote: String(teamNote || "").trim() || null } });
  await writeAudit({ action: "OPS_DAY_OPENED", user, summary: `Opened operations day ${date}`, metadata: { dayId: day.id, scheduleId: schedule.id, branch } });
  return day;
}

export async function POST(request) {
  const { user, error } = await authorizeApi("OPS_DAILY_MANAGE"); if (error) return error;
  const body = await request.json(); const date = String(body.date || ""); const branch = String(body.branch || "MOT");
  if (!validDate(date)) return NextResponse.json({ success: false, error: "Invalid date" }, { status: 400 });
  try {
    if (body.action === "open") return NextResponse.json({ success: true, day: await ensureDay(date, branch, user, body.teamNote) }, { status: 201 });
    if (body.action === "generateRotation") {
      const day = await ensureDay(date, branch, user); if (day.status === "CLOSED") throw new Error("Closed days must be reopened before rotation changes");
      const data = await loadDaily(date, branch); const rotationRules = normalizeRotationRules(parseJson(await getSetting("OPS_ROTATION_RULES", "{}"))); const slots = hourlySlots(data.shifts, data.team, rotationRules.slotsPerShift || 8); const fixedAssignments = rotationRules.preserveManualLocks ? data.assignments.filter((item) => item.manualLock || item.source === "MANUAL") : []; const generated = generateRotation({ workDate: date, team: data.team, positions: data.positions, qualifications: data.qualifications, breaks: data.breaks, slots, rules: rotationRules, fixedAssignments });
      const latestVersion = data.day?.rotationPlans?.[0]?.version || 0;
       const plan = await prisma.$transaction(async (tx) => { await tx.opsRotationPlan.updateMany({ where: { operationsDayId: day.id, status: { in: ["DRAFT", "ACTIVE"] } }, data: { status: "SUPERSEDED" } }); return tx.opsRotationPlan.create({ data: { operationsDayId: day.id, branch, version: latestVersion + 1, status: "ACTIVE", generatedBy: user.id, generatedAt: new Date(), generationSnapshotJson: JSON.stringify({ alerts: generated.alerts, slots, rules: rotationRules }), assignments: { create: generated.assignments.map((item) => ({ employeeId: item.employeeId, operationalPositionId: item.operationalPositionId, startTime: item.startTime, endTime: item.endTime, source: item.source === "MANUAL" ? "MANUAL" : "AUTO", manualLock: Boolean(item.manualLock), overrideReason: item.overrideReason || null, createdBy: user.id, updatedBy: user.id })) } }, include: { assignments: true } }); });
      await writeAudit({ action: "OPS_ROTATION_GENERATED", user, summary: `Generated rotation for ${date}`, metadata: { dayId: day.id, planId: plan.id, version: plan.version, assignmentCount: plan.assignments.length, shortageCount: generated.alerts.length, branch } });
      return NextResponse.json({ success: true, plan, alerts: generated.alerts });
    }
    if (body.action === "manualAssignment") {
      const data = await loadDaily(date, branch); if (!data.day || data.day.status === "CLOSED") throw new Error("Open operations day required");
      const member = data.team.find((item) => item.employeeId === body.employeeId && item.working); const position = data.positions.find((item) => item.id === body.operationalPositionId); if (!member || !position) throw new Error("Expected employee and operational position are required");
      if (!canAssign({ qualifications: data.qualifications, employeeId: member.employeeId, position })) throw new Error("Restricted or not qualified employees cannot be assigned");
      if (!body.startTime || !body.endTime || !String(body.reason || "").trim()) throw new Error("Time range and override reason are required");
      if (body.startTime >= body.endTime) throw new Error("A valid assignment time range is required");
      if (data.breaks.some((item) => item.employeeId === member.employeeId && item.status !== "CANCELLED" && overlaps(item.startTime, item.endTime, body.startTime, body.endTime))) throw new Error("Assignment conflicts with an employee break");
      if (data.assignments.some((item) => item.employeeId === member.employeeId && overlaps(item.startTime, item.endTime, body.startTime, body.endTime))) throw new Error("Employee already has a rotation assignment in this time range");
      let plan = data.plan; if (!plan || !["ACTIVE", "DRAFT"].includes(plan.status)) plan = await prisma.opsRotationPlan.create({ data: { operationsDayId: data.day.id, branch, version: (data.day.rotationPlans?.[0]?.version || 0) + 1, status: "ACTIVE", generatedBy: user.id, generatedAt: new Date() } });
      const assignment = await prisma.opsRotationAssignment.create({ data: { rotationPlanId: plan.id, employeeId: member.employeeId, operationalPositionId: position.id, startTime: body.startTime, endTime: body.endTime, source: "MANUAL", manualLock: Boolean(body.manualLock || position.code === "CASHIER"), overrideReason: String(body.reason).trim(), createdBy: user.id, updatedBy: user.id } });
      await writeAudit({ action: "OPS_ROTATION_MANUAL_ASSIGNMENT", user, summary: `Manually assigned ${member.employee.name} to ${position.label}`, metadata: { dayId: data.day.id, planId: plan.id, assignmentId: assignment.id, employeeId: member.employeeId, positionId: position.id, branch, date }, reason: body.reason });
      return NextResponse.json({ success: true, assignment });
    }
    if (body.action === "addBreak") {
      const data = await loadDaily(date, branch); if (!data.day || data.day.status === "CLOSED") throw new Error("Open operations day required"); if (!body.employeeId || !body.startTime || !body.endTime || body.startTime >= body.endTime) throw new Error("Valid employee and break time range are required");
      if (data.assignments.some((item) => item.employeeId === body.employeeId && overlaps(item.startTime, item.endTime, body.startTime, body.endTime))) throw new Error("Break conflicts with a rotation assignment");
      let plan = data.plan; if (!plan || !["ACTIVE", "DRAFT"].includes(plan.status)) plan = await prisma.opsRotationPlan.create({ data: { operationsDayId: data.day.id, branch, version: (data.day.rotationPlans?.[0]?.version || 0) + 1, status: "ACTIVE", generatedBy: user.id, generatedAt: new Date() } });
      const item = await prisma.opsBreakAssignment.create({ data: { rotationPlanId: plan.id, employeeId: body.employeeId, startTime: body.startTime, endTime: body.endTime, status: "PLANNED", note: String(body.note || "").trim() || null, createdBy: user.id, updatedBy: user.id } });
      await writeAudit({ action: "OPS_BREAK_ADDED", user, summary: `Added break for ${date}`, metadata: { breakId: item.id, employeeId: item.employeeId, branch, date, startTime: item.startTime, endTime: item.endTime } }); return NextResponse.json({ success: true, break: item });
    }
    const number = (key) => Math.max(0, Number(body[key] || 0));
    if (body.action === "createTrip") {
      let partner = body.tripPartnerId ? await prisma.opsTripPartner.findFirst({ where: { id: String(body.tripPartnerId), branch } }) : null;
      const partnerName = String(body.name || partner?.name || "").trim();
      if (!partnerName || !body.startTime) throw new Error("Academy and trip start time are required");
      partner = await prisma.opsTripPartner.upsert({
        where: { branch_name: { branch, name: partnerName } },
        update: { supervisorName: String(body.supervisorName || partner?.supervisorName || "").trim() || null, supervisorPhone: String(body.supervisorPhone || partner?.supervisorPhone || "").trim() || null, updatedBy: user.id },
        create: { branch, name: partnerName, supervisorName: String(body.supervisorName || "").trim() || null, supervisorPhone: String(body.supervisorPhone || "").trim() || null, createdBy: user.id, updatedBy: user.id },
      });
      const stockRows = await prisma.opsWristbandStock.findMany({ where: { branch, workDate: "ALL" } });
      const existingCount = await prisma.opsDailyTrip.count({ where: { branch, workDate: date, status: { not: "CANCELLED" } } });
      const bracelet = braceletFor(stockRows, "TRIP", existingCount);
      const record = await prisma.opsDailyTrip.create({ data: { branch, workDate: date, tripPartnerId: partner.id, name: partner.name, startTime: String(body.startTime), endTime: String(body.endTime || "") || null, expectedChildren: number("expectedChildren"), supervisorName: String(body.supervisorName || partner.supervisorName || "").trim() || null, supervisorPhone: String(body.supervisorPhone || partner.supervisorPhone || "").trim() || null, mealIncluded: bool(body.mealIncluded), chickenNuggets: number("chickenNuggets"), beefBurgers: number("beefBurgers"), chickenBurgers: number("chickenBurgers"), ...bracelet, staffingRequired: number("staffingRequired"), notes: String(body.notes || "").trim() || null, createdBy: user.id, updatedBy: user.id } });
      await writeAudit({ action: "OPS_CREATETRIP", user, summary: `Created trip for ${partner.name}`, metadata: { id: record.id, partnerId: partner.id, branch, date } });
      return NextResponse.json({ success: true, record, partner });
    }
    if (body.action === "createEvent") {
      let customer = body.birthdayCustomerId ? await prisma.opsBirthdayCustomer.findFirst({ where: { id: String(body.birthdayCustomerId), branch } }) : null;
      const phone = String(body.customerPhone || customer?.phone || "").trim();
      const customerName = String(body.customerName || customer?.customerName || "").trim();
      const childName = String(body.childName || customer?.childName || "").trim();
      if (!phone || !customerName || !childName || !body.startTime) throw new Error("Customer, phone, child and start time are required");
      customer = await prisma.opsBirthdayCustomer.upsert({ where: { branch_phone: { branch, phone } }, update: { customerName, childName, updatedBy: user.id }, create: { branch, phone, customerName, childName, createdBy: user.id, updatedBy: user.id } });
      const stockRows = await prisma.opsWristbandStock.findMany({ where: { branch, workDate: "ALL" } });
      const existingCount = await prisma.opsDailyEvent.count({ where: { branch, workDate: date, eventType: "BIRTHDAY", status: { not: "CANCELLED" } } });
      const bracelet = braceletFor(stockRows, "BIRTHDAY", existingCount);
      const record = await prisma.opsDailyEvent.create({ data: { branch, workDate: date, birthdayCustomerId: customer.id, name: String(body.name || `${childName} Birthday`).trim(), customerName, customerPhone: phone, childName, startTime: String(body.startTime), endTime: String(body.endTime || "") || null, eventType: "BIRTHDAY", expectedGuests: number("expectedGuests"), chickenNuggets: number("chickenNuggets"), beefBurgers: number("beefBurgers"), chickenBurgers: number("chickenBurgers"), partyRoomHours: body.partyRoomHours ? Number(body.partyRoomHours) : null, ...bracelet, location: String(body.location || "").trim() || null, staffingRequired: number("staffingRequired"), notes: String(body.notes || "").trim() || null, createdBy: user.id, updatedBy: user.id } });
      await writeAudit({ action: "OPS_CREATEEVENT", user, summary: `Created birthday for ${childName}`, metadata: { id: record.id, customerId: customer.id, branch, date } });
      return NextResponse.json({ success: true, record, customer });
    }
    if (body.action === "createOffer") {
      const values = offerValues(body, user.id);
      const record = await prisma.opsDailyOffer.create({ data: { branch, ...values, createdBy: user.id } });
      await writeAudit({ action: "OPS_CREATEOFFER", user, summary: `Created offer ${record.title}`, metadata: { id: record.id, permanent: record.permanent, weekdays: normalizeWeekdays(record.weekdaysJson), branch } });
      return NextResponse.json({ success: true, record });
    }
    if (body.action === "setWristband" || body.action === "setStock") {
      const stockCategory = String(body.stockCategory || "BRACELET");
      const usageType = String(body.usageType || body.wristbandType || "").trim() || null;
      const size = String(body.size || "").trim() || null;
      const rollStyle = String(body.rollStyle || "").trim() || null;
      const material = String(body.material || "").trim() || null;
      const color = String(body.color || "").trim() || null;
      if (stockCategory === "BRACELET" && !usageType) throw new Error("Bracelet usage is required");
      if (stockCategory === "SOCKS" && !size) throw new Error("Sock size is required");
      if (["CASH_ROLL", "VISA_ROLL"].includes(stockCategory) && !rollStyle) throw new Error("Roll style is required");
      const cashierQuantity = number("cashierQuantity");
      const warehouseQuantity = number("warehouseQuantity");
      const wristbandType = stockKey({ stockCategory, usageType, size, rollStyle, color, material });
      const values = { stockCategory, unit: String(body.unit || "ITEM"), color, usageType, material, size, rollStyle, cashierQuantity, warehouseQuantity, availableStock: cashierQuantity + warehouseQuantity, allocated: 0, issued: 0, notes: String(body.notes || "").trim() || null };
      const record = await prisma.opsWristbandStock.upsert({ where: { branch_workDate_wristbandType: { branch, workDate: "ALL", wristbandType } }, update: { ...values, updatedBy: user.id }, create: { branch, workDate: "ALL", wristbandType, ...values, createdBy: user.id, updatedBy: user.id } });
      await writeAudit({ action: "OPS_SETSTOCK", user, summary: `Updated stock ${record.usageType || record.size || record.rollStyle || record.wristbandType}`, metadata: { id: record.id, branch, available: stockAvailable(record), category: stockCategory } });
      return NextResponse.json({ success: true, record });
    }
    if (body.action === "createNotice") {
      if (!body.title || !body.message || !body.effectiveFrom) throw new Error("Notice title, message and start date are required");
      const record = await prisma.opsOperationalNotice.create({ data: { branch, title: String(body.title), message: String(body.message), priority: String(body.priority || "INFO"), effectiveFrom: String(body.effectiveFrom), effectiveTo: String(body.effectiveTo || "") || null, startTime: String(body.startTime || "") || null, endTime: String(body.endTime || "") || null, active: true, createdBy: user.id, updatedBy: user.id } });
      return NextResponse.json({ success: true, record });
    }
    throw new Error("Unknown Daily Operations action");
  } catch (actionError) { return NextResponse.json({ success: false, error: actionError.message }, { status: 409 }); }
}

export async function PATCH(request) {
  const { user, error } = await authorizeApi("OPS_DAILY_MANAGE"); if (error) return error; const body = await request.json();
  try {
    if (body.action === "updateTrip") {
      const current = await prisma.opsDailyTrip.findFirst({ where: { id: String(body.tripId || ""), branch: String(body.branch || "MOT") } });
      if (!current) throw new Error("Trip not found");
      const record = await prisma.opsDailyTrip.update({ where: { id: current.id }, data: { name: String(body.name || current.name).trim(), startTime: String(body.startTime || current.startTime || "") || null, endTime: String(body.endTime || "") || null, expectedChildren: Math.max(0, Number(body.expectedChildren || 0)), supervisorName: String(body.supervisorName || "").trim() || null, supervisorPhone: String(body.supervisorPhone || "").trim() || null, mealIncluded: bool(body.mealIncluded), chickenNuggets: Math.max(0, Number(body.chickenNuggets || 0)), beefBurgers: Math.max(0, Number(body.beefBurgers || 0)), chickenBurgers: Math.max(0, Number(body.chickenBurgers || 0)), staffingRequired: Math.max(0, Number(body.staffingRequired || 0)), notes: String(body.notes || "").trim() || null, updatedBy: user.id } });
      await writeAudit({ action: "OPS_UPDATETRIP", user, summary: `Updated trip ${record.name}`, metadata: { id: record.id, branch: record.branch } });
      return NextResponse.json({ success: true, record });
    }
    if (body.action === "deleteTrip") {
      const record = await prisma.opsDailyTrip.update({ where: { id: String(body.tripId || "") }, data: { status: "CANCELLED", updatedBy: user.id } });
      await writeAudit({ action: "OPS_DELETETRIP", user, summary: `Cancelled trip ${record.name}`, metadata: { id: record.id, branch: record.branch } });
      return NextResponse.json({ success: true, record });
    }
    if (body.action === "updateEvent") {
      const current = await prisma.opsDailyEvent.findFirst({ where: { id: String(body.eventId || ""), branch: String(body.branch || "MOT") } });
      if (!current) throw new Error("Birthday not found");
      const record = await prisma.opsDailyEvent.update({ where: { id: current.id }, data: { name: String(body.name || current.name).trim(), customerName: String(body.customerName || current.customerName || "").trim() || null, customerPhone: String(body.customerPhone || current.customerPhone || "").trim() || null, childName: String(body.childName || current.childName || "").trim() || null, startTime: String(body.startTime || current.startTime || "") || null, endTime: String(body.endTime || "") || null, expectedGuests: Math.max(0, Number(body.expectedGuests || 0)), chickenNuggets: Math.max(0, Number(body.chickenNuggets || 0)), beefBurgers: Math.max(0, Number(body.beefBurgers || 0)), chickenBurgers: Math.max(0, Number(body.chickenBurgers || 0)), partyRoomHours: body.partyRoomHours ? Number(body.partyRoomHours) : null, location: String(body.location || "").trim() || null, staffingRequired: Math.max(0, Number(body.staffingRequired || 0)), notes: String(body.notes || "").trim() || null, updatedBy: user.id } });
      await writeAudit({ action: "OPS_UPDATEEVENT", user, summary: `Updated birthday ${record.name}`, metadata: { id: record.id, branch: record.branch } });
      return NextResponse.json({ success: true, record });
    }
    if (body.action === "deleteEvent") {
      const record = await prisma.opsDailyEvent.update({ where: { id: String(body.eventId || "") }, data: { status: "CANCELLED", updatedBy: user.id } });
      await writeAudit({ action: "OPS_DELETEEVENT", user, summary: `Cancelled birthday ${record.name}`, metadata: { id: record.id, branch: record.branch } });
      return NextResponse.json({ success: true, record });
    }
    if (body.action === "updateOffer") {
      const current = await prisma.opsDailyOffer.findFirst({ where: { id: String(body.offerId || ""), branch: String(body.branch || "MOT") } });
      if (!current) throw new Error("Offer not found");
      const record = await prisma.opsDailyOffer.update({ where: { id: current.id }, data: offerValues(body, user.id) });
      await writeAudit({ action: "OPS_UPDATEOFFER", user, summary: `Updated offer ${record.title}`, metadata: { id: record.id, branch: record.branch } });
      return NextResponse.json({ success: true, record });
    }
    if (body.action === "deleteOffer") {
      const current = await prisma.opsDailyOffer.findFirst({ where: { id: String(body.offerId || ""), branch: String(body.branch || "MOT") } });
      if (!current) throw new Error("Offer not found");
      const record = await prisma.opsDailyOffer.update({ where: { id: current.id }, data: { active: false, updatedBy: user.id } });
      await writeAudit({ action: "OPS_DELETEOFFER", user, summary: `Removed offer ${record.title}`, metadata: { id: record.id, branch: record.branch } });
      return NextResponse.json({ success: true, record });
    }
    if (body.action === "updateBreak") { const current = await prisma.opsBreakAssignment.findUnique({ where: { id: String(body.breakId || "") }, include: { rotationPlan: { include: { operationsDay: true, assignments: true } } } }); if (!current) throw new Error("Break not found"); if (current.rotationPlan.operationsDay.status === "CLOSED") throw new Error("Closed day must be reopened before editing breaks"); const update = { startTime: body.startTime || current.startTime, endTime: body.endTime || current.endTime, status: body.status || current.status, note: body.note === undefined ? current.note : String(body.note || "").trim() || null, updatedBy: user.id }; if (current.rotationPlan.assignments.some((item) => item.employeeId === current.employeeId && overlaps(item.startTime, item.endTime, update.startTime, update.endTime))) throw new Error("Break conflicts with a rotation assignment"); const item = await prisma.opsBreakAssignment.update({ where: { id: current.id }, data: update }); await writeAudit({ action: "OPS_BREAK_UPDATED", user, summary: `Updated break ${item.id}`, metadata: { breakId: item.id, before: { startTime: current.startTime, endTime: current.endTime, status: current.status }, after: update } }); return NextResponse.json({ success: true, break: item }); }
    const day = await prisma.opsOperationsDay.findUnique({ where: { id: String(body.dayId || "") } }); if (!day) throw new Error("Operations day not found");
    if (body.action === "close") { const data = await loadDaily(day.workDate, day.branch); if (!data.close.ready && !(body.override && String(body.reason || "").trim())) return NextResponse.json({ success: false, error: "Close Day checklist is not ready", blockers: data.close.blockers }, { status: 409 }); const updated = await prisma.opsOperationsDay.update({ where: { id: day.id }, data: { status: "CLOSED", readinessScore: data.readiness.score, readinessSnapshotJson: JSON.stringify({ readiness: data.readiness, attention: data.attention, close: data.close }), closedBy: user.id, closedAt: new Date(), teamNote: String(body.teamNote || day.teamNote || "").trim() || null, handoverNote: String(body.handoverNote || "").trim() || null } }); await prisma.opsRotationPlan.updateMany({ where: { operationsDayId: day.id, status: "ACTIVE" }, data: { status: "CLOSED" } }); await writeAudit({ action: body.override ? "OPS_DAY_CLOSED_OVERRIDE" : "OPS_DAY_CLOSED", user, summary: `Closed operations day ${day.workDate}`, metadata: { dayId: day.id, branch: day.branch, readinessScore: data.readiness.score, blockers: data.close.blockers }, reason: body.reason }); return NextResponse.json({ success: true, day: updated }); }
    if (body.action === "reopen") { if (day.status !== "CLOSED" || !String(body.reason || "").trim()) throw new Error("Closed day and reopen reason are required"); const updated = await prisma.opsOperationsDay.update({ where: { id: day.id }, data: { status: "REOPENED", reopenedBy: user.id, reopenedAt: new Date(), reopenReason: String(body.reason).trim() } }); await writeAudit({ action: "OPS_DAY_REOPENED", user, summary: `Reopened operations day ${day.workDate}`, metadata: { dayId: day.id, branch: day.branch }, reason: body.reason }); return NextResponse.json({ success: true, day: updated }); }
    throw new Error("Unknown action");
  } catch (actionError) { return NextResponse.json({ success: false, error: actionError.message }, { status: 409 }); }
}
