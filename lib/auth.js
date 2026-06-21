const { cookies } = require("next/headers");
const { redirect } = require("next/navigation");
const { getRoleHome } = require("./roles");

const COOKIE_NAME = process.env.AUTH_COOKIE_NAME || "billybeez_user";

function encodeUser(user) {
  return Buffer.from(JSON.stringify({
    id: user.id,
    name: user.name,
    username: user.username,
    role: user.role,
  })).toString("base64url");
}

function decodeUser(value) {
  if (!value) return null;

  try {
    return JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
  } catch (error) {
    return null;
  }
}

async function getCurrentUser() {
  const store = await cookies();
  return decodeUser(store.get(COOKIE_NAME)?.value);
}

async function setCurrentUser(user) {
  const store = await cookies();
  store.set(COOKIE_NAME, encodeUser(user), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
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
  encodeUser,
  decodeUser,
  getCurrentUser,
  setCurrentUser,
  clearCurrentUser,
  requireUser,
};
