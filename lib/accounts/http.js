const { NextResponse } = require("next/server");
const { getCurrentUser } = require("../auth");
const { assertCan, failure } = require("./service");
function sameOriginRequest(request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    const parsed = new URL(origin);
    return (
      ["http:", "https:"].includes(parsed.protocol) &&
      (origin === new URL(request.url).origin ||
        parsed.host === request.headers.get("host"))
    );
  } catch {
    return false;
  }
}
async function accountRequest(
  request,
  permission,
  { allowForced = false } = {},
) {
  const user = await getCurrentUser();
  if (!user) throw failure("Login required", 401);
  if (!allowForced && user.profile.forcePasswordChange)
    throw failure("Change your password before continuing", 428);
  if (permission) assertCan(user, permission);
  if (request.method !== "GET") {
    if (!sameOriginRequest(request))
      throw failure("Cross-origin account changes are not allowed", 403);
  }
  return user;
}
function accountResponse(handler) {
  return async (...args) => {
    try {
      return await handler(...args);
    } catch (error) {
      const status =
        error.status || (["P2002", "P2034"].includes(error.code) ? 409 : 500);
      return NextResponse.json(
        {
          success: false,
          error:
            status === 500
              ? "The account change could not be completed. Please retry."
              : error.message,
        },
        { status },
      );
    }
  };
}
module.exports = { accountRequest, accountResponse, sameOriginRequest };
