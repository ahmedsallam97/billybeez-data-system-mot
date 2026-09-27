const fs = require("node:fs");
const path = require("node:path");
const { createHmac, randomBytes } = require("node:crypto");

function loadEnv() {
  const file = path.join(process.cwd(), ".env");
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!match || process.env[match[1]] !== undefined) continue;
    process.env[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, "");
  }
}

module.exports = async () => {
  loadEnv();
  const { PrismaClient } = require("@prisma/client");
  const prisma = new PrismaClient();
  try {
    const admin = await prisma.user.findFirst({ where: { active: true, role: "ADMIN" }, select: { id: true } });
    const secret = process.env.SESSION_SECRET;
    if (!admin || !secret || secret.length < 32) throw new Error("E2E requires an active admin and a valid SESSION_SECRET in the local environment");
    const now = Math.floor(Date.now() / 1000);
    const payload = Buffer.from(JSON.stringify({ sub: admin.id, iat: now, exp: now + 3600, jti: randomBytes(16).toString("base64url"), v: 1 })).toString("base64url");
    const signature = createHmac("sha256", secret).update(payload).digest("base64url");
    const authDir = path.join(process.cwd(), "playwright", ".auth");
    fs.mkdirSync(authDir, { recursive: true });
    fs.writeFileSync(path.join(authDir, "admin.json"), JSON.stringify({ cookies: [{ name: process.env.AUTH_COOKIE_NAME || "billybeez_session", value: `${payload}.${signature}`, domain: "127.0.0.1", path: "/", expires: now + 3600, httpOnly: true, secure: false, sameSite: "Strict" }], origins: [] }, null, 2));

    if (process.env.E2E_MUTATIONS === "1") {
      await prisma.opsShiftDefinition.upsert({ where: { code: "AM" }, create: { code: "AM", label: "Morning", startTime: "10:00", endTime: "18:00", colorKey: "am", active: true }, update: { startTime: "10:00", endTime: "18:00", colorKey: "am", active: true } });
      const criteriaVersion = await prisma.opsEvaluationCriteriaVersion.upsert({
        where: { code: "E2E-DAILY-V1" },
        create: { code: "E2E-DAILY-V1", label: "E2E Daily Evaluation", effectiveFrom: "2099-01-01", active: true },
        update: { active: true },
      });
      await prisma.opsEvaluationCriteriaVersion.updateMany({ where: { id: { not: criteriaVersion.id } }, data: { active: false } });
      for (const [index, code] of ["UNIFORM", "POSITION", "SAFETY", "BEHAVIOR", "GUEST"].entries()) {
        await prisma.opsEvaluationCriterion.upsert({
          where: { criteriaVersionId_code: { criteriaVersionId: criteriaVersion.id, code } },
          create: { criteriaVersionId: criteriaVersion.id, code, label: code, category: "DAILY_EVALUATION", maxScore: 10, active: true, sortOrder: (index + 1) * 10 },
          update: { maxScore: 10, active: true, sortOrder: (index + 1) * 10 },
        });
      }
      const performanceEmployees = await prisma.employee.findMany({ where: { active: true, department: { in: ["OPERATION", "CASHIER"] } }, orderBy: { name: "asc" }, take: 2, select: { id: true } });
      if (performanceEmployees.length < 2) throw new Error("E2E performance workflow requires two active Operations or Cashier employees");
      const appraisalFormula = await prisma.opsAppraisalFormulaVersion.upsert({
        where: { code: "E2E-APPRAISAL-V1" },
        create: { code: "E2E-APPRAISAL-V1", label: "E2E Monthly Appraisal", effectiveFrom: "2099-01-01", active: true, configJson: "{}" },
        update: { active: true, configJson: "{}" },
      });
      await prisma.opsEotmFormulaVersion.upsert({
        where: { code: "E2E-EOTM-V1" },
        create: { code: "E2E-EOTM-V1", label: "E2E Employee of the Month", effectiveFrom: "2099-01-01", active: true, configJson: "{}" },
        update: { active: true, configJson: "{}", createdAt: new Date() },
      });
      const oldCompetitions = await prisma.opsEotmCompetition.findMany({ where: { year: 2099, month: 10 }, select: { id: true } });
      if (oldCompetitions.length) {
        await prisma.opsEotmCandidate.deleteMany({ where: { competitionId: { in: oldCompetitions.map((item) => item.id) } } });
        await prisma.opsEotmCompetition.deleteMany({ where: { id: { in: oldCompetitions.map((item) => item.id) } } });
      }
      for (const [index, employee] of performanceEmployees.entries()) {
        await prisma.opsMonthlyAppraisal.upsert({
          where: { employeeId_year_month_version: { employeeId: employee.id, year: 2099, month: 10, version: 1 } },
          create: { employeeId: employee.id, year: 2099, month: 10, version: 1, formulaVersionId: appraisalFormula.id, status: "DRAFT", totalScore: 90 - index * 10, componentSnapshotJson: "{}", sourceSnapshotJson: "{}", calculationExplanationJson: "{}" },
          update: { formulaVersionId: appraisalFormula.id, status: "DRAFT", totalScore: 90 - index * 10, componentSnapshotJson: "{}", sourceSnapshotJson: "{}", calculationExplanationJson: "{}", reviewedBy: null, reviewedAt: null, approvedBy: null, approvedAt: null },
        });
      }
    }
  } finally {
    await prisma.$disconnect();
  }
};
