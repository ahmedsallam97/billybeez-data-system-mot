const { createHmac, randomBytes, timingSafeEqual } = require("crypto");
const { cookies } = require("next/headers");
const { redirect } = require("next/navigation");
const { prisma } = require("./db");
const { getRoleHome } = require("./roles");

const COOKIE_NAME = process.env.AUTH_COOKIE_NAME || "billybeez_session";
const SESSION_MAX_AGE = 60 * 60 * 24 * 7;

function sessionSecret() {
  const secret = process.env.SESSION_SECRET;

  if (!secret || secret.length < 32) {
    throw new Error("SESSION_SECRET must be configured with at least 32 characters");
  }

  return secret;
}

function signPayload(payload) {
  return createHmac("sha256", sessionSecret()).update(payload).digest("base64url");
}

function encodeSession(user, now = Date.now()) {
  const issuedAt = Math.floor(now / 1000);
  const payload = Buffer.from(JSON.stringify({
    sub: user.id,
    iat: issuedAt,
    exp: issuedAt + SESSION_MAX_AGE,
    jti: randomBytes(16).toString("base64url"),
    v: 1,
  })).toString("base64url");

  return `${payload}.${signPayload(payload)}`;
}

function decodeSession(value, now = Date.now()) {
  if (!value) return null;

  const [payload, signature, extra] = String(value).split(".");
  if (!payload || !signature || extra) return null;

  const expected = Buffer.from(signPayload(payload));
  const received = Buffer.from(signature);

  if (expected.length !== received.length || !timingSafeEqual(expected, received)) {
    return null;
  }

  try {
    const session = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    const currentTime = Math.floor(now / 1000);

    if (session.v !== 1 || !session.sub || !session.exp || session.exp <= currentTime) {
      return null;
    }

    return session;
  } catch {
    return null;
  }
}

async function getCurrentUser() {
  const store = await cookies();
  const session = decodeSession(store.get(COOKIE_NAME)?.value);

  if (!session) return null;

  return prisma.user.findFirst({
    where: {
      id: session.sub,
      active: true,
    },
    select: {
      id: true,
      name: true,
      username: true,
      role: true,
      active: true,
    },
  });
}

async function setCurrentUser(user) {
  const store = await cookies();
  store.set(COOKIE_NAME, encodeSession(user), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: SESSION_MAX_AGE,
    priority: "high",
  });
}

async function clearCurrentUser() {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

async function requireUser(roles) {
  const user = await getCurrentUser();

  if (!user) redirect("/login");

  if (roles && !roles.includes(user.role)) {
    redirect(getRoleHome(user.role));
  }

  return user;
}

module.exports = {
  COOKIE_NAME,
  SESSION_MAX_AGE,
  clearCurrentUser,
  decodeSession,
  encodeSession,
  getCurrentUser,
  requireUser,
  setCurrentUser,
};
