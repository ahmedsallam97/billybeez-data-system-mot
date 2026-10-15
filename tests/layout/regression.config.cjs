require('../e2e/isolation').prepareIsolatedEnvironment();
process.env.OPS_NEXT_DIST_DIR = '.next-layout-check';
process.env.OPS_E2E_EVIDENCE_DIR = require('node:path').resolve('tmp/component-layout-evidence/regression');
const { defineConfig } = require('@playwright/test');
module.exports = defineConfig({
  testDir: __dirname, testMatch: ['regression.spec.cjs','preview-dialogs.spec.cjs'], workers: 1, retries: 0, timeout: 300000,
  globalSetup: require.resolve('../e2e/global-setup'),
  outputDir: '../../tmp/component-layout-evidence/results', reporter: [['list']],
  use: { channel: process.env.CI ? undefined : 'chrome', baseURL: 'http://127.0.0.1:3018', storageState: 'playwright/.auth/admin.json', screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  webServer: { command: 'node tests/layout/server.cjs', cwd: require('node:path').resolve(__dirname,'../..'), url: 'http://127.0.0.1:3018/login', reuseExistingServer: false, timeout: 180000 },
});
