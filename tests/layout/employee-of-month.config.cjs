const base=require('./page-previews.config.cjs');
process.env.OPS_NEXT_DIST_DIR='tmp/.next-eotm';
module.exports={...base,testMatch:['employee-of-month.spec.cjs'],outputDir:'../../tmp/eotm-browser-results',webServer:{...base.webServer,timeout:300000}};
