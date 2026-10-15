import { withAccountAccess } from '@/lib/accounts/routes';
import { NextResponse } from 'next/server';
import { authorizeApi } from '@/lib/api-auth';
import { prisma } from '@/lib/db';
import { downloadReportFile } from '@/lib/operations/report-files';
import { contentDisposition } from '@/lib/operations/employee-uploads';
export const runtime = 'nodejs';
async function GETHandler(request, context) {
  const { user, error } = await authorizeApi('OPS_EMPLOYEE_READ');
  if (error) return error;
  try {
    const { id } = await context.params;
    const { bytes, metadata } = await downloadReportFile(prisma, { user, id });
    return new NextResponse(bytes, { headers: { 'Content-Type': metadata.type, 'Content-Disposition': contentDisposition(metadata.name, metadata.type, new URL(request.url).searchParams.has('download')), 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "sandbox; default-src 'none'" } });
  } catch (e) { return NextResponse.json({ success: false, error: e.message }, { status: e.status || 404 }); }
}

export const GET=withAccountAccess(GETHandler);
