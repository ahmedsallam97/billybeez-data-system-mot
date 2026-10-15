const { test } = require("node:test");
const assert = require("node:assert/strict");
const { validatePeriod, validateWorkDate, importedHeaderDate } = require("../lib/operations/schedule-input");
const { datesInPeriod, getOperationalSchedulePeriod } = require("../lib/operations/schedule");

test("schedule dates reject rollover, suffixes and ambiguous December day headers", () => {
  const schedule = { periodStart: "2026-02-16", periodEnd: "2026-03-15" };
  for (const date of ["2026-02-30", "2026-02-20extra", "2026-03-16"]) assert.throws(() => validateWorkDate(date, schedule));
  assert.equal(validateWorkDate("2026-02-28", schedule), "2026-02-28");
  assert.throws(() => validatePeriod(2026, 13));
  const dates = datesInPeriod(getOperationalSchedulePeriod(2026, 12));
  assert.throws(() => importedHeaderDate(16, dates), /ambiguous/);
  assert.equal(importedHeaderDate("2026-12-16", dates), "2026-12-16");
  assert.equal(importedHeaderDate("E016", dates), null);
});
