import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authorizeApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";

function serializePrintJob(job) {
  return {
    id: job.id,
    orderId: job.orderId,
    type: job.type,
    status: job.status,
    printerName: job.printerName || "",
    error: job.error || "",
    printedAt: job.printedAt,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  };
}

export async function PATCH(request, { params }) {
  const { user, error } = await authorizeApi("PRINT_JOB_UPDATE");
  if (error) return error;

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const status = body.status === "PRINTED" ? "PRINTED" : body.status === "FAILED" ? "FAILED" : null;

  if (!status) {
    return NextResponse.json({ success: false, error: "Invalid print job status" }, { status: 400 });
  }

  const current = await prisma.printJob.findUnique({ where: { id } });

  if (!current) {
    return NextResponse.json({ success: false, error: "Print job not found" }, { status: 404 });
  }

  const job = await prisma.printJob.update({
    where: { id },
    data: {
      status,
      error: status === "FAILED" ? String(body.error || "Print failed") : null,
      printedAt: status === "PRINTED" ? new Date() : current.printedAt,
    },
  });

  await writeAudit({
    action: status === "PRINTED" ? "PRINT_JOB_PRINTED" : "PRINT_JOB_FAILED",
    orderId: job.orderId,
    user,
    summary: status === "PRINTED" ? "Print job printed" : "Print job failed",
    metadata: {
      printJobId: job.id,
      type: job.type,
      error: job.error,
    },
  });

  return NextResponse.json({ success: true, job: serializePrintJob(job) });
}
