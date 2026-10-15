import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withAccountAccess } from '@/lib/accounts/routes';
import { getCurrentUser } from '@/lib/auth';
import { loadResponsibilities, publicResponsibilities, saveResponsibilities } from '@/lib/operations/day-responsibilities';

async function GETHandler(request) {
  try { return NextResponse.json(publicResponsibilities(await loadResponsibilities(prisma, await getCurrentUser(), Object.fromEntries(new URL(request.url).searchParams)))); }
  catch (error) { return NextResponse.json({ success: false, error: error.message }, { status: error.status || 400 }); }
}
async function POSTHandler(request) {
  try { return NextResponse.json(await saveResponsibilities(prisma, await getCurrentUser(), await request.json())); }
  catch (error) { return NextResponse.json({ success: false, error: error instanceof SyntaxError ? 'Invalid JSON body' : error.message }, { status: error.status || 400 }); }
}
export const GET = withAccountAccess(GETHandler);
export const POST = withAccountAccess(POSTHandler);
