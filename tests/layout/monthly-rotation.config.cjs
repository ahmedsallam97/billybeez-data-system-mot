const base=require('./page-previews.config.cjs');
process.env.OPS_NEXT_DIST_DIR='tmp/.next-monthly-rotation';
module.exports={...base,testMatch:['employee-of-month.spec.cjs','rotation-settings.spec.cjs','rotation-combined.spec.cjs'],outputDir:'../../tmp/monthly-rotation-browser-results',webServer:{...base.webServer,timeout:300000}};
