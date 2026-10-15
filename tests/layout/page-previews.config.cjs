require('../e2e/isolation').prepareIsolatedEnvironment();
process.env.OPS_NEXT_DIST_DIR = '.next-layout-check';
process.env.OPS_E2E_PRODUCTION = '1';
const {defineConfig}=require('@playwright/test');
const path=require('node:path');
module.exports=defineConfig({testDir:__dirname,testMatch:'page-previews.spec.cjs',workers:1,retries:0,timeout:300000,
globalSetup:require.resolve('../e2e/global-setup'),outputDir:'../../tmp/page-previews/results',reporter:[['list']],
use:{channel:'chrome',baseURL:'http://127.0.0.1:3018',storageState:'playwright/.auth/admin.json',trace:'retain-on-failure',screenshot:'only-on-failure',actionTimeout:30000},
webServer:{command:'node tests/layout/server.cjs',cwd:path.resolve(__dirname,'../..'),url:'http://127.0.0.1:3018/login',reuseExistingServer:false,timeout:180000}});
