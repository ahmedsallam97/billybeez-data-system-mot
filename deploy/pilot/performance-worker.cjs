const {validate}=require('./start.cjs');
const {spawn}=require('node:child_process');
try{validate();}catch(e){console.error('Performance worker startup refused:',e.message);process.exit(1);}
const worker=spawn(process.execPath,['scripts/performance-worker.js'],{stdio:'inherit',env:process.env});
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>worker.kill(signal));
worker.on('exit',(code)=>process.exit(code||0));
