import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authorizeApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { getSetting } from "@/lib/settings";
import { normalizeEmployeeDepartments } from "@/lib/employee-departments";

function normalizedName(value) {
  return String(value || "").trim().replace(/\s+/g, " ").toLocaleLowerCase("en");
}

async function employeePayload(body) {
  const departments = normalizeEmployeeDepartments(await getSetting("EMPLOYEE_DEPARTMENT_CONFIG", ""));
  const departmentIds = departments.map((department) => department.id);
  const name = String(body.name || "").trim().replace(/\s+/g, " ");
  const department = departmentIds.includes(body.department) ? body.department : "OPERATION";
  const active = body.active !== false;

  return { name, department, active };
}

export async function GET(request) {
  const { user, error } = await authorizeApi("EMPLOYEE_READ");
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const department = searchParams.get("department") || "OPERATION";
  const includeInactive = searchParams.get("includeInactive") === "true";
  const departments = normalizeEmployeeDepartments(await getSetting("EMPLOYEE_DEPARTMENT_CONFIG", ""));
  const departmentIds = departments.map((item) => item.id);
  const dataDepartmentIds = departments.filter((item) => item.kind === "DATA" && item.active).map((item) => item.id);
  const restaurantDepartmentIds = departments.filter((item) => item.kind === "KITCHEN" && item.active).map((item) => item.id);

  if (department !== "ALL" && !departmentIds.includes(department)) {
    return NextResponse.json({ success: false, error: "Invalid employee department" }, { status: 400 });
  }

  if ((includeInactive || department === "ALL") && !["ADMIN", "MANAGER"].includes(user.role)) {
    return NextResponse.json({ success: false, error: "Manager permission required" }, { status: 403 });
  }

  if (["CASHIER", "DATA"].includes(user.role) && department !== "ALL" && !dataDepartmentIds.includes(department)) {
    return NextResponse.json({ success: false, error: "Permission denied" }, { status: 403 });
  }

  if (user.role === "KITCHEN" && department !== "ALL" && !restaurantDepartmentIds.includes(department)) {
    return NextResponse.json({ success: false, error: "Permission denied" }, { status: 403 });
  }

  const where = includeInactive ? {} : { active: true };

  if (department !== "ALL") {
    where.department = department;
  } else if (["CASHIER", "DATA"].includes(user.role)) {
    where.department = { in: dataDepartmentIds };
  } else if (user.role === "KITCHEN") {
    where.department = { in: restaurantDepartmentIds };
  }

  const employees = await prisma.employee.findMany({
    where,
    orderBy: { name: "asc" },
  });

  return NextResponse.json(employees);
}

export async function POST(request) {
  const { user, error } = await authorizeApi("EMPLOYEE_MANAGE");
  if (error) return error;

  const body = await request.json();
  const data = await employeePayload(body);

  if (!data.name) {
    return NextResponse.json({ success: false, error: "Employee name is required" }, { status: 400 });
  }

  const employees = await prisma.employee.findMany({ select: { name: true } });
  const existing = employees.some((employee) => normalizedName(employee.name) === normalizedName(data.name));

  if (existing) {
    return NextResponse.json({ success: false, error: "Employee already exists" }, { status: 400 });
  }

  const employee = await prisma.employee.create({ data });

  await writeAudit({
    action: "EMPLOYEE_CREATED",
    user,
    summary: `Created employee ${employee.name}`,
    metadata: { employeeId: employee.id, department: employee.department },
  });

  return NextResponse.json({ success: true, employee });
}

export async function PATCH(request) {
  const { user, error } = await authorizeApi("EMPLOYEE_MANAGE");
  if (error) return error;

  const body = await request.json();
  const id = String(body.id || "");
  const data = await employeePayload(body);

  if (!id) {
    return NextResponse.json({ success: false, error: "Employee id is required" }, { status: 400 });
  }

  if (!data.name) {
    return NextResponse.json({ success: false, error: "Employee name is required" }, { status: 400 });
  }

  const currentEmployee = await prisma.employee.findUnique({ where: { id } });

  if (!currentEmployee) {
    return NextResponse.json({ success: false, error: "Employee not found" }, { status: 404 });
  }

  const employees = await prisma.employee.findMany({
    where: { id: { not: id } },
    select: { name: true },
  });
  const existingName = employees.some((employee) => normalizedName(employee.name) === normalizedName(data.name));

  if (existingName) {
    return NextResponse.json({ success: false, error: "Employee already exists" }, { status: 400 });
  }

  const employee = await prisma.employee.update({
    where: { id },
    data,
  });

  await writeAudit({
    action: "EMPLOYEE_UPDATED",
    user,
    summary: `Updated employee ${employee.name}`,
    metadata: { employeeId: employee.id, department: employee.department, active: employee.active },
  });

  return NextResponse.json({ success: true, employee });
}
