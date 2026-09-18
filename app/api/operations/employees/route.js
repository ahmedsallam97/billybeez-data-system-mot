import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authorizeApi } from "@/lib/api-auth";
import { serializeOperationsEmployee } from "@/lib/operations/employees";

export async function GET(request) {
  const { error } = await authorizeApi("OPS_EMPLOYEE_READ");
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const query = String(searchParams.get("q") || "").trim();
  const status = searchParams.get("status");
  const where = {};
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
      counts: employee._count,
    })),
  });
}
