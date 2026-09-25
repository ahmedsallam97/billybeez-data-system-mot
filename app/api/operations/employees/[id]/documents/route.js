import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { prisma } from "@/lib/db";
import { authorizeApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { writeEmployeeFile } from "@/lib/employee-file-storage";

const PHOTO_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const ALL_TYPES = new Set([...PHOTO_TYPES, "application/pdf"]);
const safeName = (name) => String(name || "file").replace(/[^a-zA-Z0-9._-]/g, "_");

export async function POST(request, { params }) {
  const { user, error } = await authorizeApi("OPS_EMPLOYEE_MANAGE"); if (error) return error;
  const { id } = await params; const form = await request.formData(); const file = form.get("file"); const documentType = String(form.get("documentType") || "OTHER");
  const submittedEmployeeId = String(form.get("employeeId") || "");
  if (!submittedEmployeeId || submittedEmployeeId !== id) return NextResponse.json({ success: false, error: "Upload target does not match the selected employee" }, { status: 409 });
  if (!(file instanceof File) || !file.size || file.size > 8 * 1024 * 1024 || !ALL_TYPES.has(file.type)) return NextResponse.json({ success: false, error: "Use a JPG, PNG, WebP, or PDF up to 8 MB" }, { status: 400 });
  const employee = await prisma.employee.findUnique({ where: { id } }); if (!employee) return NextResponse.json({ success: false, error: "Employee not found" }, { status: 404 });
  if (documentType === "EMPLOYEE_PHOTO" && !PHOTO_TYPES.has(file.type)) return NextResponse.json({ success: false, error: "Employee photo must be an image" }, { status: 400 });
  const storageKey = `${id}/${crypto.randomUUID()}-${safeName(file.name)}`; await writeEmployeeFile(storageKey, Buffer.from(await file.arrayBuffer()), file.type);
  const document = await prisma.$transaction(async (tx) => { if (documentType === "EMPLOYEE_PHOTO") await tx.employeeDocument.updateMany({ where: { employeeId: id, documentType, status: "ACTIVE" }, data: { status: "REPLACED" } }); return tx.employeeDocument.create({ data: { employeeId: id, documentType, displayName: String(form.get("displayName") || file.name), storageKey, mimeType: file.type, sizeBytes: file.size, issueDate: form.get("issueDate") ? new Date(String(form.get("issueDate"))) : null, expiryDate: form.get("expiryDate") ? new Date(String(form.get("expiryDate"))) : null, notes: String(form.get("notes") || "") || null, uploadedBy: user.id } }); });
  await writeAudit({ action: "OPS_EMPLOYEE_DOCUMENT_UPLOADED", user, summary: `Uploaded ${document.documentType} for ${employee.name}`, metadata: { employeeId: id, documentId: document.id, documentType } });
  return NextResponse.json({ success: true, document });
}
