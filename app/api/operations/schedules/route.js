import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authorizeApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { datesInPeriod, getOperationalSchedulePeriod, normalizeScheduleCode } from "@/lib/operations/schedule";
import readXlsxFile from "read-excel-file/node";

function periodFromParams(searchParams) {
  const now = new Date();
  const year = Number(searchParams.get("year") || now.getFullYear());
  const month = Number(searchParams.get("month") || now.getMonth() + 1);
  if (!Number.isInteger(year) || year < 2020 || year > 2100 || !Number.isInteger(month) || month < 1 || month > 12) throw new Error("Invalid schedule period");
  return { year, month };
}

function lookupKey(value) { return String(value ?? "").trim().replace(/\s+/g, " ").toLowerCase(); }
function importedHeaderDate(value, schedule, periodDates) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const iso = value.toISOString().slice(0, 10); return periodDates.includes(iso) ? iso : null;
  }
  const text = String(value ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return periodDates.includes(text) ? text : null;
  const dateMatch = text.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})$/);
  if (dateMatch) {
    const year = Number(dateMatch[3]) < 100 ? 2000 + Number(dateMatch[3]) : Number(dateMatch[3]);
    const candidates = [`${year}-${String(dateMatch[2]).padStart(2, "0")}-${String(dateMatch[1]).padStart(2, "0")}`, `${year}-${String(dateMatch[1]).padStart(2, "0")}-${String(dateMatch[2]).padStart(2, "0")}`];
    return candidates.find((item) => periodDates.includes(item)) || null;
  }
  const dayMatch = text.match(/(?:^|\D)([1-9]|[12]\d|3[01])(?:\D|$)/); const day = Number(dayMatch?.[1] || (typeof value === "number" ? value : 0));
  if (day >= 1 && day <= 31) return periodDates.find((item) => Number(item.slice(-2)) === day) || null;
  return null;
}

export async function GET(request) {
  const { error } = await authorizeApi("OPS_SCHEDULE_READ");
  if (error) return error;
  try {
    const { year, month } = periodFromParams(new URL(request.url).searchParams);
    const schedules = await prisma.opsSchedule.findMany({
      where: { operationalYear: year, operationalMonth: month },
      include: { assignments: { where: { employee: { department: { in: ["OPERATION", "CASHIER"] } } }, include: { employee: { select: { id: true, name: true, nameEn: true, hrisNumber: true, localEmployeeCode: true, department: true } } }, orderBy: [{ employee: { name: "asc" } }, { workDate: "asc" }] } },
      orderBy: { version: "desc" },
    });
    const requestedId = new URL(request.url).searchParams.get("scheduleId");
    const schedule = (requestedId ? schedules.find((item) => item.id === requestedId) : null) || schedules.find((item) => item.status === "DRAFT") || schedules.find((item) => item.status === "PUBLISHED") || schedules[0] || null;
    return NextResponse.json({ success: true, period: getOperationalSchedulePeriod(year, month), versions: schedules.map(({ assignments, ...item }) => ({ ...item, assignmentCount: assignments.length })), schedule });
  } catch (requestError) {
    return NextResponse.json({ success: false, error: requestError.message }, { status: 400 });
  }
}

export async function PATCH(request) {
  const { user, error } = await authorizeApi("OPS_SCHEDULE_MANAGE");
  if (error) return error;
  const body = await request.json();
  const schedule = await prisma.opsSchedule.findUnique({ where: { id: String(body.scheduleId || "") } });
  if (!schedule) return NextResponse.json({ success: false, error: "Schedule not found" }, { status: 404 });
  if (schedule.status !== "DRAFT") return NextResponse.json({ success: false, error: "Only draft schedules can be edited" }, { status: 409 });
  const normalized = normalizeScheduleCode(body.value);
  if (normalized.error || !normalized.code) return NextResponse.json({ success: false, error: normalized.error || "Schedule code is required" }, { status: 400 });
  const employee = await prisma.employee.findFirst({ where: { id: String(body.employeeId || ""), department: { in: ["OPERATION", "CASHIER"] }, active: true }, select: { id: true } });
  const workDate = String(body.workDate || "");
  if (!employee || workDate < schedule.periodStart || workDate > schedule.periodEnd) return NextResponse.json({ success: false, error: "Invalid employee or work date" }, { status: 400 });
  const assignment = await prisma.opsScheduleAssignment.upsert({
    where: { scheduleId_employeeId_workDate: { scheduleId: schedule.id, employeeId: employee.id, workDate } },
    update: { code: normalized.code, shiftCode: normalized.countsAsWorking ? normalized.code : null, source: "MANUAL", importRawValue: normalized.rawValue, importMetadata: normalized.metadata ? JSON.stringify(normalized.metadata) : null },
    create: { scheduleId: schedule.id, employeeId: employee.id, workDate, code: normalized.code, shiftCode: normalized.countsAsWorking ? normalized.code : null, source: "MANUAL", importRawValue: normalized.rawValue, importMetadata: normalized.metadata ? JSON.stringify(normalized.metadata) : null },
  });
  await writeAudit({ action: "OPS_SCHEDULE_CELL_UPDATED", user, summary: `Updated schedule cell for ${workDate}`, metadata: { scheduleId: schedule.id, employeeId: employee.id, code: normalized.code } });
  return NextResponse.json({ success: true, assignment });
}

export async function POST(request) {
  if (String(request.headers.get("content-type") || "").includes("multipart/form-data")) {
    const { user, error } = await authorizeApi("OPS_SCHEDULE_MANAGE"); if (error) return error;
    try {
      const form = await request.formData(); const scheduleId = String(form.get("scheduleId") || ""); const file = form.get("file");
      if (!file || typeof file.arrayBuffer !== "function") throw new Error("Choose an XLSX roster file");
      const schedule = await prisma.opsSchedule.findUnique({ where: { id: scheduleId } });
      if (!schedule || schedule.status !== "DRAFT") throw new Error("Import is allowed into a draft only");
      const rows = await readXlsxFile(Buffer.from(await file.arrayBuffer())); if (rows.length < 2) throw new Error("The workbook has no roster rows");
      const periodDates = datesInPeriod({ startDate: schedule.periodStart, endDate: schedule.periodEnd });
      const headerCandidates = rows.slice(0, 20).map((row, rowIndex) => ({ rowIndex, columns: row.map((value, columnIndex) => ({ columnIndex, workDate: importedHeaderDate(value, schedule, periodDates) })).filter((item) => item.workDate) })).sort((a, b) => b.columns.length - a.columns.length);
      const detectedHeader = headerCandidates[0];
      if (!detectedHeader || detectedHeader.columns.length < 2) throw new Error("Could not detect roster dates. Use date cells or day numbers within the selected operational month");
      const employees = await prisma.employee.findMany({ where: { department: { in: ["OPERATION", "CASHIER"] }, active: true }, select: { id: true, name: true, nameEn: true, hrisNumber: true, localEmployeeCode: true } });
      const lookup = new Map(employees.flatMap((employee) => [employee.name, employee.nameEn, employee.hrisNumber, employee.localEmployeeCode].filter(Boolean).map((value) => [lookupKey(value), employee])));
      const imported = []; const unmatchedRows = []; const invalidCells = [];
      const dateColumnSet = new Set(detectedHeader.columns.map((item) => item.columnIndex));
      for (const [offset, row] of rows.slice(detectedHeader.rowIndex + 1).entries()) {
        const identityValues = row.map((value, index) => dateColumnSet.has(index) ? null : value).filter((value) => value !== null && value !== undefined && String(value).trim());
        const employee = identityValues.map((value) => lookup.get(lookupKey(value))).find(Boolean);
        if (!employee) { if (identityValues.length) unmatchedRows.push({ row: detectedHeader.rowIndex + offset + 2, identity: String(identityValues[0]).slice(0, 80) }); continue; }
        for (const { columnIndex, workDate } of detectedHeader.columns) {
          const normalized = normalizeScheduleCode(row[columnIndex]);
          if (normalized.error) { invalidCells.push({ row: detectedHeader.rowIndex + offset + 2, workDate, value: normalized.rawValue }); continue; }
          if (!normalized.code) continue;
          imported.push({ scheduleId: schedule.id, employeeId: employee.id, workDate, code: normalized.code, shiftCode: normalized.countsAsWorking ? normalized.code : null, source: "IMPORT", importRawValue: normalized.rawValue, importMetadata: normalized.metadata ? JSON.stringify(normalized.metadata) : null });
        }
      }
      if (!imported.length) throw new Error("No matching operational employees or valid schedule codes were found");
      await prisma.$transaction(imported.map((item) => prisma.opsScheduleAssignment.upsert({ where: { scheduleId_employeeId_workDate: { scheduleId: item.scheduleId, employeeId: item.employeeId, workDate: item.workDate } }, update: item, create: item })));
      await writeAudit({ action: "OPS_SCHEDULE_IMPORTED", user, summary: `Imported ${imported.length} roster cells`, metadata: { scheduleId: schedule.id, cellCount: imported.length, fileName: file.name } });
      return NextResponse.json({ success: true, imported: imported.length, matchedEmployees: new Set(imported.map((item) => item.employeeId)).size, unmatchedRows, invalidCells, detectedHeaderRow: detectedHeader.rowIndex + 1 });
    } catch (importError) { return NextResponse.json({ success: false, error: importError.message }, { status: 400 }); }
  }
  const body = await request.json();
  const permission = body.action === "publish" ? "OPS_SCHEDULE_PUBLISH" : "OPS_SCHEDULE_MANAGE";
  const { user, error } = await authorizeApi(permission);
  if (error) return error;
  const sourceSchedule = await prisma.opsSchedule.findUnique({ where: { id: String(body.scheduleId || "") }, include: { assignments: true } });
  if (!sourceSchedule) return NextResponse.json({ success: false, error: "Schedule not found" }, { status: 404 });
  if (body.action === "createRevision") {
    const latest = await prisma.opsSchedule.findFirst({ where: { operationalYear: sourceSchedule.operationalYear, operationalMonth: sourceSchedule.operationalMonth }, orderBy: { version: "desc" } });
    const created = await prisma.$transaction(async (tx) => {
      const revision = await tx.opsSchedule.create({ data: { year: sourceSchedule.year, month: sourceSchedule.month, operationalYear: sourceSchedule.operationalYear, operationalMonth: sourceSchedule.operationalMonth, periodStart: sourceSchedule.periodStart, periodEnd: sourceSchedule.periodEnd, version: (latest?.version || 0) + 1, status: "DRAFT", basedOnScheduleId: sourceSchedule.id } });
      if (sourceSchedule.assignments.length) await tx.opsScheduleAssignment.createMany({ data: sourceSchedule.assignments.map((item) => ({ scheduleId: revision.id, employeeId: item.employeeId, workDate: item.workDate, code: item.code, shiftCode: item.shiftCode, source: "REVISION", importRawValue: item.importRawValue, importMetadata: item.importMetadata, manualLock: item.manualLock })) });
      return revision;
    });
    await writeAudit({ action: "OPS_SCHEDULE_REVISION_CREATED", user, summary: `Created schedule revision ${created.version}`, metadata: { scheduleId: created.id, basedOn: sourceSchedule.id } });
    return NextResponse.json({ success: true, schedule: created });
  }
  if (body.action === "publish") {
    if (sourceSchedule.status !== "DRAFT") return NextResponse.json({ success: false, error: "Only a draft can be published" }, { status: 409 });
    const published = await prisma.$transaction(async (tx) => {
      await tx.opsSchedule.updateMany({ where: { operationalYear: sourceSchedule.operationalYear, operationalMonth: sourceSchedule.operationalMonth, status: "PUBLISHED" }, data: { status: "SUPERSEDED" } });
      return tx.opsSchedule.update({ where: { id: sourceSchedule.id }, data: { status: "PUBLISHED", publishedAt: new Date() } });
    });
    await writeAudit({ action: "OPS_SCHEDULE_PUBLISHED", user, summary: `Published schedule ${published.operationalYear}-${published.operationalMonth} v${published.version}`, metadata: { scheduleId: published.id } });
    return NextResponse.json({ success: true, schedule: published });
  }
  if (body.action === "deleteDraft") {
    if (sourceSchedule.status !== "DRAFT") return NextResponse.json({ success: false, error: "Only a draft can be deleted" }, { status: 409 });
    await prisma.opsSchedule.delete({ where: { id: sourceSchedule.id } });
    await writeAudit({ action: "OPS_SCHEDULE_DRAFT_DELETED", user, summary: `Deleted schedule draft ${sourceSchedule.version}`, metadata: { scheduleId: sourceSchedule.id } });
    return NextResponse.json({ success: true });
  }
  return NextResponse.json({ success: false, error: "Unknown schedule action" }, { status: 400 });
}
