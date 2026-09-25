const { test, expect } = require("@playwright/test");

test("authenticated employee 360 exposes incidents and protected complete PDF", async ({ page, request }) => {
  await page.goto("/operations?tab=employees");
  await expect(page.getByText("EMPLOYEE 360")).toBeVisible();
  await expect(page.getByRole("button", { name: "Incidents" })).toBeVisible();
  const employeesResponse = await request.get("/api/operations/employees?status=ACTIVE");
  expect(employeesResponse.ok()).toBeTruthy();
  const employees = (await employeesResponse.json()).employees;
  expect(employees.length).toBeGreaterThan(0);
  const detailResponse = await request.get(`/api/operations/employees/${employees[0].id}/360`);
  expect(detailResponse.ok()).toBeTruthy();
  const detail = await detailResponse.json();
  expect(Array.isArray(detail.employee.incidents)).toBeTruthy();
  const pdfResponse = await request.get(`/api/operations/employees/${employees[0].id}/complete-file?year=${new Date().getFullYear()}&endDate=${new Date().toISOString().slice(0, 10)}`);
  expect(pdfResponse.ok()).toBeTruthy();
  expect(pdfResponse.headers()["content-type"]).toContain("application/pdf");
  expect((await pdfResponse.body()).subarray(0, 4).toString()).toBe("%PDF");
});

test("roster and settings pages render without JSON/session errors", async ({ page }) => {
  await page.goto("/operations?tab=roster");
  await expect(page.locator("body")).not.toContainText("Unexpected end of JSON input");
  await expect(page.locator("body")).not.toContainText("Login required");
  await page.goto("/operations/settings");
  await expect(page.locator("body")).not.toContainText("Login required");
  await expect(page.locator("body")).not.toContainText("Unexpected end of JSON input");
});
