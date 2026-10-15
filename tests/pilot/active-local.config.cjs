// Desktop smoke against an explicitly verified synthetic database copy.
const path=require('node:path'),{defineConfig}=require('@playwright/test');
if(process.env.PILOT_ALLOW_TEST_WRITES!=='verified-pilot-copy'||!process.env.PILOT_ACCOUNTS_FILE)throw Error('Verified synthetic pilot-copy authorization required');
module.exports=defineConfig({testDir:__dirname,testMatch:'active-system-separation.spec.cjs',workers:1,retries:0,timeout:180000,outputDir:path.resolve(process.env.PILOT_TEST_RESULTS),reporter:[['list']],use:{channel:'chrome',baseURL:'http://127.0.0.1:3020',trace:'off',screenshot:'off'}});
