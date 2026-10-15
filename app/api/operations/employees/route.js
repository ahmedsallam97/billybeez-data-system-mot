import { withAccountAccess } from '@/lib/accounts/routes';
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authorizeApi } from "@/lib/api-auth";
import { serializeOperationsEmployee } from "@/lib/operations/employees";
import { archiveWhere } from "@/lib/operations/employee-removal";

async function GETHandler(request) {
  const { error } = await authorizeApi("OPS_EMPLOYEE_READ");
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const query = String(searchParams.get("q") || "").trim();
  const status = searchParams.get("status");
  const archived = status === 'ARCHIVED';
  const where = { employmentEvents: archived ? { some: archiveWhere } : { none: archiveWhere } };
  if (status === "ACTIVE") where.active = true;
  if (status === "INACTIVE") where.active = false;
  if (status === "EXITED") where.employmentStatus = "EXITED";
  if (query) {
    where.OR = [
      { name: { contains: query } },
      { nameEn: { contains: query } },
      { hrisNumber: { contains: query } },
      { localEmployeeCode: { contains: query } },
    ];
  }

  const employees = await prisma.employee.findMany({
    where,
    include: {
      _count: {
        select: {
          employmentPeriods: true,
          assignments: true,
          scheduleAssignments: true,
          attendanceRecords: true,
          monthlyAppraisals: true,
        },
      },
    },
    orderBy: [{ active: "desc" }, { name: "asc" }],
  });

  return NextResponse.json({
    success: true,
    employees: employees.map((employee) => ({
      ...serializeOperationsEmployee(employee),
      archived,
      counts: employee._count,
    })),
  });
}

export const GET=withAccountAccess(GETHandler);
