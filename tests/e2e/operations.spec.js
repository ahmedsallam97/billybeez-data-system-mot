const { test, expect } = require("@playwright/test");

test("authenticated employee 360 exposes incidents and protected complete PDF", async ({ page, request }) => {
  await page.goto("/operations?tab=employees");
  await expect(page.getByText("EMPLOYEE 360")).toBeVisible();
  await expect(page.locator(".employee-directory-picker")).toBeVisible();
  await expect(page.locator(".operations-employee-list")).toHaveCount(0);
  await expect(page.locator(".employee-directory-profile")).toBeVisible();
  await expect(page.getByRole("button", { name: "Incidents" })).toBeVisible();
  await page.getByRole("button", { name: "Schedule & Attendance" }).click();
  await expect(page.getByRole("heading", { name: "Monthly shift totals" })).toBeVisible();
  await expect(page.locator(".employee-schedule-summary table")).toHaveCount(2);
  await expect(page.locator(".employee-schedule-summary table").first().locator("thead")).toContainText("Working days");
  await expect(page.locator(".employee-schedule-summary table").first().locator("thead")).not.toContainText("Annual");
  await expect(page.locator(".employee-schedule-summary table").first().locator("thead")).not.toContainText("Other");
  await expect(page.locator(".employee-schedule-summary table").nth(1).locator("thead")).toContainText("Replacement");
  await expect(page.locator(".employee-schedule-summary table").nth(1).locator("thead")).toContainText("Sick leave");
  for (const tableWrap of await page.locator(".employee-schedule-summary .record-table-scroll").all()) expect(await tableWrap.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBeTruthy();
  const shiftRows = page.locator(".employee-schedule-summary table").first().locator("tbody tr");
  await expect(shiftRows.nth(0).locator("td").first()).toHaveText("January");
  await expect(shiftRows.nth(1).locator("td").first()).toHaveText("February");
  await expect(page.locator(".employee-schedule-summary")).toContainText("Total to date");
  await expect(page.locator(".employee-schedule-summary")).not.toContainText("October");
  const convertButton = page.getByRole("button", { name: "Convert PT to HRIS" });
  if (await convertButton.count()) {
    await convertButton.click();
    await expect(page.getByRole("dialog", { name: "Convert employee to HRIS" })).toBeVisible();
    await expect(page.getByLabel("HRIS number")).toBeVisible();
    await page.getByRole("button", { name: "Close" }).click();
  }
  const employeesResponse = await request.get("/api/operations/employees?status=ACTIVE");
  expect(employeesResponse.ok()).toBeTruthy();
  const employees = (await employeesResponse.json()).employees;
  expect(employees.length).toBeGreaterThan(0);
  const detailResponse = await request.get(`/api/operations/employees/${employees[0].id}/360`);
  expect(detailResponse.ok()).toBeTruthy();
  const detail = await detailResponse.json();
  expect(Array.isArray(detail.employee.incidents)).toBeTruthy();
  const pdfResponse = await request.get(`/api/operations/employees/${employees[0].id}/complete-file?year=${new Date().getFullYear()}&endDate=${new Date().toISOString().slice(0, 10)}&language=ar`);
  expect(pdfResponse.ok()).toBeTruthy();
  expect(pdfResponse.headers()["content-type"]).toContain("application/pdf");
  expect((await pdfResponse.body()).subarray(0, 4).toString()).toBe("%PDF");
});

test("core operations tabs and settings render without JSON/session errors", async ({ page }) => {
  for (const tab of ["roster", "daily", "evaluation", "schedule", "trips", "birthdays", "offers", "stock", "time", "employees", "performance"]) {
    await page.goto(`/operations?tab=${tab}`, { waitUntil: "domcontentloaded" });
    await expect(page.locator("body")).not.toContainText("Unexpected end of JSON input");
    await expect(page.locator("body")).not.toContainText("Login required");
    await expect(page.locator("body")).not.toContainText("Roster data could not be loaded");
  }
  await page.goto("/settings", { waitUntil: "networkidle" });
  await expect(page.locator("body")).not.toContainText("Login required");
  await expect(page.locator("body")).not.toContainText("Unexpected end of JSON input");
  await expect(page.getByRole("heading", { name: "Billy Assistant" })).toBeVisible();
  await expect(page.locator(".billy-assistant")).toContainText("AI GENERATED");
  await expect(page.locator("body")).not.toContainText("OPERATIONS AI ASSISTANT");
  await expect(page.locator(".system-pulse-card")).toHaveCount(8);
  await expect(page.locator(".insight-chart-grid > article")).toHaveCount(4);
  await expect(page.locator(".follow-up-map")).toBeVisible();
  await expect(page.locator(".operations-performance-summary > .performance-summary-card")).toHaveCount(2);
  await expect(page.locator(".performance-summary-card.top")).toBeVisible();
  await expect(page.locator(".performance-summary-card.support")).toBeVisible();
  await expect(page.locator(".performance-summary-card header small").first()).toContainText(String(new Date().getFullYear()));
  await expect(page.locator("body")).not.toContainText("Business-day sales");

  await page.goto("/settings?tab=template", { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { name: /Daily operations template|تيمبلت العمليات/ })).toBeVisible();
});

test("mobile workspaces stay inside the viewport and collapse navigation after selection", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });

  await page.goto("/operations?tab=performance", { waitUntil: "networkidle" });
  const performanceContent = page.locator(".operations-content");
  await expect(performanceContent).toBeVisible();
  const performanceBox = await performanceContent.boundingBox();
  expect(performanceBox.x).toBeGreaterThanOrEqual(0);
  expect(performanceBox.x + performanceBox.width).toBeLessThanOrEqual(391);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);

  await page.goto("/operations?tab=daily&date=2026-09-27", { waitUntil: "networkidle" });
  const dailyControls = page.locator(".daily-controls");
  const dailyControlsBox = await dailyControls.boundingBox();
  expect(dailyControlsBox.x).toBeGreaterThanOrEqual(0);
  expect(dailyControlsBox.x + dailyControlsBox.width).toBeLessThanOrEqual(391);
  expect(await dailyControls.evaluate((element) => element.scrollWidth)).toBeLessThanOrEqual(Math.ceil(dailyControlsBox.width));

  await page.goto("/data", { waitUntil: "networkidle" });
  const topbarBox = await page.locator(".topbar").boundingBox();
  expect(topbarBox.height).toBeLessThan(150);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);

  await page.goto("/settings", { waitUntil: "networkidle" });
  const toggle = page.locator(".settings-main-nav .operations-nav-toggle");
  if (await toggle.getAttribute("aria-expanded") !== "true") await toggle.click();
  await page.locator(".settings-main-nav > button:not(.operations-nav-toggle)").nth(1).click();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
});

test("daily tables fit their panels and roster settings use focused editors", async ({ page }) => {
  await page.goto("/operations?tab=performance", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /Manual scores|إدخال \/ تعديل يدوي/ }).click();
  const manualDialog = page.getByRole("dialog", { name: /Enter monthly scores manually|إدخال نتائج التقييم يدويًا/ });
  await expect(manualDialog).toBeVisible();
  await expect(manualDialog.locator('input[type="number"]')).not.toHaveCount(0);
  await expect(manualDialog.getByLabel(/Manual override reason|سبب التعديل اليدوي/)).toBeVisible();
  await manualDialog.getByRole("button", { name: /Close|إغلاق/ }).click();

  await page.goto("/operations?tab=daily&date=2026-09-27", { waitUntil: "networkidle" });
  const attendance = page.locator(".attendance-table-wrap");
  await expect(attendance).toBeVisible();
  expect(await attendance.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBeTruthy();

  await page.goto("/operations?tab=evaluation&date=2026-09-27", { waitUntil: "networkidle" });
  const evaluation = page.locator(".evaluation-table-wrap");
  await expect(evaluation).toBeVisible();
  expect(await evaluation.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBeTruthy();
  await page.getByRole("button", { name: /Actions & notes|جزاءات وتوجيه/ }).first().click();
  await expect(page.getByLabel(/Employee penalty|جزاء الموظف/)).toBeVisible();
  await expect(page.getByLabel(/Guidance action|الإجراء التوجيهي/)).toBeVisible();

  await page.goto("/settings", { waitUntil: "networkidle" });
  const toggle = page.locator(".settings-main-nav .operations-nav-toggle");
  await toggle.click();
  await page.locator(".settings-main-nav > button").filter({ hasText: /Roster & shifts|الروستر والشيفتات/ }).click();
  await expect(page.locator(".cashier-picker-panel select")).toHaveCount(2);
  await expect(page.locator(".roster-name-settings select")).toHaveCount(1);
  const editorInputs = page.locator(".operational-position-settings .settings-editor-form").first().locator("input");
  const firstInput = await editorInputs.nth(0).boundingBox();
  const secondInput = await editorInputs.nth(1).boundingBox();
  expect(secondInput.y).toBeGreaterThan(firstInput.y + firstInput.height - 1);
});
