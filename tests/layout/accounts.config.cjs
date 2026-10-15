const base=require('./page-previews.config.cjs');
process.env.OPS_E2E_PRODUCTION=process.env.ACCOUNTS_PRODUCTION==='1'?'1':'0';
process.env.OPS_NEXT_DIST_DIR='tmp/.next-accounts-check';
module.exports={...base,testMatch:'accounts.spec.cjs',outputDir:'../../tmp/accounts-browser-results',webServer:{...base.webServer,timeout:300000}};
