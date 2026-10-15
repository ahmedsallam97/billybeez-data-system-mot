import { withAccountAccess } from '@/lib/accounts/routes';
import { NextResponse } from "next/server";
import { prisma, basePrisma } from "@/lib/db";
import { removeEmployee } from "@/lib/operations/employee-removal";
import { getCurrentUser } from "@/lib/auth";
import { accountResponse } from "@/lib/accounts/http";
import { authorizeApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { normalizeOperationsEmployee, serializeOperationsEmployee } from "@/lib/operations/employees";

const employeeInclude = {
  employmentPeriods: { orderBy: { startDate: "desc" } },
  assignments: { orderBy: { effectiveFrom: "desc" } },
  weeklyOffPatterns: { orderBy: { effectiveFrom: "desc" } },
  leaveAccounts: { include: { transactions: { where: { status: "VALID" } } } },
  overtimeAccount: { include: { transactions: true } },
  monthlyAppraisals: { orderBy: [{ year: "desc" }, { month: "desc" }] },
};

async function GETHandler(_request, { params }) {
  const { error } = await authorizeApi("OPS_EMPLOYEE_SENSITIVE_READ");
  if (error) return error;
  const { id } = await params;
  const employee = await prisma.employee.findUnique({ where: { id }, include: employeeInclude });
  if (!employee) return NextResponse.json({ success: false, error: "Employee not found" }, { status: 404 });

  return NextResponse.json({
    success: true,
    employee: {
      ...serializeOperationsEmployee(employee, { includeNationalId: true }),
      employmentPeriods: employee.employmentPeriods,
      assignments: employee.assignments,
      weeklyOffPatterns: employee.weeklyOffPatterns,
      leaveAccounts: employee.leaveAccounts.map((account) => ({
        id: account.id,
        leaveType: account.leaveType,
        leaveYear: account.leaveYear,
        entitlement: account.entitlement,
        balance: account.transactions.reduce((sum, transaction) => sum + transaction.amount, 0),
      })),
      overtimeMinutes: employee.overtimeAccount?.transactions.reduce((sum, transaction) => sum + transaction.minutes, 0) || 0,
      monthlyAppraisals: employee.monthlyAppraisals,
    },
  });
}

async function PATCHHandler(request, { params }) {
  const { user, error } = await authorizeApi("OPS_EMPLOYEE_MANAGE");
  if (error) return error;
  const { id } = await params;
  const current = await prisma.employee.findUnique({ where: { id } });
  if (!current) return NextResponse.json({ success: false, error: "Employee not found" }, { status: 404 });

  try {
    const body = await request.json();
    if (body.action === 'restoreEmployee') return NextResponse.json(await removeEmployee(basePrisma, user, id, { password: body.password, restore: true }));
    const data = normalizeOperationsEmployee(body, current);
    const employee = await prisma.employee.update({ where: { id }, data });
    await writeAudit({
      action: "OPS_EMPLOYEE_UPDATED",
      user,
      summary: `Updated operations profile for ${employee.name}`,
      metadata: { employeeId: employee.id, changedFields: Object.keys(body).filter((key) => key !== "nationalId") },
    });
    return NextResponse.json({ success: true, employee: serializeOperationsEmployee(employee, { includeNationalId: true }) });
  } catch (updateError) {
    const message = updateError?.code === "P2002" ? "Employee identifier must be unique" : updateError.message;
    return NextResponse.json({ success: false, error: message }, { status: updateError.status || 400 });
  }
}

export const GET=withAccountAccess(GETHandler);
export const PATCH=withAccountAccess(PATCHHandler);
export const DELETE=withAccountAccess(accountResponse(async (request, { params }) => {
  const { id } = await params;
  const body = await request.json();
  return NextResponse.json(await removeEmployee(basePrisma, await getCurrentUser(), id, { password: body.password }));
}));
