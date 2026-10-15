const base = require('./page-previews.config.cjs');
process.env.OPS_NEXT_DIST_DIR = 'tmp/.next-bracelet-stock';
module.exports = {...base, testMatch:['bracelet-stock.spec.cjs','roster-handover.spec.cjs','action-icons.spec.cjs'], timeout:300000, outputDir:'../../tmp/bracelet-stock-results', webServer:{...base.webServer,timeout:300000}};
