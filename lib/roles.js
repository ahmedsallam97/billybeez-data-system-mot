const ROLE_HOME = {
  ADMIN: "/opmanager",
  MANAGER: "/opmanager",
  CASHIER: "/account",
  KITCHEN: "/account",
  DATA: "/account",
};

function getRoleHome(role) {
  return ROLE_HOME[role] || "/login";
}

function canAccess(user, roles) {
  return Boolean(user && roles.includes(user.role));
}

module.exports = { ROLE_HOME, getRoleHome, canAccess };
