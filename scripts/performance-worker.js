// Run beside the application using the same persistent DB/environment. It never
// approves results. A dedicated active, unlinked ADMIN must be chosen explicitly.
const {prisma}=require('../lib/db');
const {runPerformanceJobs}=require('../lib/operations/performance-jobs');
async function main(){
  if(process.env.OPS_PERFORMANCE_WORKER_ENABLED!=='1')throw new Error('Set OPS_PERFORMANCE_WORKER_ENABLED=1 explicitly after pilot review');
  const id=process.env.OPS_PERFORMANCE_WORKER_USER_ID,branch=process.env.OPS_PERFORMANCE_WORKER_BRANCH;
  if(!id||!branch)throw new Error('Worker user ID and branch must be configured');
  const user=await prisma.user.findUnique({where:{id}});
  if(!user?.active||user.role!=='ADMIN'||user.employeeId)throw new Error('Worker requires an active unlinked ADMIN account');
  const seconds=Number(process.env.OPS_PERFORMANCE_WORKER_INTERVAL_SECONDS||300);
  if(!Number.isInteger(seconds)||seconds<60||seconds>86400)throw new Error('Worker interval must be 60–86400 seconds');
  let stopping=false;process.on('SIGTERM',()=>{stopping=true;});process.on('SIGINT',()=>{stopping=true;});
  do{
    try{const result=await runPerformanceJobs(prisma,{user,branch});console.log(JSON.stringify({at:new Date().toISOString(),branch,busy:result.busy||false,suitability:result.suitability?.length||0,appraisals:result.appraisals?.length||0,errors:result.errors||[]}));}catch(e){console.error('Performance worker:',e.message);if(process.argv.includes('--once'))throw e;}
    if(process.argv.includes('--once')||stopping)break;
    await new Promise(resolve=>{const done=()=>{clearTimeout(timer);process.off('SIGTERM',done);process.off('SIGINT',done);resolve();};const timer=setTimeout(done,seconds*1000);process.once('SIGTERM',done);process.once('SIGINT',done);});
  }while(!stopping);
}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;}).finally(()=>prisma.$disconnect());
