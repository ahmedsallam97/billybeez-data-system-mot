function assertLeaveEligible(employee, leaveType) {
  if (leaveType === "REPLACEMENT" && (!employee.hrisNumber || employee.employmentType !== "HRIS")) {
    throw new Error("Replacement is available only to employees with a real HRIS number");
  }
}

function assertNonNegativeLeaveBalance(currentBalance, amount) {
  if (Number(currentBalance) + Number(amount) < 0) throw new Error("This transaction would create a negative leave balance");
}

function smartLeaveSplit(days, accounts, employee) {
  let remaining = Number(days);
  if (!Number.isInteger(remaining) || remaining <= 0) throw new Error("Leave days must be a positive whole number");
  const allocations = [];
  for (const leaveType of ["ANNUAL", "REPLACEMENT"]) {
    if (leaveType === "REPLACEMENT" && (!employee.hrisNumber || employee.employmentType !== "HRIS")) continue;
    const account = accounts.find((item) => item.leaveType === leaveType);
    const available = Math.max(0, Number(account?.balance || 0));
    const amount = Math.min(available, remaining);
    if (amount > 0) allocations.push({ leaveType, amount });
    remaining -= amount;
  }
  if (remaining > 0) throw new Error("Available eligible leave balance is insufficient");
  return allocations;
}

function leaveDateRange(startDate, endDate) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(startDate || "")) || !/^\d{4}-\d{2}-\d{2}$/.test(String(endDate || "")) || endDate < startDate) {
    throw new Error("A valid leave date range is required");
  }
  const dates = [];
  const cursor = new Date(`${startDate}T00:00:00Z`);
  const last = new Date(`${endDate}T00:00:00Z`);
  while (cursor <= last) {
    dates.push(cursor.toISOString().slice(0, 10));
    if (dates.length > 366) throw new Error("Leave range cannot exceed 366 days");
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

function allocateLeaveDates(dates, accounts, employee, requestedType = "SMART") {
  const type = String(requestedType || "SMART").toUpperCase();
  if (!["SMART", "ANNUAL", "REPLACEMENT"].includes(type)) throw new Error("Invalid leave allocation type");
  const split = type === "SMART"
    ? smartLeaveSplit(dates.length, accounts, employee)
    : (() => {
      assertLeaveEligible(employee, type);
      const account = accounts.find((item) => item.leaveType === type);
      if (Number(account?.balance || 0) < dates.length) throw new Error("Available eligible leave balance is insufficient");
      return [{ leaveType: type, amount: dates.length }];
    })();
  let index = 0;
  return split.flatMap((part) => Array.from({ length: part.amount }, () => ({ leaveDate: dates[index++], leaveType: part.leaveType, amount: 1 })));
}

function attendanceStatusForLeaveType(leaveType) {
  return String(leaveType || "").toUpperCase() === "REPLACEMENT" ? "REPLACEMENT_LEAVE" : "LEAVE";
}

module.exports = { allocateLeaveDates, assertLeaveEligible, assertNonNegativeLeaveBalance, attendanceStatusForLeaveType, leaveDateRange, smartLeaveSplit };
