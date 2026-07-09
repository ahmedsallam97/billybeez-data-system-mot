export const defaultEmployeeDepartments = [
  { id: "OPERATION", name: "التشغيل", nameEn: "Operation", kind: "DATA", active: true, locked: true },
  { id: "CASHIER", name: "كاشير", nameEn: "Cashier", kind: "DATA", active: true, locked: false },
  { id: "RESTAURANT", name: "المطعم", nameEn: "Restaurant", kind: "RESTAURANT", active: true, locked: true },
];

export function normalizeDepartmentId(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9-_]/g, "")
    .toUpperCase();
}

function normalizeDepartmentKind(value) {
  return String(value || "").toUpperCase() === "RESTAURANT" ? "RESTAURANT" : "DATA";
}

export function normalizeEmployeeDepartments(value) {
  let parsed = value;
  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value);
    } catch {
      parsed = [];
    }
  }

  const rows = Array.isArray(parsed) ? parsed : [];
  const byId = new Map(defaultEmployeeDepartments.map((department) => [department.id, { ...department }]));

  rows.forEach((department) => {
    const id = normalizeDepartmentId(department?.id || department?.name);
    if (!id) return;
    byId.set(id, {
      ...(byId.get(id) || {}),
      id,
      name: String(department?.name || byId.get(id)?.name || id).trim(),
      nameEn: String(department?.nameEn || byId.get(id)?.nameEn || department?.name || id).trim(),
      kind: normalizeDepartmentKind(department?.kind || byId.get(id)?.kind),
      active: department?.active !== false,
      locked: Boolean(department?.locked || byId.get(id)?.locked),
    });
  });

  return Array.from(byId.values()).sort((a, b) => {
    if (a.locked !== b.locked) return a.locked ? -1 : 1;
    return a.name.localeCompare(b.name, "ar-EG");
  });
}

export function employeeDepartmentValue(departments) {
  return JSON.stringify(normalizeEmployeeDepartments(departments));
}

export function isDataDepartment(department, departments) {
  const normalized = normalizeEmployeeDepartments(departments);
  return normalized.some((item) => item.id === department && item.kind === "DATA" && item.active);
}

export function isRestaurantDepartment(department, departments) {
  const normalized = normalizeEmployeeDepartments(departments);
  return normalized.some((item) => item.id === department && item.kind === "RESTAURANT" && item.active);
}

export function departmentLabel(department, departments, language = "ar") {
  const item = normalizeEmployeeDepartments(departments).find((row) => row.id === department);
  if (!item) return department;
  return language === "en" ? item.nameEn || item.name : item.name || item.nameEn || department;
}
