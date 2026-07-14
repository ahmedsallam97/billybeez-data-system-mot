const ROLES = Object.freeze(["ADMIN", "MANAGER", "CASHIER", "KITCHEN", "DATA"]);

const ROLE_MATRIX = Object.freeze({
  BUSINESS_DAY_READ: ["ADMIN", "MANAGER", "CASHIER", "KITCHEN", "DATA"],
  BUSINESS_DAY_WRITE: ["ADMIN", "MANAGER", "CASHIER", "KITCHEN", "DATA"],
  DASHBOARD_READ: ["ADMIN", "MANAGER"],
  DEVICE_READ: ["ADMIN", "MANAGER", "CASHIER", "KITCHEN", "DATA"],
  DEVICE_MANAGE: ["ADMIN", "MANAGER"],
  EMPLOYEE_READ: ["ADMIN", "MANAGER", "CASHIER", "KITCHEN", "DATA"],
  EMPLOYEE_MANAGE: ["ADMIN", "MANAGER"],
  ORDER_READ: ["ADMIN", "MANAGER", "CASHIER", "KITCHEN", "DATA"],
  ORDER_CREATE: ["ADMIN", "MANAGER", "CASHIER", "KITCHEN", "DATA"],
  ORDER_EDIT_ITEMS: ["ADMIN", "MANAGER", "CASHIER", "DATA"],
  ORDER_DELIVER: ["ADMIN", "MANAGER", "KITCHEN"],
  ORDER_PAY: ["ADMIN", "MANAGER", "KITCHEN"],
  ORDER_CUSTOMER_LEFT: ["ADMIN", "MANAGER", "CASHIER", "DATA"],
  ORDER_GEIDEA_REGISTER: ["ADMIN", "MANAGER", "KITCHEN"],
  ORDER_ARCHIVE: ["ADMIN", "MANAGER", "KITCHEN"],
  ORDER_UNARCHIVE: ["ADMIN", "MANAGER"],
  ORDER_MERGE: ["ADMIN", "MANAGER"],
  PRINT_JOB_READ: ["ADMIN", "MANAGER", "KITCHEN"],
  PRINT_JOB_CREATE: ["ADMIN", "MANAGER", "KITCHEN"],
  PRINT_JOB_UPDATE: ["ADMIN", "MANAGER", "KITCHEN"],
  SYSTEM_SETTING_READ: ["ADMIN", "MANAGER", "CASHIER", "KITCHEN", "DATA"],
  SYSTEM_SETTING_MANAGE: ["ADMIN", "MANAGER"],
  PRODUCT_READ: ["ADMIN", "MANAGER", "CASHIER", "KITCHEN", "DATA"],
  PRODUCT_MANAGE: ["ADMIN", "MANAGER"],
  PAYMENT_PROVIDER_READ: ["ADMIN", "MANAGER", "CASHIER", "KITCHEN", "DATA"],
  PAYMENT_PROVIDER_MANAGE: ["ADMIN", "MANAGER"],
  USER_MANAGE: ["ADMIN", "MANAGER"],
  BACKUP_MANAGE: ["ADMIN", "MANAGER"],
});

function normalizeRoleMatrix(value) {
  let parsed = value;
  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value);
    } catch {
      parsed = {};
    }
  }

  return Object.fromEntries(Object.entries(ROLE_MATRIX).map(([permission, fallbackRoles]) => {
    const roles = Array.isArray(parsed?.[permission]) ? parsed[permission] : fallbackRoles;
    const normalizedRoles = roles
      .map((role) => String(role || "").trim().toUpperCase())
      .filter((role) => ROLES.includes(role));
    if (fallbackRoles.includes("DATA") && normalizedRoles.includes("CASHIER") && !normalizedRoles.includes("DATA")) {
      normalizedRoles.push("DATA");
    }

    return [permission, normalizedRoles.length ? [...new Set(normalizedRoles)] : fallbackRoles];
  }));
}

module.exports = {
  ROLE_MATRIX,
  ROLES,
  normalizeRoleMatrix,
};
