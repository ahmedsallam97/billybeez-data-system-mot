const ROLE_HOME = {
  ADMIN: "/manager",
  MANAGER: "/manager",
  CASHIER: "/cashier",
  KITCHEN: "/kitchen",
};

function getRoleHome(role) {
  return ROLE_HOME[role] || "/login";
}

function canAccess(user, roles) {
  return Boolean(user && roles.includes(user.role));
}

module.exports = { ROLE_HOME, getRoleHome, canAccess };
