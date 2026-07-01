import { NextResponse } from "next/server";
import { authorizeApi } from "@/lib/api-auth";
import { createBackup, listBackups, restoreBackup } from "@/lib/db-backups";
import { writeAudit } from "@/lib/audit";
import { prisma } from "@/lib/db";

export async function GET() {
  const { error } = await authorizeApi("BACKUP_MANAGE");
  if (error) return error;

  return NextResponse.json({ success: true, backups: listBackups() });
}

export async function POST(request) {
  const { user, error } = await authorizeApi("BACKUP_MANAGE");
  if (error) return error;

  const body = await request.json().catch(() => ({}));
  const action = String(body.action || "create");

  if (action === "restore") {
    const name = String(body.name || "");
    await writeAudit({
      action: "DATABASE_RESTORE_REQUESTED",
      user,
      summary: `Requested database restore ${name}`,
      metadata: { name },
      reason: "Manager restored database backup from admin settings",
    });
    const result = restoreBackup(name);
    await prisma.$disconnect();
    return NextResponse.json({ success: true, ...result });
  }

  const backup = createBackup("manual");
  await writeAudit({
    action: "DATABASE_BACKUP_CREATED",
    user,
    summary: `Created database backup ${backup.name}`,
    metadata: backup,
    reason: "Manager created database backup from admin settings",
  });

  return NextResponse.json({ success: true, backup });
}
