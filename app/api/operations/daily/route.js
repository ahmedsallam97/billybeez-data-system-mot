import { withAccountAccess } from '@/lib/accounts/routes';
import {readScheduleState,orderedRows,publishedScheduleForBranch} from "@/lib/operations/schedule-state";
import { NextResponse } from "next/server";
import { assertUniqueTrip } from "@/lib/operations/trip-identity";
import { prisma, basePrisma } from "@/lib/db";
import { resolveScope } from '@/lib/accounts/enforcement';
import { authorizeApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { getSetting } from "@/lib/settings";
import { dayRoles, applyDayRoles } from "@/lib/operations/day-responsibilities";
import { buildExpectedTeam, mergeExpectedActual, canAssign, overlaps, hasPositionConflict, generateRotation, normalizeRotationRules, coverageFor, buildReadiness, needsAttention, closeDayValidation } from "@/lib/operations/live-daily";
import { colorNameFor, normalizeWeekdays, offerAppliesOnDate, selectBraceletStock, stockAvailable, stockCanDelete, stockIssueUpdate, stockKey } from "@/lib/operations/planning";
import { applyCashierFallbacks } from "@/lib/operations/cashiers";
import { braceletStockIdentity } from "@/lib/operations/bracelet-roster";
import { loadBraceletRoster, saveBraceletRoster } from "@/lib/operations/bracelet-roster-service";
import { ensureAutomaticShiftLeadershipReports } from "@/lib/operations/operational-report-service";
import { operationsBranch } from "@/lib/operations/business-access";
import {loadDistributions,validateDistributions,applicableRules} from '@/lib/operations/rotation-distributions';
import {rotationPreview,applyRotation} from '@/lib/operations/rotation-service';
import {rotationEditor,changeRotationCell} from '@/lib/operations/rotation-manual';
import {physicalConflict,assignmentPosition} from '@/lib/operations/rotation-locations';
import {handoverRules,handoverBreaks,dataExitBlocked} from '@/lib/operations/rotation-handover';

const readSetting=async(db,key,fallback='{}')=>(await db.systemSetting.findUnique({where:{key}}))?.value??fallback;

const validDate = value => {const text=String(value||"");const date=new Date(text+"T00:00:00Z");return /^\d{4}-\d{2}-\d{2}$/.test(text)&&!Number.isNaN(date.getTime())&&date.toISOString().slice(0,10)===text;};
const validTime=value=>/^([01]\d|2[0-3]):[0-5]\d$/.test(String(value||""));
function validateTimeRange(start,end){if(!validTime(start)||!validTime(end)||start>=end)throw new Error("A valid same-day time range is required");}
function validateDailyBody(body){
 if(!body||typeof body!=="object"||Array.isArray(body))throw new Error("Daily Operations request must be an object");
 for(const key of ["date","effectiveFrom","effectiveTo"])if(body[key]&&!validDate(body[key]))throw new Error("Invalid "+key);
 for(const key of ["startTime","endTime"])if(body[key]&&!validTime(body[key]))throw new Error("Invalid "+key);
 if(body.startTime&&body.endTime)validateTimeRange(body.startTime,body.endTime);
 for(const key of ["expectedChildren","expectedGuests","staffingRequired","chickenNuggets","beefBurgers","chickenBurgers","quantity"]){if(body[key]!==undefined&&(!Number.isInteger(Number(body[key]))||Number(body[key])<0))throw new Error(key+" must be a non-negative whole number");}
 return body;
}
function validateBreak(member,breaks,record){
 validateTimeRange(record.startTime,record.endTime);
 if(!["PLANNED","ACTIVE","COMPLETED","CANCELLED"].includes(record.status))throw new Error("Invalid break status");
 if(record.status==="CANCELLED")return;
 if(!member?.working)throw new Error("Select a working employee from the published schedule");
 if(member.expectedStart&&member.expectedEnd&&member.expectedStart<member.expectedEnd&&(record.startTime<member.expectedStart||record.endTime>member.expectedEnd))throw new Error("Break must be inside the employee shift");
 if(breaks.some(item=>item.id!==record.id&&item.employeeId===record.employeeId&&item.status!=="CANCELLED"&&overlaps(item.startTime,item.endTime,record.startTime,record.endTime)))throw new Error("Employee already has a break in this time range");
}
const parseJson = (value) => { try { return JSON.parse(value || "{}"); } catch { return {}; } };
const isToday = (date, timezone = "Africa/Cairo") => date === new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
function offerValues(body, userId) {
  const title = String(body.title || "").trim();
  if (!title) throw new Error("Offer title is required");
  const from = validDate(body.effectiveFrom) ? String(body.effectiveFrom) : "2000-01-01";
  const to = validDate(body.effectiveTo) ? String(body.effectiveTo) : "2999-12-31";
  if (from > to) throw new Error("Offer end date must be on or after its start date");
  const weekdays = normalizeWeekdays(body.weekdays);
  const permanent = body.offerMode === "PERMANENT" || (!validDate(body.effectiveFrom) && !validDate(body.effectiveTo));
  const priceBefore = body.priceBefore === "" || body.priceBefore == null ? null : Number(body.priceBefore);
  const priceAfter = body.priceAfter === "" || body.priceAfter == null ? null : Number(body.priceAfter);
  const calculatedDiscount = Number.isFinite(priceBefore) && priceBefore > 0 && Number.isFinite(priceAfter)
    ? Math.max(0, Math.min(100, Math.round(((priceBefore - priceAfter) / priceBefore) * 10000) / 100)) : null;
  const discountPercent = body.discountPercent === "" || body.discountPercent == null ? calculatedDiscount : Math.max(0, Math.min(100, Number(body.discountPercent)));
  return {
    title,
    details: String(body.details || "").trim() || null,
    priceBefore,
    priceAfter,
    discountPercent: Number.isFinite(discountPercent) ? discountPercent : null,
    childrenCount: Math.max(1, Math.round(Number(body.childrenCount || 1))),
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
function mealCounts(body) {
  const counts = {};
  for (const [key, value] of Object.entries(body || {})) {
    if (!key.startsWith("meal__")) continue;
    const label = decodeURIComponent(key.slice(6)).trim();
    const quantity = Math.max(0, Math.round(Number(value || 0)));
    if (label && quantity) counts[label] = quantity;
  }
  const legacy = [
    ["Chicken Nuggets", body.chickenNuggets],
    ["Beef Burger", body.beefBurgers],
    ["Chicken Burger", body.chickenBurgers],
  ];
  for (const [label, value] of legacy) {
    const quantity = Math.max(0, Math.round(Number(value || 0)));
    if (quantity && counts[label] == null) counts[label] = quantity;
  }
  return counts;
}
async function stockValues(body) {
  const number = (key) => { const value = Number(body[key] || 0); if (!Number.isSafeInteger(value) || value < 0) throw new Error(key + ' must be a non-negative whole number'); return value; };
  const stockCategory = String(body.stockCategory || "BRACELET").trim().toUpperCase();
  let usageType = String(body.usageType || body.wristbandType || "").trim().toUpperCase() || null;
  const size = String(body.size || "").trim().toUpperCase() || null;
  const rollStyle = String(body.rollStyle || "").trim().toUpperCase() || null;
  let material = String(body.material || "").trim().toUpperCase() || null;
  let color = String(body.color || "").trim() || null;
  let colorName = String(body.colorName || "").trim() || (color ? colorNameFor(color) : null);
  if (stockCategory === "BRACELET") {
    const catalogues = parseJson(await getSetting("OPS_PLANNING_CATALOGS", "{}"));
    ({ usageType, material, color, colorName } = braceletStockIdentity(body, catalogues.stockCatalog));
  }
  if (stockCategory === "SOCKS" && !size) throw new Error("Sock size is required");
  if (["CASH_ROLL", "VISA_ROLL"].includes(stockCategory) && !rollStyle) throw new Error("Roll style is required");
  const cashierQuantity = number("cashierQuantity");
  const warehouseQuantity = number("warehouseQuantity");
  return {
    wristbandType: stockKey({ stockCategory, usageType, size, rollStyle, color, material }),
    values: {
      stockCategory,
      unit: String(body.unit || "ITEM").trim().toUpperCase(),
      color,
      colorName,
      usageType,
      material,
      size,
      rollStyle,
      cashierQuantity,
      warehouseQuantity,
      availableStock: cashierQuantity + warehouseQuantity,
      notes: String(body.notes || "").trim() || null,
    },
  };
}
const emptyBracelet = () => ({ braceletType: null, braceletColor: null, braceletMaterial: null });
const braceletFields = (item) => item ? ({ braceletType: item.wristbandType, braceletColor: item.color || null, braceletMaterial: item.material || null }) : emptyBracelet();

async function reserveBracelets(tx, { branch, usageType, quantity, offset = 0 }) {
  const required = Math.max(0, Number(quantity || 0));
  const rows = await tx.opsWristbandStock.findMany({ where: { branch, workDate: "ALL", stockCategory: "BRACELET", usageType } });
  const item = selectBraceletStock(rows, usageType, required, offset);
  if (!item) return { ...emptyBracelet(), stockId: null, reserved: 0 };
  if (required) {
    const updated = await tx.opsWristbandStock.updateMany({ where: { id: item.id, allocated: item.allocated }, data: { allocated: { increment: required } } });
    if (updated.count !== 1) throw new Error("Bracelet stock changed while saving; try again");
  }
  return { ...braceletFields(item), stockId: item.id, reserved: required };
}

async function updateBraceletReservation(tx, { branch, current, quantity, usageType, offset = 0 }) {
  const nextQuantity = Math.max(0, Number(quantity || 0));
  const previousQuantity = Math.max(0, Number(current?.expectedChildren ?? current?.expectedGuests ?? 0));
  if (!current?.braceletType) return reserveBracelets(tx, { branch, usageType, quantity: nextQuantity, offset });
  const stock = await tx.opsWristbandStock.findFirst({ where: { branch, workDate: "ALL", wristbandType: current.braceletType } });
  if (!stock) return { braceletType: current.braceletType, braceletColor: current.braceletColor || null, braceletMaterial: current.braceletMaterial || null, stockId: null, reserved: 0 };
  const delta = nextQuantity - previousQuantity;
  if (delta > 0) {
    if (stockAvailable(stock) < delta) throw new Error(`Not enough ${usageType.toLowerCase()} bracelet stock for the new headcount`);
    const updated = await tx.opsWristbandStock.updateMany({ where: { id: stock.id, allocated: stock.allocated }, data: { allocated: { increment: delta } } });
    if (updated.count !== 1) throw new Error("Bracelet stock changed while saving; try again");
  } else if (delta < 0) {
    await tx.opsWristbandStock.update({ where: { id: stock.id }, data: { allocated: Math.max(0, Number(stock.allocated || 0) + delta) } });
  }
  return { ...braceletFields(stock), stockId: stock.id, reserved: nextQuantity };
}

async function releaseBraceletReservation(tx, record) {
  if (!record?.braceletType) return;
  const stock = await tx.opsWristbandStock.findFirst({ where: { branch: record.branch, workDate: "ALL", wristbandType: record.braceletType } });
  if (!stock) return;
  const quantity = Math.max(0, Number(record.expectedChildren ?? record.expectedGuests ?? 0));
  await tx.opsWristbandStock.update({ where: { id: stock.id }, data: { allocated: Math.max(0, Number(stock.allocated || 0) - quantity) } });
}

async function assignPendingBracelets(tx, { branch, usageType }) {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const pending = usageType === "TRIP"
    ? await tx.opsDailyTrip.findMany({ where: { branch, workDate: { gte: today }, status: { not: "CANCELLED" }, braceletType: null }, orderBy: [{ workDate: "asc" }, { createdAt: "asc" }] })
    : await tx.opsDailyEvent.findMany({ where: { branch, workDate: { gte: today }, eventType: "BIRTHDAY", status: { not: "CANCELLED" }, braceletType: null }, orderBy: [{ workDate: "asc" }, { createdAt: "asc" }] });
  for (let index = 0; index < pending.length; index += 1) {
    const booking = pending[index];
    const quantity = usageType === "TRIP" ? booking.expectedChildren : booking.expectedGuests;
    const reservation = await reserveBracelets(tx, { branch, usageType, quantity, offset: index });
    if (!reservation.stockId) continue;
    const data = { braceletType: reservation.braceletType, braceletColor: reservation.braceletColor, braceletMaterial: reservation.braceletMaterial };
    if (usageType === "TRIP") await tx.opsDailyTrip.update({ where: { id: booking.id }, data });
    else await tx.opsDailyEvent.update({ where: { id: booking.id }, data });
  }
}

async function loadDaily(date, branch = "MOT", client = prisma) {
  const timelineStart = new Date(`${date}T00:00:00.000Z`);
  const timelineEnd = new Date(`${date}T00:00:00.000Z`);
  timelineEnd.setUTCDate(timelineEnd.getUTCDate() + 1);
  const [schedule, attendanceDay, day, shiftRows, positions, trips, events, offerRows, notices, stockRows, tripPartners, birthdayCustomers, timeline, cashierConfigRaw, branchConfigRaw, rotationRulesRaw] = await Promise.all([
    publishedScheduleForBranch(client,date,branch),
    client.opsAttendanceDay.findFirst({ where: { workDate: date }, include: { records: true }, orderBy: { version: "desc" } }),
    client.opsOperationsDay.findFirst({ where: { workDate: date, branch }, include: { rotationPlans: { orderBy: { version: "desc" }, include: { assignments: { include: { employee: { select: { id: true, name: true, jobTitle: true } }, position: true }, orderBy: [{ startTime: "asc" }, { employee: { name: "asc" } }] }, breaks: { include: { employee: { select: { id: true, name: true } } }, orderBy: { startTime: "asc" } } } } }, orderBy: { version: "desc" } }),
    client.opsShiftDefinition.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
    client.opsOperationalPosition.findMany({ include: { staffingRequirements: true }, orderBy: { sortOrder: "asc" } }),
    client.opsDailyTrip.findMany({ where: { branch, workDate: date, status: { not: "CANCELLED" } }, orderBy: { startTime: "asc" } }),
    client.opsDailyEvent.findMany({ where: { branch, workDate: date, status: { not: "CANCELLED" } }, orderBy: { startTime: "asc" } }),
    client.opsDailyOffer.findMany({ where: { branch, active: true }, orderBy: [{ title: "asc" }, { createdAt: "desc" }] }),
    client.opsOperationalNotice.findMany({ where: { branch, active: true, effectiveFrom: { lte: date }, OR: [{ effectiveTo: null }, { effectiveTo: { gte: date } }] }, orderBy: { priority: "asc" } }),
    client.opsWristbandStock.findMany({ where: { branch, workDate: { in: ["ALL", date] } }, orderBy: [{ workDate: "asc" }, { stockCategory: "asc" }, { wristbandType: "asc" }] }),
    client.opsTripPartner.findMany({ where: { branch }, orderBy: { name: "asc" } }),
    client.opsBirthdayCustomer.findMany({ where: { branch }, orderBy: [{ customerName: "asc" }, { childName: "asc" }] }),
    client.auditLog.findMany({ where: { action: { startsWith: "OPS_" }, createdAt: { gte: timelineStart, lt: timelineEnd } }, include: { user: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 30 }),
    readSetting(client,"OPS_CASHIER_CONFIG", "{}"),
    readSetting(client,"OPS_BRANCH_CONFIG", "{}"),
    readSetting(client,"OPS_ROTATION_RULES", "{}"),
  ]);
  const offers = offerRows.filter((offer) => offerAppliesOnDate(offer, date));
  const globalStock = stockRows.filter((item) => item.workDate === "ALL");
  const wristbands = globalStock.length ? globalStock : stockRows.filter((item) => item.workDate === date);
  const braceletRoster = await loadBraceletRoster(client, { branch, date, items: wristbands, day, context:{hasTrips:trips.length>0,hasBirthdays:events.some(item=>item.eventType==='BIRTHDAY')} });
  const branchConfig = parseJson(branchConfigRaw); const rotationRules = parseJson(rotationRulesRaw); const earlyRule = rotationRules.earlyTripRule || {};
  const earlyShift = earlyRule.shiftCode || "AM"; const earlyTrigger = earlyRule.triggerTime || "09:00";
  const hasEarlyTrip = earlyRule.enabled !== false && trips.some((trip) => String(trip.startTime || "").startsWith(earlyTrigger.slice(0, 3)));
  const shifts = Object.fromEntries(shiftRows.map((item) => [item.code, item.code === earlyShift && hasEarlyTrip ? { ...item, startTime: earlyRule.startTime || "09:00", endTime: earlyRule.endTime || "17:00" } : item]));
  const rawScheduleAssignments = schedule ? await client.opsScheduleAssignment.findMany({ where: { scheduleId: schedule.id, workDate: date }, include: { employee: { select: { id: true, name: true, nameEn: true, operationalName: true, gender: true, operationsTeamLeader: true, hrisNumber: true, localEmployeeCode: true, jobTitle: true, department: true, employmentType: true, employmentStatus: true, active: true } } }, orderBy: [{ shiftCode: "asc" }, { employee: { name: "asc" } }] }) : [];
  const scheduleState=schedule?(await readScheduleState(client,schedule.id)).state:{};
  const responsibilities=dayRoles(scheduleState,date);
  const scheduleOrder=scheduleState.displayOrder || [];
  const scheduleAssignments = orderedRows(applyCashierFallbacks(rawScheduleAssignments, parseJson(cashierConfigRaw)),scheduleOrder);
  const expected = buildExpectedTeam(applyDayRoles(scheduleAssignments, responsibilities), shifts);
  const live = isToday(date, branchConfig.timezone || "Africa/Cairo");
  const team = mergeExpectedActual(expected, attendanceDay?.records || [], live).map((item) => ({ ...item, liveDay: live }));
  const employeeIds = team.map((item) => item.employeeId);
  const qualifications = employeeIds.length ? await client.employeeQualification.findMany({ where: { employeeId: { in: employeeIds } }, include: { position: true } }) : [];
  const plan = day?.rotationPlans?.find((item) => ["ACTIVE", "DRAFT"].includes(item.status)) || day?.rotationPlans?.[0] || null;
  const assignments = (plan?.assignments || []).map(a=>({...a,shiftCode:team.find(m=>m.employeeId===a.employeeId)?.shiftCode}));
  const breaks = plan?.breaks || [];
  const distributions=await loadDistributions(client,{branch,positions,legacy:rotationRules,defaultBranch:branchConfig.branchCode||'MOT'});
  const coverage = coverageFor({ workDate: date, team, positions, qualifications, assignments, rules: rotationRules,distributions });
  const readiness = buildReadiness({ schedule, team, liveDay: live, attendanceDay, coverage, rotationAssignments: assignments, breaks, trips, wristbands, notices });
  const attention = needsAttention({ readiness, team, coverage, qualifications, breaks, trips, wristbands, notices });
  const close = closeDayValidation({ attendanceDay, alerts: attention, rotationAssignments: assignments, breaks });
  return { date, branch, branchConfig, liveMode: live ? "LIVE" : "PLANNING", schedule, attendanceDay, day, shifts, positions, expected, team, qualifications, plan, assignments, breaks, coverage, readiness, attention, close, trips, events, offers, offerCatalog: offerRows, notices, wristbands, braceletRoster, tripPartners, birthdayCustomers, timeline,distributions,rotationRules };
}

function serialize(data) {
  return { success: true, date: data.date, branch: data.branch, branchConfig: data.branchConfig, liveMode: data.liveMode, source: "PUBLISHED_MONTHLY_SCHEDULE", schedule: data.schedule ? { id: data.schedule.id, version: data.schedule.version, status: data.schedule.status, periodStart: data.schedule.periodStart, periodEnd: data.schedule.periodEnd, publishedAt: data.schedule.publishedAt } : null, attendanceDay: data.attendanceDay, day: data.day ? { ...data.day, rotationPlans: undefined } : null, shifts: data.shifts, positions: data.positions, expected: data.expected, team: data.team, qualifications: data.qualifications, rotation: data.plan ? { id: data.plan.id, version: data.plan.version, status: data.plan.status, assignments: data.assignments, breaks: data.breaks } : null, coverage: data.coverage, readiness: data.readiness, attention: data.attention, close: data.close, trips: data.trips, events: data.events, offers: data.offers, offerCatalog: data.offerCatalog, notices: data.notices, wristbands: data.wristbands, braceletRoster: data.braceletRoster, tripPartners: data.tripPartners, birthdayCustomers: data.birthdayCustomers, timeline: data.timeline.map((item) => ({ id: item.id, action: item.action, summary: item.summary, createdAt: item.createdAt, user: item.user?.name || "System" })) };
}

async function GETHandler(request) {
  const { user, error } = await authorizeApi("OPS_SCHEDULE_READ"); if (error) return error;
  const url = new URL(request.url); const date = String(url.searchParams.get("date") || ""); const configuredBranch = parseJson(await getSetting("OPS_BRANCH_CONFIG", "{}")); const branch = String(url.searchParams.get("branch") || configuredBranch.branchCode || "MOT");
  if (!validDate(date)) return NextResponse.json({ success: false, error: "Invalid date" }, { status: 400 });
  if(url.searchParams.get('view')==='rotationEditor'){
    try {
      await operationsBranch(prisma,user,branch);
      const scope=await resolveScope(basePrisma,user,'rotations.assign');
      if(!scope.unrestricted&&!scope.branches.includes(branch))throw Object.assign(new Error('Branch access denied'),{status:403});
      const editor=rotationEditor(await loadDaily(date,branch,basePrisma));
      if(!scope.unrestricted)editor.cells=editor.cells.filter(cell=>scope.employeeIds.includes(cell.employeeId));
      return NextResponse.json({success:true,editor});
    }
    catch(error){return NextResponse.json({success:false,error:error.message},{status:error.status||400});}
  }
  const payload=serialize(await loadDaily(date, branch));
  const view=url.searchParams.get('view'),context={success:true,date:payload.date,branch:payload.branch,branchConfig:{branchCode:payload.branchConfig.branchCode}};
  // The offer-management catalog also needs inactive offers. The daily roster
  // continues to use only applicable active offers from loadDaily.
  if(view === 'offers') payload.offerCatalog = await prisma.opsDailyOffer.findMany({where:{branch},orderBy:[{title:'asc'},{createdAt:'desc'}]});
  if(['attendance','evaluation'].includes(view))return NextResponse.json({...context,schedule:payload.schedule});
  const fields={trips:['trips','tripPartners'],birthdays:['events','birthdayCustomers'],offers:['offers','offerCatalog'],stock:['wristbands']}[view];
  if(fields)return NextResponse.json({...context,...Object.fromEntries(fields.map(key=>[key,payload[key]]))});
  return NextResponse.json(payload);
}

async function ensureDay(date, branch, user, teamNote = "") {
  let day = await prisma.opsOperationsDay.findFirst({ where: { workDate: date, branch }, orderBy: { version: "desc" } });
  if (day) return day;
  const schedule = await publishedScheduleForBranch(prisma,date,branch);
  if (!schedule) throw new Error("A published schedule is required");
  day = await prisma.opsOperationsDay.create({ data: { workDate: date, branch, teamNote: String(teamNote || "").trim() || null } });
  await writeAudit({ action: "OPS_DAY_OPENED", user, summary: `Opened operations day ${date}`, metadata: { dayId: day.id, scheduleId: schedule.id, branch } });
  return day;
}

async function POSTHandler(request) {
  const { user, error } = await authorizeApi("OPS_DAILY_MANAGE"); if (error) return error;
  let body;try{body=validateDailyBody(await request.json());}catch(error){return NextResponse.json({success:false,error:error instanceof SyntaxError?"Invalid JSON body":error.message},{status:400});} const date = String(body.date || ""); const configuredBranch = parseJson(await getSetting("OPS_BRANCH_CONFIG", "{}")); const branch = String(body.branch || configuredBranch.branchCode || "MOT");
  if (!validDate(date)) return NextResponse.json({ success: false, error: "Invalid date" }, { status: 400 });
  try {
    if (body.action === "open") {
      await operationsBranch(prisma, user, branch);
      const day = await ensureDay(date, branch, user, body.teamNote);
      const leadershipReports = await ensureAutomaticShiftLeadershipReports(prisma, { user, day });
      return NextResponse.json({ success: true, day, leadershipReports }, { status: 201 });
    }
    if (body.action === 'changeRotationCell') {
      await operationsBranch(prisma,user,branch);
      const scope=await resolveScope(basePrisma,user,'rotations.assign');
      if(!scope.unrestricted&&!scope.branches.includes(branch))throw Object.assign(new Error('Branch access denied'),{status:403});
      if(!scope.unrestricted&&!scope.employeeIds.includes(body.employeeId))throw Object.assign(new Error('Employee access denied'),{status:403});
      // Read the whole branch plan to preserve colleagues outside the editor's employee scope.
      const {plan}=await changeRotationCell(basePrisma,{user,date,branch,body,loadDaily});
      return NextResponse.json({success:true,plan:{id:plan.id,version:plan.version,status:plan.status}});
    }
    if (['previewRotation','generateRotation'].includes(body.action)) {
      await operationsBranch(prisma,user,branch);
      if(body.shift&&!['AM','PM','BW'].includes(body.shift))throw new Error('Invalid preview shift');
      if(body.replaceManual&&!user.permissions?.['rotations.assign'])throw Object.assign(new Error('Manual assignment permission required'),{status:403});
      if(body.action==='previewRotation'){
        const data=await loadDaily(date,branch);
        if(body.distributions&&!user.permissions?.['settings.configure'])throw Object.assign(new Error('Settings permission required for unsaved configuration'),{status:403});
        const distributions=body.distributions?validateDistributions(body.distributions,data.positions,branch):data.distributions;
        return NextResponse.json({success:true,preview:rotationPreview(data,{distributions,shift:body.shift||'',role:body.role||'',replaceManual:body.replaceManual===true})});
      }
      if(body.distributions)throw new Error('Save the distribution draft before applying a roster');
      const result=await applyRotation(prisma,{user,date,branch,shift:body.shift||'',role:body.role||'',replaceManual:body.replaceManual===true,confirmed:body.confirmed===true,previewFingerprint:body.previewFingerprint,reason:body.reason,loadDaily});
      let leadershipReports;try{leadershipReports=await ensureAutomaticShiftLeadershipReports(prisma,{user,day:result.day});}catch(error){leadershipReports={warnings:[{message:error.message}]};}
      return NextResponse.json({success:true,plan:result.plan,alerts:result.alerts,leadershipReports});
    }    if (body.action === "manualAssignment") {
      await operationsBranch(prisma,user,branch);
      const {assignment,member,position,plan,dayId}=await prisma.$transaction(async tx=>{
      const data = await loadDaily(date, branch,tx); if (!data.day || data.day.status === "CLOSED") throw new Error("Open operations day required");
      const member = data.team.find((item) => item.employeeId === body.employeeId && item.working); const position = data.positions.find((item) => item.id === body.operationalPositionId&&item.active); if (!member || !position) throw new Error("Expected employee and active operational position are required");
      const slot={startTime:body.startTime,endTime:body.endTime,shiftCode:member.shiftCode};
      if(member.frontAssignment||member.employee.department==='CASHIER'||(member.isShiftLeader??member.employee.operationsTeamLeader))throw new Error('Fixed cashier and team leader assignments are protected');
      const entries=handoverRules(data,slot),entry=entries.find(row=>row.position?.id===position.id);
      if(['HANDOVER_BREAK','PM_HANDOVER_SUPPORT_ONLY','AFTER_HANDOVER_ONLY'].includes(entry?.excludedReason))throw new Error('Location conflicts with the AM/PM handover policy');
      const distribution=entry&&!entry.excludedReason?entry:null;
      if(!distribution&&(!data.distributions.allowDisabledManualAssignments||body.allowDisabled!==true))throw new Error('Location excluded for this shift. Enable the separate manual override setting and explicitly confirm the override / الموقع مستبعد؛ تجاوز التكليف اليدوي يحتاج إعدادًا وتأكيدًا صريحًا');
      if(distribution?.rule.roles.length&&!distribution.rule.roles.some(role=>[member.employee.jobTitle,member.employee.department].includes(role)))throw new Error('Employee role is not allowed for this distribution');
      if (!canAssign({ qualifications: data.qualifications, employeeId: member.employeeId, position:{...position,requiresQualification:position.requiresQualification||distribution?.rule.qualificationRequired}, workDate: date,positions:data.positions })) throw new Error("Restricted, expired or not qualified employees cannot be assigned");
      if (!body.startTime || !body.endTime || !String(body.reason || "").trim()) throw new Error("Time range and override reason are required");
      validateTimeRange(body.startTime,body.endTime);
      if(member.expectedStart&&member.expectedEnd&&member.expectedStart<member.expectedEnd&&(body.startTime<member.expectedStart||body.endTime>member.expectedEnd))throw new Error("Assignment must be inside the employee shift");
      if (handoverBreaks(data).some((item) => item.employeeId === member.employeeId && item.status !== "CANCELLED" && overlaps(item.startTime, item.endTime, body.startTime, body.endTime))) throw new Error("Assignment conflicts with an employee break");
      if(dataExitBlocked(data,position,data.assignments,slot,entries))throw new Error('Data and Exit require coverage of all other enabled locations');
      if (data.assignments.some((item) => item.employeeId === member.employeeId && overlaps(item.startTime, item.endTime, body.startTime, body.endTime))) throw new Error("Employee already has a rotation assignment in this time range");
      if(data.assignments.some(a=>overlaps(a.startTime,a.endTime,body.startTime,body.endTime)&&physicalConflict(position,assignmentPosition(a,data.positions))))throw new Error('A shared location is already assigned / أحد المكانين موزع بالفعل في هذه الساعة');
      if (data.assignments.filter(a=>a.operationalPositionId===position.id&&overlaps(a.startTime,a.endTime,body.startTime,body.endTime)).length>=(distribution?.rule.max??1)) throw new Error("Operational position is at maximum coverage for this time range");
      let plan = data.plan; if (!plan || !["ACTIVE", "DRAFT"].includes(plan.status)) plan = await tx.opsRotationPlan.create({ data: { operationsDayId: data.day.id, branch, version: (data.day.rotationPlans?.[0]?.version || 0) + 1, status: "ACTIVE", generatedBy: user.id, generatedAt: new Date() } });
      const assignment = await tx.opsRotationAssignment.create({ data: { rotationPlanId: plan.id, employeeId: member.employeeId, operationalPositionId: position.id, startTime: body.startTime, endTime: body.endTime, source: "MANUAL", manualLock: Boolean(body.manualLock || position.code === "CASHIER"), overrideReason: String(body.reason).trim(), createdBy: user.id, updatedBy: user.id } });
      return {assignment,member,position,plan,dayId:data.day.id};
      });
      await writeAudit({ action: "OPS_ROTATION_MANUAL_ASSIGNMENT", user, summary: `Manually assigned ${member.employee.name} to ${position.label}`, metadata: { dayId, planId: plan.id, assignmentId: assignment.id, employeeId: member.employeeId, positionId: position.id, branch, date }, reason: body.reason });
      return NextResponse.json({ success: true, assignment });
    }
    if (body.action === "addBreak") {
      const data = await loadDaily(date, branch); if (!data.day || data.day.status === "CLOSED") throw new Error("Open operations day required"); if (!body.employeeId || !body.startTime || !body.endTime || body.startTime >= body.endTime) throw new Error("Valid employee and break time range are required");
      validateBreak(data.team.find(item=>item.employeeId===body.employeeId),data.breaks,{employeeId:body.employeeId,startTime:body.startTime,endTime:body.endTime,status:"PLANNED"});
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
      await assertUniqueTrip(prisma, { branch, workDate: date, startTime: body.startTime, name: partnerName });
      partner = await prisma.opsTripPartner.upsert({
        where: { branch_name: { branch, name: partnerName } },
        update: { supervisorName: String(body.supervisorName || partner?.supervisorName || "").trim() || null, supervisorPhone: String(body.supervisorPhone || partner?.supervisorPhone || "").trim() || null, updatedBy: user.id },
        create: { branch, name: partnerName, supervisorName: String(body.supervisorName || "").trim() || null, supervisorPhone: String(body.supervisorPhone || "").trim() || null, createdBy: user.id, updatedBy: user.id },
      });
      const existingCount = await prisma.opsDailyTrip.count({ where: { branch, workDate: date, status: { not: "CANCELLED" } } });
      const expectedChildren = number("expectedChildren");
      const record = await prisma.$transaction(async (tx) => {
        await assertUniqueTrip(tx, { branch, workDate: date, startTime: body.startTime, name: partnerName });
        const bracelet = await reserveBracelets(tx, { branch, usageType: "TRIP", quantity: expectedChildren, offset: existingCount });
        return tx.opsDailyTrip.create({ data: { branch, workDate: date, tripPartnerId: partner.id, name: partner.name, startTime: String(body.startTime), endTime: String(body.endTime || "") || null, expectedChildren, supervisorName: String(body.supervisorName || partner.supervisorName || "").trim() || null, supervisorPhone: String(body.supervisorPhone || partner.supervisorPhone || "").trim() || null, mealIncluded: bool(body.mealIncluded), chickenNuggets: number("chickenNuggets"), beefBurgers: number("beefBurgers"), chickenBurgers: number("chickenBurgers"), mealCountsJson: JSON.stringify(mealCounts(body)), braceletType: bracelet.braceletType, braceletColor: bracelet.braceletColor, braceletMaterial: bracelet.braceletMaterial, staffingRequired: number("staffingRequired"), notes: String(body.notes || "").trim() || null, createdBy: user.id, updatedBy: user.id } });
      });
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
      const existingCount = await prisma.opsDailyEvent.count({ where: { branch, workDate: date, eventType: "BIRTHDAY", status: { not: "CANCELLED" } } });
      const expectedGuests = number("expectedGuests");
      const record = await prisma.$transaction(async (tx) => {
        const bracelet = await reserveBracelets(tx, { branch, usageType: "BIRTHDAY", quantity: expectedGuests, offset: existingCount });
        return tx.opsDailyEvent.create({ data: { branch, workDate: date, birthdayCustomerId: customer.id, name: String(body.name || `${childName} Birthday`).trim(), customerName, customerPhone: phone, childName, startTime: String(body.startTime), endTime: String(body.endTime || "") || null, eventType: "BIRTHDAY", expectedGuests, chickenNuggets: number("chickenNuggets"), beefBurgers: number("beefBurgers"), chickenBurgers: number("chickenBurgers"), mealCountsJson: JSON.stringify(mealCounts(body)), partyRoomHours: body.partyRoomHours ? Number(body.partyRoomHours) : null, braceletType: bracelet.braceletType, braceletColor: bracelet.braceletColor, braceletMaterial: bracelet.braceletMaterial, location: String(body.location || "").trim() || null, staffingRequired: number("staffingRequired"), notes: String(body.notes || "").trim() || null, createdBy: user.id, updatedBy: user.id } });
      });
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
      await operationsBranch(prisma, user, branch);
      const { wristbandType, values } = await stockValues(body);
      const { stockCategory, usageType } = values;
      const record = await prisma.$transaction(async (tx) => {
        const existing = await tx.opsWristbandStock.findUnique({ where: { branch_workDate_wristbandType: { branch, workDate: "ALL", wristbandType } } });
        if (values.availableStock < Number(existing?.allocated || 0) + Number(existing?.issued || 0)) throw new Error("Cashier and warehouse stock cannot be lower than reserved and issued quantities");
        const saved = await tx.opsWristbandStock.upsert({ where: { branch_workDate_wristbandType: { branch, workDate: "ALL", wristbandType } }, update: { ...values, updatedBy: user.id }, create: { branch, workDate: "ALL", wristbandType, ...values, allocated: 0, issued: 0, createdBy: user.id, updatedBy: user.id } });
        if (stockCategory === "BRACELET" && ["TRIP", "BIRTHDAY"].includes(usageType)) await assignPendingBracelets(tx, { branch, usageType });
        return tx.opsWristbandStock.findUnique({ where: { id: saved.id } });
      });
      await writeAudit({ action: "OPS_SETSTOCK", user, summary: `Updated stock ${record.usageType || record.size || record.rollStyle || record.wristbandType}`, metadata: { id: record.id, branch, available: stockAvailable(record), category: stockCategory } });
      return NextResponse.json({ success: true, record });
    }
    if (body.action === "createNotice") {
      if (!body.title || !body.message || !body.effectiveFrom) throw new Error("Notice title, message and start date are required");
      const record = await prisma.opsOperationalNotice.create({ data: { branch, title: String(body.title), message: String(body.message), priority: String(body.priority || "INFO"), effectiveFrom: String(body.effectiveFrom), effectiveTo: String(body.effectiveTo || "") || null, startTime: String(body.startTime || "") || null, endTime: String(body.endTime || "") || null, active: true, createdBy: user.id, updatedBy: user.id } });
      return NextResponse.json({ success: true, record });
    }
    throw new Error("Unknown Daily Operations action");
  } catch (actionError) { return NextResponse.json({ success: false, error: actionError.message }, { status: actionError.status||409 }); }
}

async function PATCHHandler(request) {
  const { user, error } = await authorizeApi("OPS_DAILY_MANAGE"); if (error) return error; let body;try{body=validateDailyBody(await request.json());}catch(error){return NextResponse.json({success:false,error:error instanceof SyntaxError?"Invalid JSON body":error.message},{status:400});}
  try {
    const branchConfig = parseJson(await getSetting("OPS_BRANCH_CONFIG", "{}"));
    const defaultBranch = String(branchConfig.branchCode || "MOT");
    if (body.action === "setRosterBracelets") {
      const braceletRoster = await saveBraceletRoster(basePrisma, user, { ...body, branch: body.branch || defaultBranch });
      return NextResponse.json({ success: true, braceletRoster });
    }
    if (body.action === "updateStock") {
      const branch = String(body.branch || defaultBranch);
      const current = await prisma.opsWristbandStock.findFirst({ where: { id: String(body.stockId || ""), branch, workDate: "ALL" } });
      if (!current) throw new Error("Stock row not found");
      const { wristbandType, values } = await stockValues(body);
      const committed = Number(current.allocated || 0) + Number(current.issued || 0);
      if (current.wristbandType !== wristbandType && committed > 0) throw new Error("Stock with reservation or issue history cannot change category, type or color");
      if (values.availableStock < committed) throw new Error("Cashier and warehouse stock cannot be lower than reserved and issued quantities");
      const conflict = await prisma.opsWristbandStock.findFirst({ where: { branch, workDate: "ALL", wristbandType, id: { not: current.id } } });
      if (conflict) throw new Error("Another stock row already uses this category, type and color");
      const record = await prisma.$transaction(async (tx) => {
        const saved = await tx.opsWristbandStock.update({ where: { id: current.id }, data: { wristbandType, ...values, updatedBy: user.id } });
        if (values.stockCategory === "BRACELET" && ["TRIP", "BIRTHDAY"].includes(values.usageType)) await assignPendingBracelets(tx, { branch, usageType: values.usageType });
        return tx.opsWristbandStock.findUnique({ where: { id: saved.id } });
      });
      await writeAudit({ action: "OPS_STOCK_UPDATED", user, summary: `Updated stock ${record.wristbandType}`, metadata: { id: record.id, branch, available: stockAvailable(record) } });
      return NextResponse.json({ success: true, record });
    }
    if (body.action === "issueStock") {
      const branch = String(body.branch || defaultBranch);
      const current = await prisma.opsWristbandStock.findFirst({ where: { id: String(body.stockId || ""), branch, workDate: "ALL" } });
      if (!current) throw new Error("Stock row not found");
      const quantity = Math.max(0, Number(body.quantity || 0));
      const update = stockIssueUpdate(current, quantity);
      const record = await prisma.opsWristbandStock.update({ where: { id: current.id }, data: { allocated: update.allocated, issued: update.issued, updatedBy: user.id } });
      await writeAudit({ action: "OPS_STOCK_ISSUED", user, summary: `Issued ${quantity} from ${record.wristbandType}`, metadata: { id: record.id, branch, quantity, fromReservation: update.fromReservation, unreserved: update.unreserved, available: stockAvailable(record) } });
      return NextResponse.json({ success: true, record });
    }
    if (body.action === "deleteStock") {
      const branch = String(body.branch || defaultBranch);
      const current = await prisma.opsWristbandStock.findFirst({ where: { id: String(body.stockId || ""), branch, workDate: "ALL" } });
      if (!current) throw new Error("Stock row not found");
      if (!stockCanDelete(current)) throw new Error("Stock with reservations or issue history cannot be deleted");
      await prisma.opsWristbandStock.delete({ where: { id: current.id } });
      await writeAudit({ action: "OPS_STOCK_DELETED", user, summary: `Deleted stock ${current.wristbandType}`, metadata: { id: current.id, branch } });
      return NextResponse.json({ success: true });
    }
    if (body.action === "updateTrip") {
      const current = await prisma.opsDailyTrip.findFirst({ where: { id: String(body.tripId || ""), branch: String(body.branch || defaultBranch) } });
      if (!current) throw new Error("Trip not found");
      const expectedChildren = Math.max(0, Number(body.expectedChildren || 0));
      const record = await prisma.$transaction(async (tx) => {
        await assertUniqueTrip(tx, { id: current.id, branch: current.branch, workDate: current.workDate, startTime: String(body.startTime || current.startTime || ""), name: body.name || current.name });
        const bracelet = await updateBraceletReservation(tx, { branch: current.branch, current, quantity: expectedChildren, usageType: "TRIP" });
        return tx.opsDailyTrip.update({ where: { id: current.id }, data: { name: String(body.name || current.name).trim(), startTime: String(body.startTime || current.startTime || "") || null, endTime: String(body.endTime || "") || null, expectedChildren, supervisorName: String(body.supervisorName || "").trim() || null, supervisorPhone: String(body.supervisorPhone || "").trim() || null, mealIncluded: bool(body.mealIncluded), chickenNuggets: Math.max(0, Number(body.chickenNuggets || 0)), beefBurgers: Math.max(0, Number(body.beefBurgers || 0)), chickenBurgers: Math.max(0, Number(body.chickenBurgers || 0)), mealCountsJson: JSON.stringify(mealCounts(body)), braceletType: bracelet.braceletType, braceletColor: bracelet.braceletColor, braceletMaterial: bracelet.braceletMaterial, staffingRequired: Math.max(0, Number(body.staffingRequired || 0)), notes: String(body.notes || "").trim() || null, updatedBy: user.id } });
      });
      await writeAudit({ action: "OPS_UPDATETRIP", user, summary: `Updated trip ${record.name}`, metadata: { id: record.id, branch: record.branch } });
      return NextResponse.json({ success: true, record });
    }
    if (body.action === "deleteTrip") {
      const current = await prisma.opsDailyTrip.findUnique({ where: { id: String(body.tripId || "") } });
      if (!current) throw new Error("Trip not found");
      const record = await prisma.$transaction(async (tx) => {
        if (current.status !== "CANCELLED") await releaseBraceletReservation(tx, current);
        return tx.opsDailyTrip.update({ where: { id: current.id }, data: { status: "CANCELLED", updatedBy: user.id } });
      });
      await writeAudit({ action: "OPS_DELETETRIP", user, summary: `Cancelled trip ${record.name}`, metadata: { id: record.id, branch: record.branch } });
      return NextResponse.json({ success: true, record });
    }
    if (body.action === "updateEvent") {
      const current = await prisma.opsDailyEvent.findFirst({ where: { id: String(body.eventId || ""), branch: String(body.branch || defaultBranch) } });
      if (!current) throw new Error("Birthday not found");
      const expectedGuests = Math.max(0, Number(body.expectedGuests || 0));
      const record = await prisma.$transaction(async (tx) => {
        const bracelet = await updateBraceletReservation(tx, { branch: current.branch, current, quantity: expectedGuests, usageType: "BIRTHDAY" });
        return tx.opsDailyEvent.update({ where: { id: current.id }, data: { name: String(body.name || current.name).trim(), customerName: String(body.customerName || current.customerName || "").trim() || null, customerPhone: String(body.customerPhone || current.customerPhone || "").trim() || null, childName: String(body.childName || current.childName || "").trim() || null, startTime: String(body.startTime || current.startTime || "") || null, endTime: String(body.endTime || "") || null, expectedGuests, chickenNuggets: Math.max(0, Number(body.chickenNuggets || 0)), beefBurgers: Math.max(0, Number(body.beefBurgers || 0)), chickenBurgers: Math.max(0, Number(body.chickenBurgers || 0)), mealCountsJson: JSON.stringify(mealCounts(body)), partyRoomHours: body.partyRoomHours ? Number(body.partyRoomHours) : null, braceletType: bracelet.braceletType, braceletColor: bracelet.braceletColor, braceletMaterial: bracelet.braceletMaterial, location: String(body.location || "").trim() || null, staffingRequired: Math.max(0, Number(body.staffingRequired || 0)), notes: String(body.notes || "").trim() || null, updatedBy: user.id } });
      });
      await writeAudit({ action: "OPS_UPDATEEVENT", user, summary: `Updated birthday ${record.name}`, metadata: { id: record.id, branch: record.branch } });
      return NextResponse.json({ success: true, record });
    }
    if (body.action === "deleteEvent") {
      const current = await prisma.opsDailyEvent.findUnique({ where: { id: String(body.eventId || "") } });
      if (!current) throw new Error("Birthday not found");
      const record = await prisma.$transaction(async (tx) => {
        if (current.status !== "CANCELLED") await releaseBraceletReservation(tx, current);
        return tx.opsDailyEvent.update({ where: { id: current.id }, data: { status: "CANCELLED", updatedBy: user.id } });
      });
      await writeAudit({ action: "OPS_DELETEEVENT", user, summary: `Cancelled birthday ${record.name}`, metadata: { id: record.id, branch: record.branch } });
      return NextResponse.json({ success: true, record });
    }
    if (body.action === "updateOffer") {
      const current = await prisma.opsDailyOffer.findFirst({ where: { id: String(body.offerId || ""), branch: String(body.branch || defaultBranch) } });
      if (!current) throw new Error("Offer not found");
      const record = await prisma.opsDailyOffer.update({ where: { id: current.id }, data: offerValues(body, user.id) });
      await writeAudit({ action: "OPS_UPDATEOFFER", user, summary: `Updated offer ${record.title}`, metadata: { id: record.id, branch: record.branch } });
      return NextResponse.json({ success: true, record });
    }
    if (body.action === "deleteOffer") {
      const current = await prisma.opsDailyOffer.findFirst({ where: { id: String(body.offerId || ""), branch: String(body.branch || defaultBranch) } });
      if (!current) throw new Error("Offer not found");
      const record = await prisma.opsDailyOffer.update({ where: { id: current.id }, data: { active: false, updatedBy: user.id } });
      await writeAudit({ action: "OPS_DELETEOFFER", user, summary: `Removed offer ${record.title}`, metadata: { id: record.id, branch: record.branch } });
      return NextResponse.json({ success: true, record });
    }
    if (body.action === "updateBreak") { const current = await prisma.opsBreakAssignment.findUnique({ where: { id: String(body.breakId || "") }, include: { rotationPlan: { include: { operationsDay: true, assignments: true } } } }); if (!current) throw new Error("Break not found"); if (current.rotationPlan.operationsDay.status === "CLOSED") throw new Error("Closed day must be reopened before editing breaks"); const update = { startTime: body.startTime || current.startTime, endTime: body.endTime || current.endTime, status: body.status || current.status, note: body.note === undefined ? current.note : String(body.note || "").trim() || null, updatedBy: user.id }; const breakData=await loadDaily(current.rotationPlan.operationsDay.workDate,current.rotationPlan.operationsDay.branch); if(breakData.plan?.id!==current.rotationPlanId)throw new Error("Refresh to edit the current rotation version"); validateBreak(breakData.team.find(item=>item.employeeId===current.employeeId),breakData.breaks,{...current,...update}); if (update.status!=="CANCELLED" && current.rotationPlan.assignments.some((item) => item.employeeId === current.employeeId && overlaps(item.startTime, item.endTime, update.startTime, update.endTime))) throw new Error("Break conflicts with a rotation assignment"); const item = await prisma.opsBreakAssignment.update({ where: { id: current.id }, data: update }); await writeAudit({ action: "OPS_BREAK_UPDATED", user, summary: `Updated break ${item.id}`, metadata: { breakId: item.id, before: { startTime: current.startTime, endTime: current.endTime, status: current.status }, after: update } }); return NextResponse.json({ success: true, break: item }); }
    const day = await prisma.opsOperationsDay.findUnique({ where: { id: String(body.dayId || "") } }); if (!day) throw new Error("Operations day not found");
    if (body.action === "close") {
      if(day.status==="CLOSED")throw new Error("Day is already closed");
      const data=await loadDaily(day.workDate,day.branch);
      if(!data.close.ready&&!(body.override&&String(body.reason||"").trim()))return NextResponse.json({success:false,error:"Close Day checklist is not ready",blockers:data.close.blockers},{status:409});
      const updated=await prisma.$transaction(async tx=>{
        const braceletRoster=await loadBraceletRoster(tx,{branch:day.branch,date:day.workDate,items:data.wristbands,day});
        const result=await tx.opsOperationsDay.update({where:{id:day.id,status:{not:"CLOSED"}},data:{status:"CLOSED",readinessScore:data.readiness.score,readinessSnapshotJson:JSON.stringify({readiness:data.readiness,attention:data.attention,close:data.close,braceletRoster}),closedBy:user.id,closedAt:new Date(),teamNote:String(body.teamNote||day.teamNote||"").trim()||null,handoverNote:String(body.handoverNote||"").trim()||null}});
        await tx.opsRotationPlan.updateMany({where:{operationsDayId:day.id,status:"ACTIVE"},data:{status:"CLOSED"}});
        await tx.auditLog.create({data:{action:body.override?"OPS_DAY_CLOSED_OVERRIDE":"OPS_DAY_CLOSED",userId:user.id,summary:"Closed operations day "+day.workDate,metadata:JSON.stringify({dayId:day.id,branch:day.branch,readinessScore:data.readiness.score,blockers:data.close.blockers,reason:body.reason})}});
        return result;
      });return NextResponse.json({success:true,day:updated});
    }
    if (body.action === "reopen") {
      if(day.status!=="CLOSED"||!String(body.reason||"").trim())throw new Error("Closed day and reopen reason are required");
      const updated=await prisma.$transaction(async tx=>{
        const last=await tx.opsRotationPlan.findFirst({where:{operationsDayId:day.id},orderBy:{version:"desc"},include:{assignments:true,breaks:true}});
        if(last)await tx.opsRotationPlan.create({data:{operationsDayId:day.id,branch:day.branch,version:last.version+1,status:"ACTIVE",generatedBy:user.id,generatedAt:new Date(),generationSnapshotJson:JSON.stringify({reopenedFrom:last.id,reason:body.reason}),assignments:{create:last.assignments.map(item=>({employeeId:item.employeeId,operationalPositionId:item.operationalPositionId,startTime:item.startTime,endTime:item.endTime,source:item.source,manualLock:item.manualLock,overrideReason:item.overrideReason,createdBy:user.id,updatedBy:user.id}))},breaks:{create:last.breaks.map(item=>({employeeId:item.employeeId,startTime:item.startTime,endTime:item.endTime,status:item.status,note:item.note,createdBy:item.createdBy,updatedBy:user.id}))}}});
        const reopened=await tx.opsOperationsDay.update({where:{id:day.id},data:{status:"REOPENED",reopenedBy:user.id,reopenedAt:new Date(),reopenReason:String(body.reason).trim()}});
        await tx.auditLog.create({data:{action:"OPS_DAY_REOPENED",userId:user.id,summary:"Reopened operations day "+day.workDate,metadata:JSON.stringify({dayId:day.id,branch:day.branch,reason:body.reason,previousPlanId:last?.id})}});return reopened;
      });
      return NextResponse.json({success:true,day:updated});
    }
    throw new Error("Unknown action");
  } catch (actionError) { return NextResponse.json({ success: false, error: actionError.message }, { status: actionError.status || 409 }); }
}

export const GET=withAccountAccess(GETHandler);
export const POST=withAccountAccess(POSTHandler);
export const PATCH=withAccountAccess(PATCHHandler);
