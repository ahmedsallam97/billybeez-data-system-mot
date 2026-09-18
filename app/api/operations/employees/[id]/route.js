import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
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

export async function GET(_request, { params }) {
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

export async function PATCH(request, { params }) {
  const { user, error } = await authorizeApi("OPS_EMPLOYEE_MANAGE");
  if (error) return error;
  const { id } = await params;
  const current = await prisma.employee.findUnique({ where: { id } });
  if (!current) return NextResponse.json({ success: false, error: "Employee not found" }, { status: 404 });

  try {
    const body = await request.json();
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
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}
