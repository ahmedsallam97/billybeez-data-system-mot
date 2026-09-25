const fs = require("node:fs/promises");
const path = require("node:path");
const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");
const { buildCompleteEmployeeFilePdf } = require("../lib/operations/employee-file-pdf");

async function sampleAttachment() {
  const pdf = await PDFDocument.create(); const font = await pdf.embedFont(StandardFonts.HelveticaBold); const page = pdf.addPage([420, 300]);
  page.drawText("SAMPLE TRAINING CERTIFICATE", { x: 45, y: 210, size: 19, font, color: rgb(0.16, 0.06, 0.29) });
  page.drawText("Attachment merge verification", { x: 80, y: 160, size: 12, font });
  return Buffer.from(await pdf.save());
}

async function main() {
  const attachment = await sampleAttachment();
  const employee = {
    name: "Sample Employee", hrisNumber: "SAMPLE-001", jobTitle: "Ride Operator", department: "Operations", branch: "MOT", employmentStatus: "ACTIVE",
    scheduleAssignments: [{ id: "s1" }], attendanceRecords: [{ id: "a1" }], dailyEvaluations: [{ id: "e1" }], monthlyAppraisals: [],
    guestFeedback: [{ id: "g1", feedbackDate: "2026-09-10", rating: 5, comment: "Helpful and attentive" }],
    guidanceRecords: [], incidents: [{ id: "i1", incidentDate: "2026-09-12", severity: "LOW", status: "CLOSED", incidentType: "OPERATIONAL", title: "Sample drill", description: "Training-only verification record" }],
    trainingRecords: [{ id: "t1" }], qualifications: [{ id: "q1" }],
    documents: [{ id: "d1", status: "ACTIVE", documentType: "CERTIFICATE", displayName: "sample-certificate.pdf", mimeType: "application/pdf", sizeBytes: attachment.length, storageKey: "sample" }],
  };
  const result = await buildCompleteEmployeeFilePdf({ employee, year: 2026, endDate: "2026-09-25", readAttachment: async () => attachment });
  const target = path.join(process.cwd(), "output", "pdf", "employee-complete-file-merged-sample.pdf");
  await fs.mkdir(path.dirname(target), { recursive: true }); await fs.writeFile(target, result); console.log(target);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
