const base=require('./page-previews.config.cjs');
process.env.OPS_NEXT_DIST_DIR='tmp/.next-roster-check';
module.exports={...base,testMatch:'roster-responsibilities.spec.cjs',outputDir:'../../tmp/roster-browser-results',webServer:{...base.webServer,timeout:300000}};
