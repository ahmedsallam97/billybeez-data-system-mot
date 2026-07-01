import fs from "fs";
import { NextResponse } from "next/server";
import { authorizeApi } from "@/lib/api-auth";
import { backupPathFromName, verifyBackupFile } from "@/lib/db-backups";

export async function GET(_request, { params }) {
  const { error } = await authorizeApi("BACKUP_MANAGE");
  if (error) return error;

  const { name } = await params;
  const filePath = backupPathFromName(name);

  if (!fs.existsSync(filePath)) {
    return NextResponse.json({ success: false, error: "Backup file not found" }, { status: 404 });
  }

  verifyBackupFile(filePath);
  const buffer = fs.readFileSync(filePath);

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="${name}"`,
    },
  });
}
