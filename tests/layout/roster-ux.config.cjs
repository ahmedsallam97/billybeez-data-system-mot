const base = require('./page-previews.config.cjs');

process.env.OPS_NEXT_DIST_DIR = 'tmp/.next-roster-ux';

module.exports = {
  ...base,
  testMatch: ['roster-ux.spec.cjs','bracelet-stock.spec.cjs','roster-handover.spec.cjs'],
  timeout: 300000,
  outputDir: '../../tmp/roster-ux-results',
  webServer: { ...base.webServer, timeout: 300000 },
};
