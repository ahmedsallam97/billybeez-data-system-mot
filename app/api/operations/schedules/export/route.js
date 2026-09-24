import { NextResponse } from "next/server";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
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
const safeText = (value) => String(value ?? "").normalize("NFKD").replace(/[^\x20-\x7E]/g, "").trim();
const CODE_COLORS = {
  AM: "#f4d86f", BW: "#76b6df", PM: "#6f96c5", OFF: "#e7a7bd", ANNUAL: "#98cfaa", REP: "#f0d166",
  SL: "#efb0bb", UNPAID: "#efa968", MISSION: "#9bd9e8", HOLIDAY: "#82233f", H: "#82233f", ANP: "#ef8d8d", AWP: "#a53b45",
};
function pdfColor(hex, fallback = "#ffffff") {
  const value = /^#[0-9a-f]{6}$/i.test(String(hex || "")) ? String(hex) : fallback;
  return rgb(parseInt(value.slice(1, 3), 16) / 255, parseInt(value.slice(3, 5), 16) / 255, parseInt(value.slice(5, 7), 16) / 255);
}
function codeColor(value) {
  const code = String(value || "").trim().toUpperCase();
  if (code.startsWith("AM")) return CODE_COLORS.AM;
  if (code.startsWith("BW")) return CODE_COLORS.BW;
  if (code.startsWith("PM")) return CODE_COLORS.PM;
  return CODE_COLORS[code] || "#f7f4ef";
}
function fitText(font, value, maxWidth, size) {
  const text = safeText(value) || "-";
  if (font.widthOfTextAtSize(text, size) <= maxWidth) return text;
  let output = text;
  while (output.length > 1 && font.widthOfTextAtSize(`${output}...`, size) > maxWidth) output = output.slice(0, -1);
  return `${output}...`;
}
async function schedulePdf(schedule) {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const pageWidth = 1190; const pageHeight = 842; const margin = 30; const nameWidth = 205;
  const dates = [...new Set(schedule.assignments.map((item) => item.workDate))].sort();
  const rows = new Map();
  for (const assignment of schedule.assignments) {
    const row = rows.get(assignment.employeeId) || { employee: assignment.employee, values: new Map() };
    row.values.set(assignment.workDate, assignment.importRawValue || assignment.code); rows.set(assignment.employeeId, row);
  }
  const grouped = [
    ["OPERATIONS TEAM", [...rows.values()].filter((row) => row.employee.department !== "CASHIER")],
    ["FRONT CASHIERS", [...rows.values()].filter((row) => row.employee.department === "CASHIER")],
  ].filter(([, items]) => items.length);
  const dateWidth = Math.min(30, (pageWidth - margin * 2 - nameWidth) / Math.max(dates.length, 1));
  const tableWidth = nameWidth + dateWidth * dates.length;
  const rowHeight = 31; const headerHeight = 43; const sectionHeight = 28;
  let page; let y;
  const newPage = () => {
    page = pdf.addPage([pageWidth, pageHeight]);
    page.drawRectangle({ x: 0, y: pageHeight - 8, width: pageWidth, height: 8, color: pdfColor("#31164b") });
    page.drawText("BILLY BEEZ - MOT", { x: margin, y: pageHeight - 44, size: 12, font: bold, color: pdfColor("#e3173e") });
    page.drawText(`MONTHLY ROSTER  ${schedule.operationalYear}/${String(schedule.operationalMonth).padStart(2, "0")}  V${schedule.version}  ${schedule.status}`, { x: margin, y: pageHeight - 70, size: 22, font: bold, color: pdfColor("#25113e") });
    page.drawText(`${schedule.periodStart} - ${schedule.periodEnd}`, { x: margin, y: pageHeight - 91, size: 10, font: regular, color: pdfColor("#6f6078") });
    y = pageHeight - 125;
  };
  const drawTableHeader = () => {
    page.drawRectangle({ x: margin, y: y - headerHeight, width: tableWidth, height: headerHeight, color: pdfColor("#31164b") });
    page.drawText("EMPLOYEE", { x: margin + 9, y: y - 26, size: 10, font: bold, color: rgb(1, 1, 1) });
    dates.forEach((date, index) => {
      const x = margin + nameWidth + index * dateWidth;
      const day = date.slice(8); const weekday = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"][new Date(`${date}T00:00:00Z`).getUTCDay()];
      const dayWidth = bold.widthOfTextAtSize(day, 8); const weekWidth = regular.widthOfTextAtSize(weekday, 6);
      page.drawText(day, { x: x + (dateWidth - dayWidth) / 2, y: y - 18, size: 8, font: bold, color: rgb(1, 1, 1) });
      page.drawText(weekday, { x: x + (dateWidth - weekWidth) / 2, y: y - 32, size: 6, font: regular, color: pdfColor("#d7cbe1") });
      page.drawLine({ start: { x, y }, end: { x, y: y - headerHeight }, thickness: 0.4, color: pdfColor("#6e587f") });
    });
    y -= headerHeight;
  };
  newPage();
  for (const [label, items] of grouped) {
    if (y - sectionHeight - headerHeight - rowHeight * Math.min(items.length, 2) < 45) newPage();
    page.drawRectangle({ x: margin, y: y - sectionHeight, width: tableWidth, height: sectionHeight, color: pdfColor(label === "FRONT CASHIERS" ? "#b9e2c3" : "#eee5f5") });
    page.drawText(label, { x: margin + 9, y: y - 19, size: 11, font: bold, color: pdfColor("#25113e") }); y -= sectionHeight;
    drawTableHeader();
    for (const row of items) {
      if (y - rowHeight < 35) { newPage(); page.drawText(`${label} - CONTINUED`, { x: margin, y: y - 18, size: 11, font: bold, color: pdfColor("#25113e") }); y -= 28; drawTableHeader(); }
      page.drawRectangle({ x: margin, y: y - rowHeight, width: nameWidth, height: rowHeight, color: pdfColor(row.employee.department === "CASHIER" ? "#dcefe1" : "#fbfaf8"), borderColor: pdfColor("#d7ccd9"), borderWidth: 0.5 });
      page.drawText(fitText(bold, row.employee.name, nameWidth - 18, 9), { x: margin + 8, y: y - 14, size: 9, font: bold, color: pdfColor("#25113e") });
      page.drawText(fitText(regular, row.employee.hrisNumber || row.employee.localEmployeeCode || "", nameWidth - 18, 6), { x: margin + 8, y: y - 24, size: 6, font: regular, color: pdfColor("#74617c") });
      dates.forEach((date, index) => {
        const x = margin + nameWidth + index * dateWidth; const value = row.values.get(date) || "";
        page.drawRectangle({ x, y: y - rowHeight, width: dateWidth, height: rowHeight, color: pdfColor(codeColor(value)), borderColor: pdfColor("#ffffff"), borderWidth: 0.5 });
        if (value) { const shown = fitText(bold, value, dateWidth - 3, 6.5); const width = bold.widthOfTextAtSize(shown, 6.5); page.drawText(shown, { x: x + Math.max(1.5, (dateWidth - width) / 2), y: y - 19, size: 6.5, font: bold, color: pdfColor("#1f3157") }); }
      });
      y -= rowHeight;
    }
    y -= 16;
  }
  for (const [index, currentPage] of pdf.getPages().entries()) currentPage.drawText(`Billy Beez MOT  |  Page ${index + 1} of ${pdf.getPageCount()}`, { x: margin, y: 17, size: 7, font: regular, color: pdfColor("#74617c") });
  return pdf.save();
}

export async function GET(request) {
  const { error } = await authorizeApi("OPS_SCHEDULE_READ"); if (error) return error;
  const url = new URL(request.url); const id = String(url.searchParams.get("scheduleId") || ""); const format = String(url.searchParams.get("format") || "xlsx").toLowerCase();
  const schedule = await prisma.opsSchedule.findUnique({
    where: { id },
    include: {
      assignments: {
        where: { employee: { department: { in: ["OPERATION", "CASHIER"] } } },
        include: { employee: { select: { name: true, hrisNumber: true, localEmployeeCode: true, department: true } } },
        orderBy: [{ employee: { name: "asc" } }, { workDate: "asc" }],
      },
    },
  });
  if (!schedule) return NextResponse.json({ success: false, error: "Schedule not found" }, { status: 404 });
  if (format === "pdf") {
    const output = await schedulePdf(schedule);
    return new NextResponse(output, { headers: { "content-type": "application/pdf", "content-disposition": `attachment; filename="MOT-roster-${schedule.operationalYear}-${String(schedule.operationalMonth).padStart(2, "0")}-v${schedule.version}.pdf"`, "cache-control": "no-store" } });
  }
  const dates = [...new Set(schedule.assignments.map((item) => item.workDate))].sort(); const rows = new Map();
  for (const assignment of schedule.assignments) { const row = rows.get(assignment.employeeId) || { employee: assignment.employee, values: new Map() }; row.values.set(assignment.workDate, assignment.importRawValue || assignment.code); rows.set(assignment.employeeId, row); }
  const sheetRows = [["Employee", "Employee ID", "Department", ...dates], ...[...rows.values()].map((row) => [row.employee.name, row.employee.hrisNumber || row.employee.localEmployeeCode || "", row.employee.department || "", ...dates.map((date) => row.values.get(date) || "")])];
  const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${sheetRows.map((row, index) => `<row r="${index + 1}">${row.map(cell).join("")}</row>`).join("")}</sheetData></worksheet>`;
  const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Roster" sheetId="1" r:id="rId1"/></sheets></workbook>`;
  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`;
  const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
  const workbookRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`;
  const output = zip([["[Content_Types].xml", contentTypes], ["_rels/.rels", rootRels], ["xl/workbook.xml", workbook], ["xl/_rels/workbook.xml.rels", workbookRels], ["xl/worksheets/sheet1.xml", sheet]]);
  return new NextResponse(output, { headers: { "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "content-disposition": `attachment; filename="MOT-roster-${schedule.operationalYear}-${String(schedule.operationalMonth).padStart(2, "0")}-v${schedule.version}.xlsx`, "cache-control": "no-store" } });
}
