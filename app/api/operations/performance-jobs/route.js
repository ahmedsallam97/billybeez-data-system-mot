import { withAccountAccess } from '@/lib/accounts/routes';
import {NextResponse} from 'next/server';
import {authorizeApi} from '@/lib/api-auth';
import {prisma} from '@/lib/db';
import {operationsBranch} from '@/lib/operations/business-access';
import {runPerformanceJobs} from '@/lib/operations/performance-jobs';
async function GETHandler(request){const {user,error}=await authorizeApi('OPS_APPRAISAL_READ');if(error)return error;try{const branch=await operationsBranch(prisma,user,new URL(request.url).searchParams.get('branch'));const row=await prisma.systemSetting.findUnique({where:{key:'OPS_PERFORMANCE_JOB:LAST:'+branch}});return NextResponse.json({success:true,branch,lastRun:row?JSON.parse(row.value):null,backgroundEnabled:process.env.OPS_PERFORMANCE_WORKER_ENABLED==='1'});}catch(e){return NextResponse.json({success:false,error:e.message},{status:e.status||400});}}
async function POSTHandler(request){const {user,error}=await authorizeApi('OPS_APPRAISAL_APPROVE');if(error)return error;try{const body=await request.json();return NextResponse.json({success:true,...await runPerformanceJobs(prisma,{user,branch:body.branch})});}catch(e){return NextResponse.json({success:false,error:e.message},{status:e.status||400});}}

export const GET=withAccountAccess(GETHandler);
export const POST=withAccountAccess(POSTHandler);
