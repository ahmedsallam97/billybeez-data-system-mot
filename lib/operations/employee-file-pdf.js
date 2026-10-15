const fs = require("node:fs");
const path = require("node:path");
const fontkitModule = require("@pdf-lib/fontkit");

const { PDFDocument } = require("pdf-lib");
const fontkit = fontkitModule.default || fontkitModule;

const PAGE = [595.28, 841.89];

// Full OFL Tajawal fonts include Arabic, Latin and numerals in the same run.
async function loadFonts(pdf) {
  pdf.registerFontkit(fontkit);
  const embed = file => pdf.embedFont(fs.readFileSync(path.join(process.cwd(), "public", "fonts", "pdf", file)), { subset: true });
  const [regular, bold] = await Promise.all([embed("Tajawal-Regular.ttf"), embed("Tajawal-Bold.ttf")]);
  return { arabicRegular: regular, arabicBold: bold, latinRegular: regular, latinBold: bold };
}
function createFontPicker(fonts) { return (_text, bold = false) => bold ? fonts.latinBold : fonts.latinRegular; }

async function appendAttachment(pdf, document, data) {
  if (document.mimeType === "application/pdf") { const source = await PDFDocument.load(data, { ignoreEncryption: true }); const pages = await pdf.copyPages(source, source.getPageIndices()); pages.forEach((page) => pdf.addPage(page)); return pages.length; }
  if (document.mimeType === "image/jpeg" || document.mimeType === "image/png") { const image = document.mimeType === "image/png" ? await pdf.embedPng(data) : await pdf.embedJpg(data); const page = pdf.addPage(PAGE); const bounds = image.scaleToFit(PAGE[0] - 72, PAGE[1] - 100); page.drawImage(image, { x: (PAGE[0] - bounds.width) / 2, y: (PAGE[1] - bounds.height) / 2 - 12, width: bounds.width, height: bounds.height }); return 1; }
  if (document.mimeType === "image/webp") { const png = await require("sharp")(data).png().toBuffer(); return appendAttachment(pdf, { ...document, mimeType: "image/png" }, png); }
  throw new Error(`Unsupported attachment format: ${document.mimeType}`);
}

async function buildCompleteEmployeeFilePdf(options) {
  return require("./employee-profile-report").buildEmployeeProfileReport({ mode: "FULL_RESTRICTED", includeAttachments: true, ...options, loadFonts, appendAttachment });
}
module.exports = { buildCompleteEmployeeFilePdf, loadFonts, createFontPicker };
