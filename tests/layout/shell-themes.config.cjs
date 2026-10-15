const base = require('./page-previews.config.cjs');
process.env.OPS_E2E_EVIDENCE_DIR = require('node:path').resolve('tmp/shell-theme-evidence');
process.env.OPS_E2E_PRODUCTION = '0';
process.env.OPS_NEXT_DIST_DIR = 'tmp/.next-shell-dev';
module.exports = { ...base, testMatch: 'shell-themes.spec.cjs', outputDir: '../../tmp/shell-theme-results' };
