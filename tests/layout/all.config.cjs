const config = require('./layout.config.cjs');
module.exports = {
  ...config,
  // Regression tests save and restore shared fixtures; keep this combined suite serial.
  workers: 1,
  testMatch: ['workspaces.spec.cjs', 'settings-controls.spec.cjs', 'preview-dialogs.spec.cjs', 'evaluation-editor.spec.cjs', 'regression.spec.cjs'],
};
