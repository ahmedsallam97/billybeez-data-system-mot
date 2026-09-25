const EMPLOYMENT_TYPES = Object.freeze(["HRIS", "PART_TIME", "OTHER"]);
const EMPLOYMENT_STATUSES = Object.freeze(["ACTIVE", "INACTIVE", "EXITED"]);

function optionalText(value) {
  const text = String(value ?? "").trim().replace(/\s+/g, " ");
  return text || null;
}

function validateHrisNumber(value) {
  const hrisNumber = optionalText(value);
  if (hrisNumber && !/^\d{5}$/.test(hrisNumber)) {
    throw new Error("HRIS number must contain exactly 5 digits");
  }
  return hrisNumber;
}

function validateNationalId(value) {
  const nationalId = optionalText(value);
  if (nationalId && !/^\d{14}$/.test(nationalId)) {
    throw new Error("National ID must contain exactly 14 digits");
  }
  return nationalId;
}

function normalizeOperationsEmployee(input, current = {}) {
  const employmentType = EMPLOYMENT_TYPES.includes(input.employmentType)
    ? input.employmentType
    : current.employmentType || "OTHER";
  const employmentStatus = EMPLOYMENT_STATUSES.includes(input.employmentStatus)
    ? input.employmentStatus
    : current.employmentStatus || "ACTIVE";
  const hrisNumber = validateHrisNumber(input.hrisNumber ?? current.hrisNumber);
  const localEmployeeCode = optionalText(input.localEmployeeCode ?? current.localEmployeeCode);

  if (employmentType === "HRIS" && !hrisNumber) {
    throw new Error("HRIS employees require a 5-digit HRIS number");
  }
  if (employmentType === "PART_TIME" && hrisNumber) {
    throw new Error("Part-Time employees cannot have an HRIS number");
  }
  if (employmentType === "PART_TIME" && !localEmployeeCode) {
    throw new Error("Part-Time employees require a local employee code");
  }

  return {
    nameAr: optionalText(input.nameAr ?? current.nameAr),
    nameEn: optionalText(input.nameEn ?? current.nameEn),
    operationalName: optionalText(input.operationalName ?? current.operationalName),
    sourceEmployeeId: optionalText(input.sourceEmployeeId ?? current.sourceEmployeeId),
    hrisNumber,
    localEmployeeCode,
    nationalId: validateNationalId(input.nationalId ?? current.nationalId),
    jobTitle: optionalText(input.jobTitle ?? current.jobTitle),
    employmentType,
    employmentStatus,
    hireDate: input.hireDate === undefined ? current.hireDate || null : parseOptionalDate(input.hireDate, "Hire date"),
    joinDate: input.joinDate === undefined ? current.joinDate || null : parseOptionalDate(input.joinDate, "Join date"),
    active: employmentStatus === "ACTIVE",
    dateOfBirth: input.dateOfBirth === undefined ? current.dateOfBirth || null : parseOptionalDate(input.dateOfBirth, "Date of birth"),
    phone: optionalText(input.phone ?? current.phone), address: optionalText(input.address ?? current.address),
    emergencyName: optionalText(input.emergencyName ?? current.emergencyName), emergencyPhone: optionalText(input.emergencyPhone ?? current.emergencyPhone), emergencyRelation: optionalText(input.emergencyRelation ?? current.emergencyRelation), personalNotes: optionalText(input.personalNotes ?? current.personalNotes), branch: optionalText(input.branch ?? current.branch), supervisorId: optionalText(input.supervisorId ?? current.supervisorId),
  };
}

function parseOptionalDate(value, label) {
  if (!value) return null;
  const text = String(value).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw new Error(`${label} must use YYYY-MM-DD`);
  const date = new Date(`${text}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== text) {
    throw new Error(`${label} must be a valid date`);
  }
  return date;
}

function maskNationalId(value) {
  const nationalId = optionalText(value);
  return nationalId ? `${"*".repeat(10)}${nationalId.slice(-4)}` : "";
}

function serializeOperationsEmployee(employee, { includeNationalId = false } = {}) {
  return {
    id: employee.id,
    name: employee.name,
    nameAr: employee.nameAr || "",
    nameEn: employee.nameEn || "",
    operationalName: employee.operationalName || "",
    gender: employee.gender || "",
    operationsTeamLeader: Boolean(employee.operationsTeamLeader),
    sourceEmployeeId: employee.sourceEmployeeId || "",
    hrisNumber: employee.hrisNumber || "",
    localEmployeeCode: employee.localEmployeeCode || "",
    nationalId: includeNationalId ? employee.nationalId || "" : undefined,
    nationalIdMasked: maskNationalId(employee.nationalId),
    jobTitle: employee.jobTitle || "",
    branch: employee.branch || "",
    supervisorId: employee.supervisorId || "",
    employmentType: employee.employmentType,
    employmentStatus: employee.employmentStatus,
    hireDate: employee.hireDate,
    joinDate: employee.joinDate,
    department: employee.department,
    active: employee.active,
    dateOfBirth: includeNationalId ? employee.dateOfBirth : undefined,
    phone: includeNationalId ? employee.phone || "" : undefined,
    address: includeNationalId ? employee.address || "" : undefined,
    emergencyName: includeNationalId ? employee.emergencyName || "" : undefined,
    emergencyPhone: includeNationalId ? employee.emergencyPhone || "" : undefined,
    emergencyRelation: includeNationalId ? employee.emergencyRelation || "" : undefined,
    personalNotes: includeNationalId ? employee.personalNotes || "" : undefined,
    createdAt: employee.createdAt,
    updatedAt: employee.updatedAt,
  };
}

module.exports = {
  EMPLOYMENT_STATUSES,
  EMPLOYMENT_TYPES,
  maskNationalId,
  normalizeOperationsEmployee,
  optionalText,
  parseOptionalDate,
  serializeOperationsEmployee,
  validateHrisNumber,
  validateNationalId,
};
