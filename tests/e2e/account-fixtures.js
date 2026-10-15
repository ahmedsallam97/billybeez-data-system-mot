const {assertIsolatedEnvironment}=require('./isolation');
const {readConfig,KEY}=require('../../lib/accounts/service');
async function registerAccountFixture(db,user){
 assertIsolatedEnvironment();const {config}=await readConfig(db),role=config.roles.find(r=>r.name==='Super Admin');const original=Object.values(config.accounts).find(p=>p.roleId===role.id);
 config.accounts[user.id]={...structuredClone(original),displayName:user.name,email:null,phone:null,jobTitle:null,preferredLanguage:null,employeeId:user.employeeId||null,sessionVersion:0,forcePasswordChange:false,archivedAt:null,lastLogin:null,avatar:null,overrides:{}};
 config.revision++;await db.systemSetting.update({where:{key:KEY},data:{value:JSON.stringify(config)}});return user;
}
function installLanguageFixture(){
 require('@playwright/test').test.beforeEach(async()=>{
  assertIsolatedEnvironment();const {database}=require('./stabilization-helpers');database(db=>{
   const row=db.prepare('SELECT value FROM SystemSetting WHERE key=?').get(KEY),config=JSON.parse(row.value);
   let changed=false;for(const profile of Object.values(config.accounts))if(profile.preferredLanguage){profile.preferredLanguage=null;changed=true;}
   if(changed)db.prepare('UPDATE SystemSetting SET value=? WHERE key=?').run(JSON.stringify(config),KEY);
  },true);
 });
}
module.exports={registerAccountFixture,installLanguageFixture};
