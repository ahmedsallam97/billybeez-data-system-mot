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
  } finally {
    await prisma.$disconnect();
  }
};
