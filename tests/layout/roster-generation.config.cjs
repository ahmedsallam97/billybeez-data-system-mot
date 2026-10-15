const base = require('./page-previews.config.cjs');
process.env.OPS_NEXT_DIST_DIR = 'tmp/.next-roster-generation';
process.env.OPS_E2E_DESKTOP_ONLY = '1';
module.exports = {
  ...base,
  testMatch: ['roster-generation.spec.cjs', 'roster-ux.spec.cjs', 'roster-handover.spec.cjs', 'bracelet-stock.spec.cjs', 'settings-controls.spec.cjs'],
  outputDir: '../../tmp/roster-generation-results',
  webServer: { ...base.webServer, timeout: 300000 },
};
