const base = require('./page-previews.config.cjs');
process.env.OPS_E2E_EVIDENCE_DIR = require('node:path').resolve('tmp/shell-theme-final/regression');
delete process.env.OPS_E2E_DESKTOP_ONLY;
module.exports = { ...base, testMatch: ['shell-themes.spec.cjs', 'schedule-workflow.spec.cjs', 'mandatory-runtime.spec.cjs', 'page-previews.spec.cjs', 'performance-integration.spec.cjs', 'preview-dialogs.spec.cjs', 'regression.spec.cjs', 'workspaces.spec.cjs', 'settings-controls.spec.cjs', 'evaluation-editor.spec.cjs'], outputDir: '../../tmp/shell-theme-final/results' };
