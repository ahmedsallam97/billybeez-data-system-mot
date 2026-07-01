const { NextResponse } = require("next/server");
const { getCurrentUser } = require("./auth");

const ROLE_MATRIX = Object.freeze({
  BUSINESS_DAY_READ: ["ADMIN", "MANAGER", "CASHIER", "KITCHEN"],
  BUSINESS_DAY_WRITE: ["ADMIN", "MANAGER", "CASHIER", "KITCHEN"],
  DASHBOARD_READ: ["ADMIN", "MANAGER"],
  EMPLOYEE_READ: ["ADMIN", "MANAGER", "CASHIER", "KITCHEN"],
  EMPLOYEE_MANAGE: ["ADMIN", "MANAGER"],
  ORDER_READ: ["ADMIN", "MANAGER", "CASHIER", "KITCHEN"],
  ORDER_CREATE: ["ADMIN", "CASHIER"],
  ORDER_EDIT_ITEMS: ["ADMIN", "MANAGER", "CASHIER"],
  ORDER_DELIVER: ["ADMIN", "MANAGER", "KITCHEN"],
  ORDER_PAY: ["ADMIN", "MANAGER", "KITCHEN"],
  ORDER_CUSTOMER_LEFT: ["ADMIN", "MANAGER", "CASHIER"],
  ORDER_GEIDEA_REGISTER: ["ADMIN", "MANAGER", "KITCHEN"],
  ORDER_ARCHIVE: ["ADMIN", "MANAGER", "KITCHEN"],
  ORDER_UNARCHIVE: ["ADMIN", "MANAGER"],
  PRINT_JOB_READ: ["ADMIN", "MANAGER", "KITCHEN"],
  PRINT_JOB_CREATE: ["ADMIN", "MANAGER", "KITCHEN"],
  PRINT_JOB_UPDATE: ["ADMIN", "MANAGER", "KITCHEN"],
  SYSTEM_SETTING_READ: ["ADMIN", "MANAGER"],
  SYSTEM_SETTING_MANAGE: ["ADMIN", "MANAGER"],
  PRODUCT_READ: ["ADMIN", "MANAGER", "CASHIER", "KITCHEN"],
  PRODUCT_MANAGE: ["ADMIN", "MANAGER"],
  USER_MANAGE: ["ADMIN", "MANAGER"],
});

async function authorizeApi(permission) {
  const allowedRoles = ROLE_MATRIX[permission];

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

module.exports = { ROLE_MATRIX, authorizeApi };
