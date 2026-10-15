const path=require('node:path');
const {PrismaClient}=require('@prisma/client');
const {verifyBundle,inspectDatabase}=require('./pilot-backup');
const {configureHandover}=require('../lib/operations/rotation-handover-config');
async function main(){
 const args=process.argv.slice(2),option=name=>args[args.indexOf(name)+1];
 if(!['--database','--backup','--restore-check','--apply'].every(name=>args.includes(name)))throw Error('Required: --database FILE --backup BUNDLE --restore-check RESTORED_BUNDLE --apply');
 const database=path.resolve(option('--database')),backup=verifyBundle(path.resolve(option('--backup'))),restored=verifyBundle(path.resolve(option('--restore-check')));
 if(JSON.stringify(backup)!==JSON.stringify(restored))throw Error('Backup restoration verification does not match');
 const before=inspectDatabase(database);
 if(before.schemaSha256!==backup.database.schemaSha256||JSON.stringify(before.tables)!==JSON.stringify(backup.database.tables))throw Error('Database changed since backup. Create and verify a fresh backup.');
 const db=new PrismaClient({datasources:{db:{url:'file:'+database.replaceAll('\\','/')}}});
 try{
  const setting=await db.systemSetting.findUnique({where:{key:'ACCOUNT_ACCESS_CONFIG'}}),config=JSON.parse(setting?.value||'{}'),role=config.roles?.find(r=>r.name==='Super Admin');
  const ids=Object.entries(config.accounts||{}).filter(([,p])=>p.roleId===role?.id&&!p.archivedAt).map(([id])=>id);
  const user=await db.user.findFirst({where:{active:true,id:{in:ids}},select:{id:true}});if(!user)throw Error('Active Super Admin required for audit');
  const result=await configureHandover(db,{userId:user.id,backupReference:path.resolve(option('--backup'))}),after=inspectDatabase(database);
  const allowed=['OpsOperationalPosition','EmployeeQualification','SystemSetting','AuditLog'];
  const unexpected=Object.keys(before.tables).filter(name=>!allowed.includes(name)&&after.tables[name].sha256!==before.tables[name].sha256);
  if(unexpected.length||after.schemaSha256!==before.schemaSha256)throw Error('Unexpected data change: '+unexpected.join(', '));
  console.log(JSON.stringify({applied:result.applied,baselineEmployeeCount:result.employeeIds.length,entranceId:result.entranceId,configurationRevision:result.configurationRevision,backupAndRestoreVerified:true,currentRostersSchedulesStockBookingsPreserved:true}));
 }finally{await db.$disconnect();}
}
if(require.main===module)main().catch(error=>{console.error(error.message);process.exitCode=1;});
