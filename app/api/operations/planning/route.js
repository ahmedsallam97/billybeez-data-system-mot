import {NextResponse} from 'next/server';
import {withAccountAccess} from '@/lib/accounts/routes';
import {getCurrentUser} from '@/lib/auth';
import {basePrisma} from '@/lib/db';
import service from '@/lib/operations/planning-service';
async function GETHandler(request){try{const params=new URL(request.url).searchParams;const asOf=params.get('until')||new Date().toISOString().slice(0,10);if(!/^\d{4}-\d{2}-\d{2}$/.test(asOf)||Number.isNaN(Date.parse(asOf)))throw Object.assign(new Error('Invalid report date'),{status:422});return NextResponse.json(await service.loadPlanning(basePrisma,{user:await getCurrentUser(),mode:params.get('mode')||'succession',branch:params.get('branch'),asOf}),{headers:{'Cache-Control':'private, no-store'}});}catch(error){return NextResponse.json({success:false,error:error.message},{status:error.status||400});}}
async function POSTHandler(request){try{const body=await request.json(),user=await getCurrentUser();const handler={createSuccession:service.createSuccession,createDevelopment:service.createDevelopment,updateAssignment:service.updateAssignment,decideReadiness:service.decideReadiness,changeLifecycle:service.changeLifecycle}[body.action];if(!handler)throw Object.assign(new Error('Unknown planning action'),{status:422});return NextResponse.json({success:true,...await handler(basePrisma,{...body,user})});}catch(error){return NextResponse.json({success:false,error:error.message},{status:error.status||400});}}
export const GET=withAccountAccess(GETHandler);
export const POST=withAccountAccess(POSTHandler);
