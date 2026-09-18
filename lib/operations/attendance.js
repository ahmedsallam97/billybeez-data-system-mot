const ATTENDANCE_EXPECTED_CODES = new Set(["AM", "BW", "PM", "MISSION"]);

function defaultAttendanceStatus(code) {
  return ATTENDANCE_EXPECTED_CODES.has(String(code || "").toUpperCase()) ? "PRESENT" : null;
}

module.exports = { ATTENDANCE_EXPECTED_CODES, defaultAttendanceStatus };
