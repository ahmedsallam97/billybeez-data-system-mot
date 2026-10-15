const fs=require('node:fs'),path=require('node:path');
require('../e2e/isolation').prepareIsolatedEnvironment();
require('../e2e/isolation').assertIsolatedEnvironment();
process.env.OPS_NEXT_DIST_DIR='tmp/.next-focused-functional-browser';
process.env.OPS_E2E_PRODUCTION='0';process.env.OPS_E2E_DESKTOP_ONLY='1';
const {defineConfig}=require('@playwright/test');
module.exports=defineConfig({testDir:__dirname,testMatch:'focused-functional.spec.cjs',workers:1,retries:0,timeout:90000,globalSetup:require.resolve('../e2e/global-setup'),outputDir:'../../tmp/focused-functional-browser/results',reporter:[['list'],['json',{outputFile:path.resolve('tmp/focused-functional-browser/results.json')}]],use:{channel:'chrome',baseURL:'http://127.0.0.1:3018',storageState:'playwright/.auth/admin.json',viewport:{width:1440,height:900},trace:'retain-on-failure',screenshot:'only-on-failure',actionTimeout:15000},webServer:{command:'node tests/layout/server.cjs',cwd:path.resolve(__dirname,'../..'),url:'http://127.0.0.1:3018/login',reuseExistingServer:false,timeout:180000}});
