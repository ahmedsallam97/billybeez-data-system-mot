import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authorizeApi } from "@/lib/api-auth";
import { isFinalizedRecognitionCompetition, publicScoreBreakdown } from "@/lib/operations/recognition";
import { getSetting } from "@/lib/settings";

function serializeWinner(competition, branchCode) {
  if (!isFinalizedRecognitionCompetition(competition) || !competition.winner) return null;
  const candidate = competition.candidates.find((item) => item.employeeId === competition.winnerEmployeeId);
  if (!candidate) return null;
  return {
    competitionId: competition.id,
    year: competition.year,
    month: competition.month,
    version: competition.version,
    status: competition.status,
    lockedAt: competition.lockedAt,
    employee: {
      id: competition.winner.id,
      name: competition.winner.name,
      nameAr: competition.winner.nameAr || "",
      nameEn: competition.winner.nameEn || "",
      jobTitle: competition.winner.jobTitle || "",
      photoUrl: competition.winner.documents?.[0] ? `/api/operations/employees/${competition.winner.id}/documents/${competition.winner.documents[0].id}` : null,
    },
    branch: branchCode,
    finalScore: candidate.finalScore,
    rank: candidate.rank,
    scoreBreakdown: publicScoreBreakdown(candidate.componentSnapshotJson),
  };
}

export async function GET(request) {
  const { error } = await authorizeApi("OPS_EOTM_READ");
  if (error) return error;
  const requestedYear = new URL(request.url).searchParams.get("year");
  const year = requestedYear ? Number(requestedYear) : null;
  if (requestedYear && (!Number.isInteger(year) || year < 2020 || year > 2100)) {
    return NextResponse.json({ success: false, error: "Invalid year" }, { status: 400 });
  }
  const [competitions, artworkRaw, branchRaw] = await Promise.all([prisma.opsEotmCompetition.findMany({
    where: { status: "LOCKED", winnerEmployeeId: { not: null }, ...(year ? { year } : {}) },
    include: {
      winner: { select: { id: true, name: true, nameAr: true, nameEn: true, jobTitle: true, documents: { where: { documentType: "EMPLOYEE_PHOTO", status: "ACTIVE" }, orderBy: { uploadedAt: "desc" }, take: 1 } } },
      candidates: { select: { employeeId: true, finalScore: true, rank: true, componentSnapshotJson: true } },
    },
    orderBy: [{ year: "desc" }, { month: "desc" }, { version: "desc" }],
  }), getSetting("RECOGNITION_ARTWORK_CONFIG", "{}"), getSetting("OPS_BRANCH_CONFIG", "{}")]);
  let artworkConfig = {}; let branchConfig = {};
  try { artworkConfig = JSON.parse(artworkRaw); } catch {}
  try { branchConfig = JSON.parse(branchRaw); } catch {}
  const winners = competitions.map((item) => serializeWinner(item, branchConfig.branchCode || "MOT")).filter(Boolean);
  const allYears = await prisma.opsEotmCompetition.findMany({ where: { status: "LOCKED", winnerEmployeeId: { not: null } }, distinct: ["year"], select: { year: true }, orderBy: { year: "desc" } });
  return NextResponse.json({ success: true, currentWinner: winners[0] || null, winners, years: allYears.map((item) => item.year), artworkConfig, branch: branchConfig });
}
