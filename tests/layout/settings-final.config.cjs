const base = require('./page-previews.config.cjs');
process.env.OPS_E2E_EVIDENCE_DIR = require('node:path').resolve('tmp/component-layout-evidence/regression');
process.env.OPS_E2E_DESKTOP_ONLY = '1';
module.exports = { ...base, grepInvert:/mobile|tablet/i, testMatch: ['schedule-workflow.spec.cjs', 'mandatory-runtime.spec.cjs', 'page-previews.spec.cjs', 'performance-integration.spec.cjs', 'preview-dialogs.spec.cjs', 'regression.spec.cjs', 'workspaces.spec.cjs', 'settings-controls.spec.cjs', 'evaluation-editor.spec.cjs'], outputDir: '../../tmp/settings-final/results' };
