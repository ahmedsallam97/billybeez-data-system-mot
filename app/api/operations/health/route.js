import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authorizeApi } from "@/lib/api-auth";
import { databaseProvider } from "@/lib/database-provider";

export async function GET() {
  const { error } = await authorizeApi("OPS_HEALTH_READ");
  if (error) return error;
  try {
    const provider = databaseProvider();
    const recentOperationsPromise = prisma.auditLog.findMany({ where: { action: { startsWith: "OPS_" } }, include: { user: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 6 });
    let database;
    let latestBackups = [];

    if (provider === "postgresql") {
      await prisma.$queryRawUnsafe("SELECT 1 AS ok");
      database = { provider, integrity: "reachable", sizeBytes: null, modifiedAt: null };
    } else {
      const databasePath = path.join(process.cwd(), "prisma", "dev.db");
      const backupPath = path.join(process.cwd(), "backups");
      const [integrityRows, databaseStat, backupNames] = await Promise.all([
        prisma.$queryRawUnsafe("PRAGMA integrity_check"),
        fs.stat(databasePath),
        fs.readdir(backupPath).catch(() => []),
      ]);
      latestBackups = (await Promise.all(backupNames.filter((name) => name.endsWith(".db")).map(async (name) => {
        const stat = await fs.stat(path.join(backupPath, name));
        return { name, sizeBytes: stat.size, modifiedAt: stat.mtime };
      }))).sort((a, b) => new Date(b.modifiedAt) - new Date(a.modifiedAt)).slice(0, 5);
      database = { provider, integrity: String(integrityRows[0]?.integrity_check || integrityRows[0]?.["integrity_check"] || "unknown"), sizeBytes: databaseStat.size, modifiedAt: databaseStat.mtime };
    }

    const recentOperations = await recentOperationsPromise;
    return NextResponse.json({ success: true, database, backups: latestBackups, recentOperations: recentOperations.map((item) => ({ id: item.id, action: item.action, summary: item.summary, createdAt: item.createdAt, user: item.user?.name || "System" })), localOnly: provider === "sqlite" });
  } catch (healthError) {
    return NextResponse.json({ success: false, error: healthError.message }, { status: 500 });
  }
}
