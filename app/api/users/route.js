import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { authorizeApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";

const roles = ["ADMIN", "MANAGER", "CASHIER", "KITCHEN"];

function serializeUser(user) {
  return {
    id: user.id,
    name: user.name,
    username: user.username,
    role: user.role,
    active: user.active,
    accountType: user.employeeId ? "EMPLOYEE" : "GENERAL",
    employeeId: user.employeeId || "",
    employeeName: user.employee?.name || "",
    employeeDepartment: user.employee?.department || "",
    createdAt: user.createdAt,
  };
}

function userPayload(body) {
  const accountType = String(body.accountType || (body.employeeId ? "EMPLOYEE" : "GENERAL")).toUpperCase();
  return {
    name: String(body.name || "").trim().replace(/\s+/g, " "),
    username: String(body.username || "").trim().toLowerCase(),
    role: roles.includes(body.role) ? body.role : "CASHIER",
    active: body.active !== false,
    password: String(body.password || ""),
    accountType: accountType === "EMPLOYEE" ? "EMPLOYEE" : "GENERAL",
    employeeId: String(body.employeeId || "").trim(),
  };
}

async function normalizeEmployeeAccount(data, currentUserId) {
  if (data.accountType !== "EMPLOYEE") {
    return { ...data, employeeId: null };
  }

  if (!data.employeeId) {
    return { error: NextResponse.json({ success: false, error: "Employee is required for employee accounts" }, { status: 400 }) };
  }

  const employee = await prisma.employee.findUnique({ where: { id: data.employeeId } });
  if (!employee) {
    return { error: NextResponse.json({ success: false, error: "Employee not found" }, { status: 404 }) };
  }

  const existingUser = await prisma.user.findFirst({
    where: {
      employeeId: data.employeeId,
      ...(currentUserId ? { NOT: { id: currentUserId } } : {}),
    },
    select: { id: true, username: true },
  });

  if (existingUser) {
    return { error: NextResponse.json({ success: false, error: "This employee already has a login user" }, { status: 409 }) };
  }

  return {
    ...data,
    name: data.name || employee.name,
    employeeId: employee.id,
  };
}

export async function GET() {
  const { error } = await authorizeApi("USER_MANAGE");
  if (error) return error;

  const users = await prisma.user.findMany({
    orderBy: [{ active: "desc" }, { role: "asc" }, { name: "asc" }],
    include: { employee: true },
  });

  return NextResponse.json(users.map(serializeUser));
}

export async function POST(request) {
  const { user, error } = await authorizeApi("USER_MANAGE");
  if (error) return error;

  const body = await request.json();
  const normalized = await normalizeEmployeeAccount(userPayload(body));
  if (normalized.error) return normalized.error;
  const data = normalized;

  if (!data.name || !data.username || data.password.length < 6) {
    return NextResponse.json({ success: false, error: "Name, username, and password are required" }, { status: 400 });
  }

  const password = await bcrypt.hash(data.password, 12);
  const createdUser = await prisma.user.create({
    data: {
      name: data.name,
      username: data.username,
      password,
      role: data.role,
      active: data.active,
      employeeId: data.employeeId,
    },
    include: { employee: true },
  });

  await writeAudit({
    action: "USER_CREATED",
    user,
    summary: `Created user ${createdUser.username}`,
    metadata: { userId: createdUser.id, role: createdUser.role, employeeId: createdUser.employeeId },
  });

  return NextResponse.json({ success: true, user: serializeUser(createdUser) });
}

export async function PATCH(request) {
  const { user, error } = await authorizeApi("USER_MANAGE");
  if (error) return error;

  const body = await request.json();
  const id = String(body.id || "");
  const normalized = await normalizeEmployeeAccount(userPayload(body), id);
  if (normalized.error) return normalized.error;
  const data = normalized;

  if (!id) {
    return NextResponse.json({ success: false, error: "User id is required" }, { status: 400 });
  }

  if (!data.name || !data.username) {
    return NextResponse.json({ success: false, error: "Name and username are required" }, { status: 400 });
  }

  const updateData = {
    name: data.name,
    username: data.username,
    role: data.role,
    active: data.active,
    employeeId: data.employeeId,
  };

  if (data.password) {
    if (data.password.length < 6) {
      return NextResponse.json({ success: false, error: "Password must be at least 6 characters" }, { status: 400 });
    }
    updateData.password = await bcrypt.hash(data.password, 12);
  }

  const updatedUser = await prisma.user.update({
    where: { id },
    data: updateData,
    include: { employee: true },
  });

  await writeAudit({
    action: "USER_UPDATED",
    user,
    summary: `Updated user ${updatedUser.username}`,
    metadata: { userId: updatedUser.id, role: updatedUser.role, active: updatedUser.active, employeeId: updatedUser.employeeId },
  });

  return NextResponse.json({ success: true, user: serializeUser(updatedUser) });
}
