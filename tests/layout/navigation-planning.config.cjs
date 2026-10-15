const base=require('./page-previews.config.cjs');
process.env.OPS_NEXT_DIST_DIR='tmp/.next-navigation-planning';
module.exports={...base,testMatch:['navigation-planning.spec.cjs','navigation-isolated-pages.spec.cjs'],timeout:300000,outputDir:'../../tmp/navigation-planning-results',webServer:{...base.webServer,timeout:300000}};
