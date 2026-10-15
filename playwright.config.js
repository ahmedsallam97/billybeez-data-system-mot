require("./tests/e2e/isolation").prepareIsolatedEnvironment();
const { defineConfig } = require("@playwright/test");

module.exports = defineConfig({
  testDir: "./tests/e2e",
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  forbidOnly: true,
  reporter: [["line"]],
  outputDir: "test-results/playwright",
  globalSetup: require.resolve("./tests/e2e/global-setup"),
  use: {
    baseURL: process.env.E2E_BASE_URL || "http://127.0.0.1:3018",
    storageState: "playwright/.auth/admin.json",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
  },
  projects: [{ name: "chromium", use: { channel: process.env.PLAYWRIGHT_CHANNEL || "chrome" } }],
  webServer: { command: "node tests/e2e/server.js", url: "http://127.0.0.1:3018/login", reuseExistingServer: false, timeout: process.env.OPS_E2E_PRODUCTION === "1" ? 240_000 : 120_000 },
});
