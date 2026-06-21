const ROLE_HOME = {
  admin: "dashboard.html",
  manager: "dashboard.html",
  cashier: "cashier.html",
  delivery: "delivery.html",
};

function getCurrentUser() {
  try {
    return JSON.parse(localStorage.getItem("currentUser"));
  } catch (error) {
    return null;
  }
}

function normalizeRole(role) {
  const value = String(role || "").trim().toLowerCase();

  if (["admin", "administrator"].includes(value)) return "admin";
  if (["manager", "مدير"].includes(value)) return "manager";
  if (["cashier", "كاشير"].includes(value)) return "cashier";
  if (["delivery", "runner", "دليفري", "توصيل"].includes(value)) return "delivery";

  return value;
}

function getRoleHome(role) {
  return ROLE_HOME[normalizeRole(role)] || "index.html";
}

function redirectToRoleHome(user) {
  window.location.replace(getRoleHome(user && user.role));
}

function requireLogin() {
  const user = getCurrentUser();

  if (!user) {
    window.location.replace("index.html");
    return null;
  }

  return user;
}

function requireRole(allowedRoles) {
  const user = requireLogin();

  if (!user) return null;

  const role = normalizeRole(user.role);
  const allowed = allowedRoles.map(normalizeRole);

  if (!allowed.includes(role)) {
    window.location.replace(getRoleHome(role));
    return null;
  }

  return user;
}

function logout() {
  localStorage.removeItem("currentUser");
  window.location.href = "index.html";
}
