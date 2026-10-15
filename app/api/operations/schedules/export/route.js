import { withAccountAccess } from '@/lib/accounts/routes';
import { scheduleBranch, assertScheduleBranch, scheduleEmployees, employeeScope, orderedRows, completeOrder } from "@/lib/operations/schedule-state";
import { configuredCodes, importTemplate } from "@/lib/operations/schedule-import";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authorizeApi } from "@/lib/api-auth";
import { getSetting } from "@/lib/settings";
import { scheduleColors } from "@/lib/operations/schedule-colors";
import { schedulePdf,scheduleWorkbook } from "@/lib/operations/schedule-export";

async function GETHandler(request) {
  const { user, error } = await authorizeApi("OPS_SCHEDULE_READ"); if (error) return error;
  const url = new URL(request.url); const id = String(url.searchParams.get("scheduleId") || ""); const format = String(url.searchParams.get("format") || "xlsx").toLowerCase();
  if (!["pdf","xlsx","template"].includes(format) || !id) return NextResponse.json({success:false,error:"Choose a schedule and PDF or XLSX format"},{status:400});
  try {
  const selectedBranch=await scheduleBranch(prisma,user,url.searchParams.get("branch"));
  const [schedule, branchRaw, colorsRaw, templateRaw] = await Promise.all([prisma.opsSchedule.findUnique({
    where: { id },
    include: {
      assignments: {
        where: { employee: await employeeScope(prisma,selectedBranch) },
        include: { employee: { select: { id:true,name: true, hrisNumber: true, localEmployeeCode: true, department: true } } },
        orderBy: [{ employee: { name: "asc" } }, { workDate: "asc" }],
      },
    },
  }), getSetting("OPS_BRANCH_CONFIG", "{}"), getSetting("OPS_SCHEDULE_CODE_CONFIG", "{}"), getSetting("DAILY_OPERATIONS_TEMPLATE_CONFIG", "{}")]);
  if (!schedule) return NextResponse.json({ success: false, error: "Schedule not found" }, { status: 404 });
  const state=await assertScheduleBranch(prisma,schedule,selectedBranch);
  const employees=orderedRows(await scheduleEmployees(prisma,selectedBranch),state.state.displayOrder);
  schedule.displayOrder=completeOrder([...employees,...schedule.assignments.map(item=>item.employee)],state.state.displayOrder);
  if(format==="template"){
    if(schedule.status!=="DRAFT")return NextResponse.json({success:false,error:"Select a draft before downloading an import template"},{status:409});
    return new NextResponse(importTemplate(schedule,employees,await configuredCodes(prisma),selectedBranch),{headers:{"content-type":"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet","content-disposition":`attachment; filename="${selectedBranch}-import-${schedule.operationalYear}-${schedule.operationalMonth}-v${schedule.version}.xlsx"`,"cache-control":"no-store"}});
  }
  const parse = (value) => JSON.parse(value); const branch = parse(branchRaw); const configuredColors = scheduleColors(parse(colorsRaw)); const template = parse(templateRaw);
  const colors = { ...Object.fromEntries(Object.entries(configuredColors).map(([key, meta]) => [key.toUpperCase(), meta?.color]).filter(([, color]) => color)) }; if(colors.HOLIDAY)colors.H = colors.HOLIDAY;
  const branchCode = selectedBranch;
  const filenameCode = String(branchCode).replace(/[^a-zA-Z0-9_-]/g,"_") || "branch";
  if (format === "pdf") {
    const output = await schedulePdf(schedule, { branchCode, branchName: branch.branchName, colors, brand: template });
    return new NextResponse(output, { headers: { "content-type": "application/pdf", "content-disposition": `attachment; filename="${filenameCode}-roster-${schedule.operationalYear}-${String(schedule.operationalMonth).padStart(2, "0")}-v${schedule.version}.pdf"`, "cache-control": "no-store" } });
  }
  const output = scheduleWorkbook(schedule);
  return new NextResponse(output, { headers: { "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "content-disposition": `attachment; filename="${filenameCode}-roster-${schedule.operationalYear}-${String(schedule.operationalMonth).padStart(2, "0")}-v${schedule.version}.xlsx`, "cache-control": "no-store" } });
  } catch(error) { return NextResponse.json({success:false,error:"Schedule export could not be generated. Check configuration and retry."},{status:error.status||500}); }
}

export const GET=withAccountAccess(GETHandler);
