import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { setCurrentUser } from "@/lib/auth";
import { getRoleHome } from "@/lib/roles";
import { withApiHandler } from "@/lib/api-handler";
import { loginRateLimitKey, rateLimit } from "@/lib/rate-limit";

const DUMMY_PASSWORD_HASH = "$2b$12$yXEMc/F1Q6xYPDuZJf1R0eKcO4nroFtg6rRhJ03zyp5zjJQ2q4YjK";

async function recordLoginAudit({ action, username, request }) {
  try {
    await prisma.auditLog.create({
      data: {
        action,
        summary: `${action} for ${username || "unknown"}`,
        metadata: JSON.stringify({
          username: username || "",
          ip: request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "local",
          userAgent: request.headers.get("user-agent") || "",
        }),
      },
    });
  } catch (error) {
    console.warn("[login-audit]", error?.message || error);
  }
}

async function postLogin(request) {
  const body = await request.json().catch(() => ({}));
  const username = String(body.username || "").trim();
  const password = String(body.password || "");
  const rate = process.env.NODE_ENV === "production"
    ? rateLimit({
        key: loginRateLimitKey(request, username),
        limit: 8,
        windowMs: 10 * 60 * 1000,
      })
    : { allowed: true, resetAt: Date.now() };

  if (!username || !password || username.length > 80 || password.length > 200) {
    await recordLoginAudit({ action: "LOGIN_FAILED", username, request });
    return NextResponse.json({ success: false, error: "Invalid username or password" }, { status: 401 });
  }

  if (!rate.allowed) {
    await recordLoginAudit({ action: "LOGIN_RATE_LIMITED", username, request });
    return NextResponse.json(
      { success: false, error: "Too many login attempts. Try again later." },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.max(1, Math.ceil((rate.resetAt - Date.now()) / 1000))),
        },
      },
    );
  }

  const user = await prisma.user.findUnique({ where: { username } });
  const passwordMatches = await bcrypt.compare(password, user?.password || DUMMY_PASSWORD_HASH);

  if (!user?.active || !passwordMatches) {
    await recordLoginAudit({ action: "LOGIN_FAILED", username, request });
    return NextResponse.json({ success: false, error: "Invalid username or password" }, { status: 401 });
  }

  await setCurrentUser(user);

  return NextResponse.json({
    success: true,
    user: {
      id: user.id,
      name: user.name,
      username: user.username,
      role: user.role,
    },
    home: getRoleHome(user.role),
  });
}

export const POST = withApiHandler(postLogin);
