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
    createdAt: user.createdAt,
  };
}

function userPayload(body) {
  return {
    name: String(body.name || "").trim().replace(/\s+/g, " "),
    username: String(body.username || "").trim().toLowerCase(),
    role: roles.includes(body.role) ? body.role : "CASHIER",
    active: body.active !== false,
    password: String(body.password || ""),
  };
}

export async function GET() {
  const { error } = await authorizeApi("USER_MANAGE");
  if (error) return error;

  const users = await prisma.user.findMany({
    orderBy: [{ active: "desc" }, { role: "asc" }, { name: "asc" }],
  });

  return NextResponse.json(users.map(serializeUser));
}

export async function POST(request) {
  const { user, error } = await authorizeApi("USER_MANAGE");
  if (error) return error;

  const body = await request.json();
  const data = userPayload(body);

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
    },
  });

  await writeAudit({
    action: "USER_CREATED",
    user,
    summary: `Created user ${createdUser.username}`,
    metadata: { userId: createdUser.id, role: createdUser.role },
  });

  return NextResponse.json({ success: true, user: serializeUser(createdUser) });
}

export async function PATCH(request) {
  const { user, error } = await authorizeApi("USER_MANAGE");
  if (error) return error;

  const body = await request.json();
  const id = String(body.id || "");
  const data = userPayload(body);

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
  });

  await writeAudit({
    action: "USER_UPDATED",
    user,
    summary: `Updated user ${updatedUser.username}`,
    metadata: { userId: updatedUser.id, role: updatedUser.role, active: updatedUser.active },
  });

  return NextResponse.json({ success: true, user: serializeUser(updatedUser) });
}
