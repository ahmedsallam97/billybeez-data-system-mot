import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authorizeApi } from "@/lib/api-auth";

export async function GET() {
  const { error } = await authorizeApi("OPS_HEALTH_READ");
  if (error) return error;
  try {
    const databasePath = path.join(process.cwd(), "prisma", "dev.db");
    const backupPath = path.join(process.cwd(), "backups");
    const [integrityRows, databaseStat, backupNames, recentOperations] = await Promise.all([
      prisma.$queryRawUnsafe("PRAGMA integrity_check"),
      fs.stat(databasePath),
      fs.readdir(backupPath).catch(() => []),
      prisma.auditLog.findMany({ where: { action: { startsWith: "OPS_" } }, include: { user: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 6 }),
    ]);
    const latestBackups = (await Promise.all(backupNames.filter((name) => name.endsWith(".db")).map(async (name) => {
      const stat = await fs.stat(path.join(backupPath, name));
      return { name, sizeBytes: stat.size, modifiedAt: stat.mtime };
    }))).sort((a, b) => new Date(b.modifiedAt) - new Date(a.modifiedAt)).slice(0, 5);
    const integrity = String(integrityRows[0]?.integrity_check || integrityRows[0]?.["integrity_check"] || "unknown");
    return NextResponse.json({ success: true, database: { integrity, sizeBytes: databaseStat.size, modifiedAt: databaseStat.mtime }, backups: latestBackups, recentOperations: recentOperations.map((item) => ({ id: item.id, action: item.action, summary: item.summary, createdAt: item.createdAt, user: item.user?.name || "System" })), localOnly: true });
  } catch (healthError) {
    return NextResponse.json({ success: false, error: healthError.message }, { status: 500 });
  }
}
