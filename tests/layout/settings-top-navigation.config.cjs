const fs = require('node:fs');
const path = require('node:path');
const { defineConfig } = require('@playwright/test');
const { prepareIsolatedEnvironment, assertIsolatedEnvironment } = require('../e2e/isolation');

prepareIsolatedEnvironment();
assertIsolatedEnvironment();
// This navigation check needs the copied records, not unrelated scoring fixtures.
process.env.E2E_MUTATIONS = '0';
process.env.OPS_NEXT_DIST_DIR = process.env.SETTINGS_NAV_DIST_DIR || 'tmp/.next-settings-navigation';
process.env.OPS_E2E_PRODUCTION = '1';
process.env.OPS_E2E_REUSE_BUILD = process.env.SETTINGS_NAV_REUSE_BUILD === '1' ? '1' : '0';
process.env.OPS_E2E_DESKTOP_ONLY = '1';
process.env.SETTINGS_NAV_EVIDENCE_DIR ||= 'docs/settings-navigation-2026-10-13';
const phase = process.env.SETTINGS_NAV_PHASE || 'after';
const resultLabel = process.env.SETTINGS_NAV_RESULT_LABEL || phase;
fs.mkdirSync('tmp/settings-navigation', { recursive: true });
fs.writeFileSync('tmp/settings-navigation/environment.json', JSON.stringify(Object.fromEntries([
  'OPS_E2E_RUN_DIR', 'DATABASE_URL', 'DATABASE_PROVIDER', 'EMPLOYEE_FILE_STORAGE_ROOT',
  'EMPLOYEE_FILE_STORAGE_PROVIDER', 'SESSION_SECRET', 'AUTH_COOKIE_NAME', 'E2E_MUTATIONS',
].map(key => [key, process.env[key]]))));

module.exports = defineConfig({
  testDir: __dirname,
  testMatch: ['settings-top-navigation.spec.cjs'],
  workers: 1,
  retries: 0,
  timeout: 150000,
  globalSetup: require.resolve('../e2e/global-setup'),
  outputDir: path.resolve('tmp/settings-navigation', resultLabel, 'results'),
  reporter: [['list'], ['json', { outputFile: path.resolve('tmp/settings-navigation', `${resultLabel}-results.json`) }]],
  use: {
    channel: 'chrome',
    baseURL: 'http://127.0.0.1:3018',
    storageState: 'playwright/.auth/admin.json',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    actionTimeout: 15000,
  },
  webServer: {
    command: 'node tests/layout/server.cjs',
    cwd: path.resolve(__dirname, '../..'),
    url: 'http://127.0.0.1:3018/login',
    reuseExistingServer: false,
    timeout: 180000,
  },
});
