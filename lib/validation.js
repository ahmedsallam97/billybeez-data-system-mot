function validationError(message, field = "") {
  const error = new Error(message);
  error.name = "ValidationError";
  error.field = field;
  return error;
}

function requireString(value, field) {
  const text = String(value || "").trim();
  if (!text) throw validationError(`${field} is required`, field);
  return text;
}

function optionalString(value) {
  return String(value || "").trim();
}

function requireArray(value, field) {
  if (!Array.isArray(value) || value.length === 0) throw validationError(`${field} is required`, field);
  return value;
}

function enumValue(value, allowed, fallback) {
  return allowed.includes(value) ? value : fallback;
}

function positiveInt(value, fallback = 1) {
  return Math.max(1, Number.parseInt(value, 10) || fallback);
}

function jsonValidationResponse(NextResponse, error) {
  return NextResponse.json({
    success: false,
    error: error.message || "Validation failed",
    field: error.field || "",
  }, { status: 400 });
}

module.exports = {
  enumValue,
  jsonValidationResponse,
  optionalString,
  positiveInt,
  requireArray,
  requireString,
  validationError,
};
