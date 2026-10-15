const base = require('./page-previews.config.cjs');
// The retained production build predates the settings save-state improvement.
process.env.OPS_NEXT_DIST_DIR = 'tmp/.next-roster-ux';
process.env.OPS_E2E_REUSE_BUILD = '1';
module.exports = { ...base, testMatch: 'settings-before.spec.cjs', outputDir: '../../tmp/settings-before-results', webServer: { ...base.webServer, timeout: 300000 } };
