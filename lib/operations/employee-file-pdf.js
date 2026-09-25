const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");

const PAGE = [595.28, 841.89];
const PURPLE = rgb(0.16, 0.06, 0.29);
const RED = rgb(0.9, 0.05, 0.2);
const GOLD = rgb(0.96, 0.72, 0.02);
const MUTED = rgb(0.35, 0.31, 0.4);

function printable(value) {
  return String(value ?? "-").replace(/[^\x20-\x7E]/g, "?");
}

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? printable(value) : date.toISOString().slice(0, 10);
}

function wrap(text, font, size, width) {
  const words = printable(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= width || !line) line = candidate;
    else { lines.push(line); line = word; }
  }
  if (line) lines.push(line);
  return lines.length ? lines : ["-"];
}

function createWriter(pdf, regular, bold) {
  let page;
  let y;
  function newPage(title) {
    page = pdf.addPage(PAGE); y = PAGE[1] - 52;
    page.drawRectangle({ x: 0, y: PAGE[1] - 18, width: PAGE[0], height: 18, color: GOLD });
    if (title) { page.drawText(printable(title), { x: 42, y, size: 18, font: bold, color: PURPLE }); y -= 34; }
    return page;
  }
  function ensure(height = 22) { if (!page || y - height < 44) newPage(); }
  function heading(text) { ensure(38); page.drawText(printable(text), { x: 42, y, size: 13, font: bold, color: RED }); y -= 22; }
  function line(label, value, options = {}) {
    const size = options.size || 9.5; const labelText = printable(label); const prefix = labelText ? `${labelText}: ` : "";
    const prefixWidth = labelText ? bold.widthOfTextAtSize(prefix, size) : 0;
    const lines = wrap(value, regular, size, PAGE[0] - 84 - prefixWidth);
    ensure(lines.length * (size + 4) + 4);
    if (prefix) page.drawText(prefix, { x: 42, y, size, font: bold, color: PURPLE });
    lines.forEach((item, index) => page.drawText(item, { x: 42 + (index ? 0 : prefixWidth), y: y - index * (size + 4), size, font: regular, color: options.color || MUTED }));
    y -= lines.length * (size + 4) + 5;
  }
  function gap(amount = 8) { y -= amount; }
  return { gap, heading, line, newPage };
}

async function appendAttachment(pdf, document, data) {
  if (document.mimeType === "application/pdf") {
    const source = await PDFDocument.load(data, { ignoreEncryption: true });
    const pages = await pdf.copyPages(source, source.getPageIndices());
    pages.forEach((page) => pdf.addPage(page));
    return pages.length;
  }
  if (document.mimeType === "image/jpeg" || document.mimeType === "image/png") {
    const image = document.mimeType === "image/png" ? await pdf.embedPng(data) : await pdf.embedJpg(data);
    const page = pdf.addPage(PAGE);
    const bounds = image.scaleToFit(PAGE[0] - 72, PAGE[1] - 100);
    page.drawImage(image, { x: (PAGE[0] - bounds.width) / 2, y: (PAGE[1] - bounds.height) / 2 - 12, width: bounds.width, height: bounds.height });
    return 1;
  }
  throw new Error(`Unsupported attachment format: ${document.mimeType}`);
}

async function buildCompleteEmployeeFilePdf({ employee, year, endDate, readAttachment }) {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const writer = createWriter(pdf, regular, bold);
  writer.newPage("BILLY BEEZ | COMPLETE EMPLOYEE FILE");
  writer.line("Employee", employee.name, { size: 15, color: PURPLE });
  writer.line("Employee code", employee.hrisNumber || employee.localEmployeeCode || "-");
  writer.line("Position", employee.jobTitle || "-");
  writer.line("Department", employee.department || "-");
  writer.line("Branch", employee.branch || "MOT");
  writer.line("Employment status", employee.employmentStatus || "-");
  writer.line("Reporting period", `${year}-01-01 to ${endDate}`);
  writer.gap(12);
  writer.heading("Annual record summary");
  writer.line("Schedule records", employee.scheduleAssignments?.length || 0);
  writer.line("Attendance records", employee.attendanceRecords?.length || 0);
  writer.line("Daily evaluations", employee.dailyEvaluations?.length || 0);
  writer.line("Monthly appraisals", employee.monthlyAppraisals?.length || 0);
  writer.line("Guest feedback", employee.guestFeedback?.length || 0);
  writer.line("Guidance and penalties", employee.guidanceRecords?.length || 0);
  writer.line("Incidents", employee.incidents?.length || 0);
  writer.line("Training records", employee.trainingRecords?.length || 0);
  writer.line("Qualifications", employee.qualifications?.length || 0);

  writer.heading("Incident register");
  if (employee.incidents?.length) employee.incidents.forEach((item) => writer.line(`${formatDate(item.incidentDate)} | ${item.severity} | ${item.status}`, `${item.incidentType}: ${item.title}${item.description ? ` - ${item.description}` : ""}`));
  else writer.line("", "No incidents recorded for this file.");

  writer.heading("Guidance and guest feedback");
  (employee.guidanceRecords || []).forEach((item) => writer.line(`${formatDate(item.recordDate)} | ${item.recordType}`, `${item.title}${item.details ? ` - ${item.details}` : ""}`));
  (employee.guestFeedback || []).forEach((item) => writer.line(`${formatDate(item.feedbackDate)} | Guest feedback${item.rating ? ` | ${item.rating}/5` : ""}`, item.comment));
  if (!employee.guidanceRecords?.length && !employee.guestFeedback?.length) writer.line("", "No guidance or guest feedback records.");

  const activeDocuments = (employee.documents || []).filter((item) => item.status === "ACTIVE");
  writer.heading("Protected attachment index");
  if (!activeDocuments.length) writer.line("", "No active protected attachments.");
  activeDocuments.forEach((item, index) => writer.line(`${index + 1}. ${item.documentType}`, `${item.displayName} | ${item.mimeType} | ${Math.ceil(item.sizeBytes / 1024)} KB`));

  const failed = [];
  let appendedPages = 0;
  for (const document of activeDocuments) {
    try {
      const data = await readAttachment(document);
      appendedPages += await appendAttachment(pdf, document, data);
    } catch (error) {
      failed.push(`${document.displayName}: ${error.message}`);
    }
  }
  if (failed.length) {
    writer.newPage("ATTACHMENTS NOT EMBEDDED");
    failed.forEach((item) => writer.line("", item));
  }

  const pages = pdf.getPages();
  pages.forEach((page, index) => {
    page.drawText(`Billy Beez confidential employee record | Page ${index + 1} of ${pages.length}`, { x: 42, y: 20, size: 7.5, font: regular, color: MUTED });
  });
  pdf.setTitle(`Complete Employee File - ${printable(employee.name)}`);
  pdf.setSubject(`Employee file for ${year}-01-01 to ${endDate}; ${appendedPages} attachment page(s) embedded`);
  pdf.setCreator("Billy Beez MOT Operations System");
  return Buffer.from(await pdf.save());
}

module.exports = { buildCompleteEmployeeFilePdf };
