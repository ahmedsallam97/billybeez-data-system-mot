const { defineConfig } = require("@playwright/test");

module.exports = defineConfig({
  testDir: "./tests/e2e",
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  forbidOnly: true,
  reporter: [["line"]],
  outputDir: "test-results/playwright",
  globalSetup: require.resolve("./tests/e2e/global-setup"),
  use: {
    baseURL: process.env.E2E_BASE_URL || "http://127.0.0.1:3008",
    storageState: "playwright/.auth/admin.json",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
  },
  projects: [{ name: "chromium", use: { channel: process.env.PLAYWRIGHT_CHANNEL || "chrome" } }],
  webServer: process.env.E2E_BASE_URL ? undefined : { command: "npm run dev", url: "http://127.0.0.1:3008/login", reuseExistingServer: true, timeout: 120_000 },
});
