const { defineConfig } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const target = new URL(process.env.PILOT_BASE_URL || 'https://missing.invalid');
if (target.protocol !== 'https:' || target.hostname === 'missing.invalid') throw new Error('PILOT_BASE_URL must be the approved HTTPS pilot');
const local = ['localhost','127.0.0.1'].includes(target.hostname);
if (process.env.PILOT_LOCAL_TLS === 'true' && !local) throw new Error('Public HTTPS certificate errors must never be ignored');
if (process.env.PILOT_ALLOW_TEST_WRITES !== 'verified-pilot-copy') throw new Error('Explicit verified pilot-copy test authorization is required');
const access = fs.readFileSync(process.env.PILOT_ACCESS_FILE, 'utf8');
const password = access.match(/^Password: (.+)$/m)?.[1];
if (!password) throw new Error('Private pilot gate credential file required');
module.exports = defineConfig({
  testDir: __dirname, testMatch: process.env.PILOT_TEST_SPEC || 'pilot.spec.cjs', workers: 1, retries: 0, timeout: 120000,
  outputDir: path.resolve(process.env.PILOT_TEST_RESULTS || 'tmp/pilot-deployment/test-results'), reporter: [['list']],
  use: { channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome', baseURL: target.origin, ignoreHTTPSErrors: local && process.env.PILOT_LOCAL_TLS === 'true', httpCredentials: { username: 'pilot', password }, trace: 'off', screenshot: 'off' },
});
