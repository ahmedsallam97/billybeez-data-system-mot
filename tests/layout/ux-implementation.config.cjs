require('../e2e/isolation').prepareIsolatedEnvironment();
process.env.OPS_NEXT_DIST_DIR = process.env.UX_IMPLEMENTATION_DIST || 'tmp/.next-ux-implementation';
process.env.OPS_E2E_PRODUCTION = '1';
process.env.OPS_E2E_REUSE_BUILD = '1';
process.env.OPS_E2E_DESKTOP_ONLY = '1';
const { defineConfig } = require('@playwright/test');
const path = require('node:path');
module.exports = defineConfig({ testDir: __dirname, testMatch: ['ux-implementation.spec.cjs', 'ux-dialogs.spec.cjs', 'ux-delivery-evidence.spec.cjs'], workers: 1, retries: 0, timeout: 240000, globalSetup: require.resolve('../e2e/global-setup'), outputDir: '../../tmp/ux-implementation/results', reporter: [['list'], ['json', { outputFile: 'tmp/ux-implementation/results.json' }]], use: { channel: 'chrome', baseURL: 'http://127.0.0.1:3018', storageState: 'playwright/.auth/admin.json', trace: 'retain-on-failure', screenshot: 'only-on-failure', actionTimeout: 15000 }, webServer: { command: 'node tests/layout/server.cjs', cwd: path.resolve(__dirname, '../..'), url: 'http://127.0.0.1:3018/login', reuseExistingServer: false, timeout: 300000 } });
