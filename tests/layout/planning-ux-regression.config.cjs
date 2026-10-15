const base = require('./navigation-planning.config.cjs');
module.exports = {...base, testMatch:['navigation-planning.spec.cjs','navigation-isolated-pages.spec.cjs','planning-uiux.spec.cjs'], outputDir:'../../tmp/planning-ux-regression-results'};
