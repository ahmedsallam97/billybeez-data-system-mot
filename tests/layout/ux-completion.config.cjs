const fs=require('node:fs'),path=require('node:path');
require('../e2e/isolation').prepareIsolatedEnvironment();require('../e2e/isolation').assertIsolatedEnvironment();
process.env.OPS_NEXT_DIST_DIR='tmp/.next-ux-completion-final';process.env.OPS_E2E_PRODUCTION='1';process.env.OPS_E2E_REUSE_BUILD=process.env.UX_COMPLETION_REUSE_BUILD==='1'?'1':'0';process.env.OPS_E2E_DESKTOP_ONLY='1';
process.env.UX_EVIDENCE_DIR='docs/ux-completion-2026-10-12';
process.env.UX_VISUAL='1';process.env.UX_SCREEN_TARGETS='employees,catalogs,log,roster-settings,hris-dialog';
fs.writeFileSync('tmp/ux-completion-env.json',JSON.stringify(Object.fromEntries(['OPS_E2E_RUN_DIR','DATABASE_URL','DATABASE_PROVIDER','EMPLOYEE_FILE_STORAGE_ROOT','EMPLOYEE_FILE_STORAGE_PROVIDER','SESSION_SECRET','AUTH_COOKIE_NAME','E2E_MUTATIONS'].map(key=>[key,process.env[key]]))));
const {defineConfig}=require('@playwright/test');
module.exports=defineConfig({testDir:__dirname,testMatch:['ux-implementation.spec.cjs','ux-dialogs.spec.cjs','ux-completion.spec.cjs'],workers:1,retries:0,timeout:120000,globalSetup:require.resolve('../e2e/global-setup'),outputDir:'../../tmp/ux-completion/results',reporter:[['list'],['json',{outputFile:path.resolve('tmp/ux-completion/results.json')}]],use:{channel:'chrome',baseURL:'http://127.0.0.1:3018',storageState:'playwright/.auth/admin.json',trace:'retain-on-failure',screenshot:'only-on-failure',actionTimeout:15000},webServer:{command:'node tests/layout/server.cjs',cwd:path.resolve(__dirname,'../..'),url:'http://127.0.0.1:3018/login',reuseExistingServer:false,timeout:180000}});
