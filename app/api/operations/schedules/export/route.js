import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authorizeApi } from "@/lib/api-auth";

const encoder = new TextEncoder();
const crc32 = (bytes) => { let crc = -1; for (const byte of bytes) { crc ^= byte; for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1)); } return (crc ^ -1) >>> 0; };
const u16 = (value) => Uint8Array.of(value & 255, (value >>> 8) & 255);
const u32 = (value) => Uint8Array.of(value & 255, (value >>> 8) & 255, (value >>> 16) & 255, (value >>> 24) & 255);
const join = (parts) => { const total = parts.reduce((sum, part) => sum + part.length, 0); const out = new Uint8Array(total); let offset = 0; for (const part of parts) { out.set(part, offset); offset += part.length; } return out; };
function zip(files) {
  let offset = 0; const records = []; const central = [];
  for (const [name, text] of files) { const filename = encoder.encode(name); const data = encoder.encode(text); const crc = crc32(data); const local = join([u32(0x04034b50), u16(20), u16(0), u16(0), u16(0), u16(0), u32(crc), u32(data.length), u32(data.length), u16(filename.length), u16(0), filename, data]); records.push(local); central.push(join([u32(0x02014b50), u16(20), u16(20), u16(0), u16(0), u16(0), u16(0), u32(crc), u32(data.length), u32(data.length), u16(filename.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset), filename])); offset += local.length; }
  const body = join(records); const directory = join(central); return join([body, directory, u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length), u32(directory.length), u32(body.length), u16(0)]);
}
const escapeXml = (value) => String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const cell = (value) => `<c t="inlineStr"><is><t>${escapeXml(value)}</t></is></c>`;

export async function GET(request) {
  const { error } = await authorizeApi("OPS_SCHEDULE_READ"); if (error) return error;
  const url = new URL(request.url); const id = String(url.searchParams.get("scheduleId") || "");
  const schedule = await prisma.opsSchedule.findUnique({
    where: { id },
    include: {
      assignments: {
        where: { employee: { department: "OPERATION" } },
        include: { employee: { select: { name: true, hrisNumber: true, localEmployeeCode: true } } },
        orderBy: [{ employee: { name: "asc" } }, { workDate: "asc" }],
      },
    },
  });
  if (!schedule) return NextResponse.json({ success: false, error: "Schedule not found" }, { status: 404 });
  const dates = [...new Set(schedule.assignments.map((item) => item.workDate))].sort(); const rows = new Map();
  for (const assignment of schedule.assignments) { const row = rows.get(assignment.employeeId) || { employee: assignment.employee, values: new Map() }; row.values.set(assignment.workDate, assignment.importRawValue || assignment.code); rows.set(assignment.employeeId, row); }
  const sheetRows = [["Employee", "Employee ID", ...dates], ...[...rows.values()].map((row) => [row.employee.name, row.employee.hrisNumber || row.employee.localEmployeeCode || "", ...dates.map((date) => row.values.get(date) || "")])];
  const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${sheetRows.map((row, index) => `<row r="${index + 1}">${row.map(cell).join("")}</row>`).join("")}</sheetData></worksheet>`;
  const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Roster" sheetId="1" r:id="rId1"/></sheets></workbook>`;
  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`;
  const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
  const workbookRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`;
  const output = zip([["[Content_Types].xml", contentTypes], ["_rels/.rels", rootRels], ["xl/workbook.xml", workbook], ["xl/_rels/workbook.xml.rels", workbookRels], ["xl/worksheets/sheet1.xml", sheet]]);
  return new NextResponse(output, { headers: { "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "content-disposition": `attachment; filename="MOT-roster-${schedule.operationalYear}-${String(schedule.operationalMonth).padStart(2, "0")}-v${schedule.version}.xlsx`, "cache-control": "no-store" } });
}
