import { withAccountAccess } from '@/lib/accounts/routes';
import { NextResponse } from 'next/server';
import { authorizeApi } from '@/lib/api-auth';
import { prisma } from '@/lib/db';
import { getSuitabilityRecommendations } from '@/lib/operations/performance-sources';
async function GETHandler(request) {
  const {user,error}=await authorizeApi('OPS_EMPLOYEE_READ');if(error)return error;
  try {
    const params=new URL(request.url).searchParams;
    return NextResponse.json({success:true,...await getSuitabilityRecommendations(prisma,{user,branch:params.get('branch'),profileCode:params.get('profile')||'TRIP_STAFF',asOfDate:params.get('date')||new Date().toISOString().slice(0,10)})});
  } catch(e){return NextResponse.json({success:false,error:e.message},{status:e.status||422});}
}

export const GET=withAccountAccess(GETHandler);
