const base=require('./page-previews.config.cjs');
process.env.OPS_NEXT_DIST_DIR='tmp/.next-succession-check';
module.exports={...base,testMatch:'succession-reports.spec.cjs',outputDir:'../../tmp/succession-browser-results',webServer:{...base.webServer,timeout:300000}};
