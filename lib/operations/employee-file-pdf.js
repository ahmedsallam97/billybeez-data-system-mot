const fs = require("node:fs");
const path = require("node:path");
const fontkitModule = require("@pdf-lib/fontkit");
const { PDFDocument, rgb } = require("pdf-lib");

const fontkit = fontkitModule.default || fontkitModule;

const FONT_PATHS = {
  arabicRegular: "tajawal-arabic-400.woff",
  arabicBold: "tajawal-arabic-700.woff",
  latinRegular: "tajawal-latin-400.woff",
  latinBold: "tajawal-latin-700.woff",
};

const PAGE = [595.28, 841.89];
const PURPLE = rgb(0.16, 0.06, 0.29);
const RED = rgb(0.9, 0.05, 0.2);
const GOLD = rgb(0.96, 0.72, 0.02);
const MUTED = rgb(0.35, 0.31, 0.4);
const ARABIC = /[\u0600-\u06ff\u0750-\u077f\u08a0-\u08ff]/;

const labels = {
  en: {
    title: "BILLY BEEZ | COMPLETE EMPLOYEE FILE", employee: "Employee", code: "Employee code", position: "Position", department: "Department", branch: "Branch", status: "Employment status", period: "Reporting period",
    summary: "Annual record summary", schedule: "Schedule records", attendance: "Attendance records", evaluations: "Daily evaluations", appraisals: "Monthly appraisals", feedback: "Guest feedback", guidance: "Guidance and penalties", incidents: "Incidents", training: "Training records", qualifications: "Qualifications",
    incidentRegister: "Incident register", noIncidents: "No incidents recorded for this file.", guidanceFeedback: "Guidance and guest feedback", noGuidanceFeedback: "No guidance or guest feedback records.", attachments: "Protected attachment index", noAttachments: "No active protected attachments.", failedAttachments: "ATTACHMENTS NOT EMBEDDED",
  },
  ar: {
    title: "بيلي بيز   ملف الموظف الكامل", employee: "الموظف", code: "الرقم الوظيفي", position: "المسمى الوظيفي", department: "القسم", branch: "الفرع", status: "حالة التوظيف", period: "فترة التقرير",
    summary: "ملخص السجل السنوي", schedule: "سجلات الجدول", attendance: "سجلات الحضور", evaluations: "التقييمات اليومية", appraisals: "التقييمات الشهرية", feedback: "آراء الضيوف", guidance: "التوجيهات والجزاءات", incidents: "الحوادث", training: "سجلات التدريب", qualifications: "المؤهلات",
    incidentRegister: "سجل الحوادث", noIncidents: "لا توجد حوادث مسجلة في هذا الملف.", guidanceFeedback: "التوجيهات وآراء الضيوف", noGuidanceFeedback: "لا توجد توجيهات أو آراء ضيوف مسجلة.", attachments: "فهرس المرفقات المحمية", noAttachments: "لا توجد مرفقات محمية نشطة.", failedAttachments: "مرفقات لم يتم دمجها",
  },
};
const enumAr = { LOW: "منخفض", MEDIUM: "متوسط", HIGH: "مرتفع", CRITICAL: "حرج", OPEN: "مفتوح", INVESTIGATING: "قيد التحقيق", CLOSED: "مغلق", OPERATIONAL: "تشغيلي", SAFETY: "سلامة", GUEST: "ضيف", BEHAVIOR: "سلوك", PROPERTY: "ممتلكات", OTHER: "أخرى", GUIDANCE: "توجيه", WARNING: "إنذار", PENALTY: "جزاء", COMMENDATION: "إشادة" };

function safeText(value) { return String(value ?? "-").replace(/[\u0000-\u001f\u007f]/g, " ").trim() || "-"; }
function translated(value, language) { return language === "ar" ? (enumAr[value] || value) : value; }
function formatDate(value) { if (!value) return "-"; const date = new Date(value); return Number.isNaN(date.getTime()) ? safeText(value) : date.toISOString().slice(0, 10); }

async function loadFonts(pdf) {
  pdf.registerFontkit(fontkit);
  const embed = (fileName) => pdf.embedFont(fs.readFileSync(path.join(process.cwd(), "public", "fonts", "pdf", fileName)), { subset: true });
  const [arabicRegular, arabicBold, latinRegular, latinBold] = await Promise.all([
    embed(FONT_PATHS.arabicRegular), embed(FONT_PATHS.arabicBold),
    embed(FONT_PATHS.latinRegular), embed(FONT_PATHS.latinBold),
  ]);
  return { arabicRegular, arabicBold, latinRegular, latinBold };
}

function createFontPicker(fonts) { return (text, bold = false) => ARABIC.test(safeText(text)) ? (bold ? fonts.arabicBold : fonts.arabicRegular) : (bold ? fonts.latinBold : fonts.latinRegular); }
function wrap(text, fontFor, size, width) { const words = safeText(text).split(/\s+/).filter(Boolean); const lines = []; let line = ""; for (const word of words) { const candidate = line ? `${line} ${word}` : word; const font = fontFor(candidate); if (font.widthOfTextAtSize(candidate, size) <= width || !line) line = candidate; else { lines.push(line); line = word; } } if (line) lines.push(line); return lines.length ? lines : ["-"]; }

function createWriter(pdf, fontFor, rtl) {
  let page; let y;
  const draw = (text, { size, bold = false, color, left = 42, rightAligned = rtl }) => { const value = safeText(text); const font = fontFor(value, bold); const width = font.widthOfTextAtSize(value, size); page.drawText(value, { x: rightAligned ? PAGE[0] - 42 - width : left, y, size, font, color }); };
  function newPage(title) { page = pdf.addPage(PAGE); y = PAGE[1] - 52; page.drawRectangle({ x: 0, y: PAGE[1] - 18, width: PAGE[0], height: 18, color: GOLD }); if (title) { draw(title, { size: 18, bold: true, color: PURPLE }); y -= 34; } return page; }
  function ensure(height = 22) { if (!page || y - height < 44) newPage(); }
  function heading(text) { ensure(64); draw(text, { size: 13, bold: true, color: RED }); y -= 22; }
  function line(label, value, options = {}) {
    const size = options.size || 9.5; const labelText = safeText(label); const valueText = safeText(value);
    if (rtl) { const lines = wrap(valueText, fontFor, size, PAGE[0] - 84); ensure((label ? 1 : 0) * (size + 4) + lines.length * (size + 4) + 6); if (label) { draw(labelText, { size, bold: true, color: PURPLE }); y -= size + 5; } lines.forEach((item) => { draw(item, { size, color: options.color || MUTED }); y -= size + 4; }); y -= 4; return; }
    const prefix = label ? `${labelText}: ` : ""; const labelFont = fontFor(prefix, true); const prefixWidth = prefix ? labelFont.widthOfTextAtSize(prefix, size) : 0; const lines = wrap(valueText, fontFor, size, PAGE[0] - 84 - prefixWidth); ensure(lines.length * (size + 4) + 4);
    if (prefix) draw(prefix, { size, bold: true, color: PURPLE, rightAligned: false });
    lines.forEach((item, index) => { const font = fontFor(item); page.drawText(item, { x: 42 + (index ? 0 : prefixWidth), y: y - index * (size + 4), size, font, color: options.color || MUTED }); }); y -= lines.length * (size + 4) + 5;
  }
  function gap(amount = 8) { y -= amount; }
  return { gap, heading, line, newPage };
}

async function appendAttachment(pdf, document, data) {
  if (document.mimeType === "application/pdf") { const source = await PDFDocument.load(data, { ignoreEncryption: true }); const pages = await pdf.copyPages(source, source.getPageIndices()); pages.forEach((page) => pdf.addPage(page)); return pages.length; }
  if (document.mimeType === "image/jpeg" || document.mimeType === "image/png") { const image = document.mimeType === "image/png" ? await pdf.embedPng(data) : await pdf.embedJpg(data); const page = pdf.addPage(PAGE); const bounds = image.scaleToFit(PAGE[0] - 72, PAGE[1] - 100); page.drawImage(image, { x: (PAGE[0] - bounds.width) / 2, y: (PAGE[1] - bounds.height) / 2 - 12, width: bounds.width, height: bounds.height }); return 1; }
  throw new Error(`Unsupported attachment format: ${document.mimeType}`);
}

async function buildCompleteEmployeeFilePdf({ employee, year, endDate, readAttachment, language = "en" }) {
  const selectedLanguage = language === "ar" ? "ar" : "en"; const text = labels[selectedLanguage]; const rtl = selectedLanguage === "ar"; const pdf = await PDFDocument.create(); const fonts = await loadFonts(pdf); const fontFor = createFontPicker(fonts); const writer = createWriter(pdf, fontFor, rtl);
  writer.newPage(text.title); writer.line(text.employee, employee.name, { size: 15, color: PURPLE }); writer.line(text.code, employee.hrisNumber || employee.localEmployeeCode || "-"); writer.line(text.position, employee.jobTitle || "-"); writer.line(text.department, employee.department || "-"); writer.line(text.branch, employee.branch || "MOT"); writer.line(text.status, employee.employmentStatus || "-"); writer.line(text.period, `${year}-01-01 - ${endDate}`); writer.gap(12);
  writer.heading(text.summary); [[text.schedule, employee.scheduleAssignments?.length || 0], [text.attendance, employee.attendanceRecords?.length || 0], [text.evaluations, employee.dailyEvaluations?.length || 0], [text.appraisals, employee.monthlyAppraisals?.length || 0], [text.feedback, employee.guestFeedback?.length || 0], [text.guidance, employee.guidanceRecords?.length || 0], [text.incidents, employee.incidents?.length || 0], [text.training, employee.trainingRecords?.length || 0], [text.qualifications, employee.qualifications?.length || 0]].forEach(([label, value]) => writer.line(label, value));
  writer.heading(text.incidentRegister);
  if (employee.incidents?.length) employee.incidents.forEach((item) => { if (rtl) { writer.line("تاريخ الحادث", formatDate(item.incidentDate)); writer.line("الخطورة والحالة", `${translated(item.severity, selectedLanguage)}، ${translated(item.status, selectedLanguage)}`); writer.line(translated(item.incidentType, selectedLanguage), `${item.title}${item.description ? `، ${item.description}` : ""}`); } else writer.line(`${formatDate(item.incidentDate)} | ${item.severity} | ${item.status}`, `${item.incidentType}: ${item.title}${item.description ? ` - ${item.description}` : ""}`); }); else writer.line("", text.noIncidents);
  writer.heading(text.guidanceFeedback);
  (employee.guidanceRecords || []).forEach((item) => { if (rtl) { writer.line("تاريخ السجل", formatDate(item.recordDate)); writer.line(translated(item.recordType, selectedLanguage), `${item.title}${item.details ? `، ${item.details}` : ""}`); } else writer.line(`${formatDate(item.recordDate)} | ${item.recordType}`, `${item.title}${item.details ? ` - ${item.details}` : ""}`); });
  (employee.guestFeedback || []).forEach((item) => { if (rtl) { writer.line("تاريخ الرأي", formatDate(item.feedbackDate)); if (item.rating) writer.line("التقييم", `${item.rating}/5`); writer.line(text.feedback, item.comment); } else writer.line(`${formatDate(item.feedbackDate)} | ${text.feedback}${item.rating ? ` | ${item.rating}/5` : ""}`, item.comment); });
  if (!employee.guidanceRecords?.length && !employee.guestFeedback?.length) writer.line("", text.noGuidanceFeedback);
  const activeDocuments = (employee.documents || []).filter((item) => item.status === "ACTIVE"); writer.heading(text.attachments); if (!activeDocuments.length) writer.line("", text.noAttachments); activeDocuments.forEach((item, index) => { if (rtl) { writer.line("رقم ونوع المرفق", `${index + 1}. ${item.documentType}`); writer.line("اسم الملف", item.displayName); writer.line("الصيغة والحجم", `${item.mimeType} - ${Math.ceil(item.sizeBytes / 1024)} KB`); } else writer.line(`${index + 1}. ${item.documentType}`, `${item.displayName} | ${item.mimeType} | ${Math.ceil(item.sizeBytes / 1024)} KB`); });
  const failed = []; let appendedPages = 0; for (const document of activeDocuments) { try { appendedPages += await appendAttachment(pdf, document, await readAttachment(document)); } catch (error) { failed.push(`${document.displayName}: ${error.message}`); } } if (failed.length) { writer.newPage(text.failedAttachments); failed.forEach((item) => writer.line("", item)); }
  const pages = pdf.getPages(); pages.forEach((page, index) => { if (rtl) { const footer = "سجل موظف سري"; const font = fontFor(footer); const width = font.widthOfTextAtSize(footer, 7.5); page.drawText(footer, { x: PAGE[0] - 42 - width, y: 20, size: 7.5, font, color: MUTED }); const count = `${index + 1}/${pages.length}`; page.drawText(count, { x: 42, y: 20, size: 7.5, font: fontFor(count), color: MUTED }); } else { const footer = `Billy Beez confidential employee record | Page ${index + 1} of ${pages.length}`; page.drawText(footer, { x: 42, y: 20, size: 7.5, font: fontFor(footer), color: MUTED }); } });
  pdf.setTitle(`${selectedLanguage === "ar" ? "ملف الموظف الكامل" : "Complete Employee File"} - ${safeText(employee.name)}`); pdf.setSubject(`${year}-01-01 - ${endDate}; ${appendedPages} attachment page(s) embedded`); pdf.setCreator("Billy Beez MOT Operations System"); pdf.setLanguage(selectedLanguage === "ar" ? "ar-EG" : "en-GB"); return Buffer.from(await pdf.save());
}

module.exports = { buildCompleteEmployeeFilePdf };
