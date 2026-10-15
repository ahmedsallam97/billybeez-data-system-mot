import { withAccountAccess } from '@/lib/accounts/routes';
import { NextResponse } from 'next/server';
import { authorizeApi } from '@/lib/api-auth';
import { prisma } from '@/lib/db';
import { uploadReportFile } from '@/lib/operations/report-files';
export const runtime = 'nodejs';
async function POSTHandler(request) {
  const { user, error } = await authorizeApi('OPS_DAILY_MANAGE');
  if (error) return error;
  try {
    const length = Number(request.headers.get('content-length'));
    if (length > 9 * 1024 * 1024) return NextResponse.json({ success: false, error: 'Upload exceeds 8 MB' }, { status: 413 });
    const form = await request.formData();
    const file = await uploadReportFile(prisma, { user, reportId: String(form.get('reportId') || ''), file: form.get('file') });
    return NextResponse.json({ success: true, file });
  } catch (e) { return NextResponse.json({ success: false, error: e.message }, { status: e.status || 422 }); }
}

export const POST=withAccountAccess(POSTHandler);
