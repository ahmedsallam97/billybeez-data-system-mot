const base = require("./page-previews.config.cjs");
process.env.OPS_NEXT_DIST_DIR = "tmp/.next-accounts-check";
process.env.OPS_E2E_DESKTOP_ONLY = "1";
process.env.OPS_E2E_EVIDENCE_DIR = require("node:path").resolve(
  "tmp/accounts-final/regression",
);
module.exports = {
  ...base,
  testMatch: [
    "accounts.spec.cjs",
    "shell-themes.spec.cjs",
    "schedule-workflow.spec.cjs",
    "mandatory-runtime.spec.cjs",
    "page-previews.spec.cjs",
    "performance-integration.spec.cjs",
    "preview-dialogs.spec.cjs",
    "regression.spec.cjs",
    "workspaces.spec.cjs",
    "settings-controls.spec.cjs",
    "evaluation-editor.spec.cjs",
  ],
  outputDir: "../../tmp/accounts-final/results",
  webServer: { ...base.webServer, timeout: 300000 },
};
