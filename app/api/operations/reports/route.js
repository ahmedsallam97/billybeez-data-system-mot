import { withAccountAccess } from '@/lib/accounts/routes';
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authorizeApi } from "@/lib/api-auth";
import {refreshAfterSourceChange} from '@/lib/operations/employee-of-month';
import {
  calculateAndStoreSuitability,
  changeOperationalReport,
  getOperationalReports,
  prepareOperationalReport,
} from "@/lib/operations/operational-report-service";

function errorResponse(error) {
  return NextResponse.json({
    success: false,
    error: error?.message || "Operational report request failed",
    code: error?.code || "OPERATIONAL_REPORT_ERROR",
    ...(error?.details ? { details: error.details } : {}),
  }, { status: Number(error?.status) || 400 });
}

async function GETHandler(request) {
  const { user, error } = await authorizeApi("OPS_EMPLOYEE_READ");
  if (error) return error;
  try {
    const url = new URL(request.url);
    if (url.searchParams.get("prepare") === "1") {
      const prepared = await prepareOperationalReport(prisma, { user, reportType: url.searchParams.get("reportType"), sourceId: url.searchParams.get("sourceId"), shiftCode: url.searchParams.get("shiftCode"), branch: url.searchParams.get("branch") });
      return NextResponse.json({ success: true, ...prepared });
    }
    const result = await getOperationalReports(prisma, {
      user,
      id: url.searchParams.get("id") || undefined,
      branch: url.searchParams.get("branch") || undefined,
      reportType: url.searchParams.get("reportType") || undefined,
      status: url.searchParams.get("status") || undefined,
      workDate: url.searchParams.get("workDate") || undefined,
      sourceId: url.searchParams.get("sourceId") || undefined,
    });
    return NextResponse.json({ success: true, ...result });
  } catch (requestError) {
    return errorResponse(requestError);
  }
}

async function POSTHandler(request) {
  const { user, error } = await authorizeApi("OPS_DAILY_MANAGE");
  if (error) return error;
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) return errorResponse(Object.assign(new Error("A JSON request body is required"), { code: "INVALID_BODY", status: 400 }));
  try {
    if (body.action === "calculateSuitability") {
      const result = await calculateAndStoreSuitability(prisma, {
        user,
        employeeId: body.employeeId,
        branch: body.branch,
        profileCode: body.profileCode,
        asOfDate: body.asOfDate,

        override: body.override,
        reason: body.reason,
      });
      return NextResponse.json({ success: true, ...result });
    }
    const result = await changeOperationalReport(prisma, {
      user,
      action: body.action,
      id: body.id,
      expectedRevision: body.expectedRevision,
      reportType: body.reportType,
      sourceId: body.sourceId,
      branch: body.branch,
      workDate: body.workDate,
      shiftCode: body.shiftCode,
      templateCode: body.templateCode,
      surveyTemplateCode: body.surveyTemplateCode,
      effectiveDate: body.effectiveDate,
      draft: body.draft,
      reason: body.reason,
    });
    if(result.report)await refreshAfterSourceChange(prisma,{user,branch:result.report.branch,date:result.report.workDate,employeeIds:result.report.draft.participants.map(row=>row.employeeId)});
    return NextResponse.json({ success: true, ...result });
  } catch (requestError) {
    return errorResponse(requestError);
  }
}

export const GET=withAccountAccess(GETHandler);
export const POST=withAccountAccess(POSTHandler);
