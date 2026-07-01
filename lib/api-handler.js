const { NextResponse } = require("next/server");

function errorMessage(error) {
  if (process.env.NODE_ENV === "production") return "Internal server error";
  return error?.message || "Internal server error";
}

function withApiHandler(handler) {
  return async function apiHandler(...args) {
    try {
      return await handler(...args);
    } catch (error) {
      console.error("[api-error]", error);
      return NextResponse.json(
        { success: false, error: errorMessage(error) },
        { status: 500 },
      );
    }
  };
}

module.exports = { withApiHandler };
