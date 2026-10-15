const baseline=process.env.DESKTOP_AUDIT_PHASE==='before';
require('../e2e/isolation').prepareIsolatedEnvironment();
process.env.OPS_NEXT_DIST_DIR=baseline?'tmp/.next-roster-generation':process.env.DESKTOP_AUDIT_RELEASE==='1'?'tmp/.next-desktop-layout-release-5':'tmp/.next-desktop-layout-final';
process.env.OPS_E2E_PRODUCTION='1';
process.env.OPS_E2E_REUSE_BUILD='1';
const {defineConfig}=require('@playwright/test');
const path=require('node:path');
module.exports=defineConfig({testDir:__dirname,testMatch:'desktop-audit.spec.cjs',workers:4,fullyParallel:true,retries:0,timeout:600000,globalSetup:require.resolve('./desktop-audit-setup.cjs'),outputDir:'../../tmp/desktop-audit/results',reporter:[['list'],['json',{outputFile:'tmp/desktop-audit/results.json'}]],use:{channel:'chrome',baseURL:'http://127.0.0.1:3018',storageState:'playwright/.auth/admin.json',trace:'retain-on-failure',screenshot:'only-on-failure',actionTimeout:15000},webServer:{command:'node tests/layout/server.cjs',cwd:path.resolve(__dirname,'../..'),url:'http://127.0.0.1:3018/login',reuseExistingServer:false,timeout:300000}});
