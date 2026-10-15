const base = require('./page-previews.config.cjs');
process.env.OPS_NEXT_DIST_DIR = 'tmp/.next-settings-drafts';
process.env.OPS_E2E_DESKTOP_ONLY = '1';
module.exports = {
  ...base,
  testMatch: ['settings-drafts.spec.cjs', 'settings-controls.spec.cjs'],
  timeout: 180000,
  outputDir: '../../tmp/settings-drafts-results',
  webServer: { ...base.webServer, timeout: 300000 },
};
