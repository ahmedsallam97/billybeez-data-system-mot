const test = require("node:test");
const assert = require("node:assert/strict");
const { PDFDocument } = require("pdf-lib");
const { buildCompleteEmployeeFilePdf } = require("../lib/operations/employee-file-pdf");

test("complete employee PDF embeds protected PDF attachments", async () => {
  const attachment = await PDFDocument.create(); attachment.addPage([200, 200]); const bytes = Buffer.from(await attachment.save());
  const result = await buildCompleteEmployeeFilePdf({ employee: { name: "Test Employee", hrisNumber: "T-1", documents: [{ status: "ACTIVE", documentType: "CERTIFICATE", displayName: "certificate.pdf", mimeType: "application/pdf", sizeBytes: bytes.length, storageKey: "test" }], incidents: [], guidanceRecords: [], guestFeedback: [] }, year: 2026, endDate: "2026-09-25", readAttachment: async () => bytes });
  assert.equal(result.subarray(0, 4).toString(), "%PDF");
  const merged = await PDFDocument.load(result);
  assert.ok(merged.getPageCount() >= 2);
  assert.match(merged.getSubject(), /1 attachment page/);
});

test("complete employee PDF embeds Arabic fonts and metadata", async () => {
  const result = await buildCompleteEmployeeFilePdf({ employee: { name: "موظف تجريبي", jobTitle: "مشغل ألعاب", documents: [], incidents: [{ incidentDate: "2026-09-25", severity: "LOW", status: "CLOSED", incidentType: "SAFETY", title: "تجربة سلامة", description: "تمت المتابعة" }], guidanceRecords: [], guestFeedback: [] }, year: 2026, endDate: "2026-09-25", language: "ar", readAttachment: async () => Buffer.alloc(0) });
  const pdf = await PDFDocument.load(result);
  assert.match(pdf.getTitle(), /ملف الموظف الكامل/);
  assert.ok(pdf.getPageCount() >= 1);
});
