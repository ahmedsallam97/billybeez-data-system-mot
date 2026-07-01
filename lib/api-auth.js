const { NextResponse } = require("next/server");
const { getCurrentUser } = require("./auth");
const { prisma } = require("./db");
const { ROLE_MATRIX, normalizeRoleMatrix } = require("./role-matrix");

async function loadRoleMatrix() {
  try {
    const setting = await prisma.systemSetting.findUnique({ where: { key: "ROLE_PERMISSION_CONFIG" } });
    return normalizeRoleMatrix(setting?.value);
  } catch {
    return ROLE_MATRIX;
  }
}

async function authorizeApi(permission) {
  const roleMatrix = await loadRoleMatrix();
  const allowedRoles = roleMatrix[permission] || ROLE_MATRIX[permission];

  if (!allowedRoles) {
    throw new Error(`Unknown API permission: ${permission}`);
  }

  const user = await getCurrentUser();

  if (!user) {
    return {
      error: NextResponse.json({ success: false, error: "Login required" }, { status: 401 }),
      user: null,
    };
  }

  if (!allowedRoles.includes(user.role)) {
    return {
      error: NextResponse.json({ success: false, error: "Permission denied" }, { status: 403 }),
      user: null,
    };
  }

  return { error: null, user };
}

module.exports = { ROLE_MATRIX, authorizeApi, loadRoleMatrix, normalizeRoleMatrix };
