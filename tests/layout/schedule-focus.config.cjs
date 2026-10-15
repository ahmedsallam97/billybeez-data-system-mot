const base=require('./page-previews.config.cjs');
process.env.OPS_E2E_PRODUCTION='0';
process.env.OPS_NEXT_DIST_DIR='tmp/.next-schedule-dev';
process.env.OPS_E2E_DESKTOP_ONLY='1';
module.exports={...base,testMatch:['page-previews.spec.cjs','schedule-workflow.spec.cjs','regression.spec.cjs'],outputDir:'../../tmp/schedule-focus/results'};
