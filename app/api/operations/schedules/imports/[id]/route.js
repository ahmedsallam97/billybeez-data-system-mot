import { withAccountAccess } from '@/lib/accounts/routes';
import {NextResponse} from 'next/server';
import {prisma} from '@/lib/db';
import {authorizeApi} from '@/lib/api-auth';
import {scheduleBranch} from '@/lib/operations/schedule-state';
import {importRecord} from '@/lib/operations/schedule-import-service';
import {readEmployeeFile} from '@/lib/employee-file-storage';
import {createHash} from 'node:crypto';
async function GETHandler(request,{params}){
  const {user,error}=await authorizeApi('OPS_SCHEDULE_READ');if(error)return error;
  try{
    const branch=await scheduleBranch(prisma,user,new URL(request.url).searchParams.get('branch'));
    const {record}=await importRecord(prisma,(await params).id);
    if(record.branch!==branch)return NextResponse.json({success:false,error:'Source access denied'},{status:403});
    const buffer=await readEmployeeFile(record.storageKey);
    if(createHash('sha256').update(buffer).digest('hex')!==record.sha256)throw new Error('Source verification failed');
    return new NextResponse(buffer,{headers:{'content-type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','content-disposition':`attachment; filename="schedule-import-${record.id}.xlsx"`,'cache-control':'no-store','x-content-type-options':'nosniff'}});
  }catch(error){return NextResponse.json({success:false,error:error.status?error.message:'Import source could not be downloaded'},{status:error.status||500});}
}

export const GET=withAccountAccess(GETHandler);
