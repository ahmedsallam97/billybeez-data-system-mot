import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { setCurrentUser } from "@/lib/auth";
import { getRoleHome } from "@/lib/roles";

const DUMMY_PASSWORD_HASH = "$2b$12$yXEMc/F1Q6xYPDuZJf1R0eKcO4nroFtg6rRhJ03zyp5zjJQ2q4YjK";

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const username = String(body.username || "").trim();
  const password = String(body.password || "");

  if (!username || !password || username.length > 80 || password.length > 200) {
    return NextResponse.json({ success: false, error: "Invalid username or password" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { username },
    include: { employee: true },
  });
  const passwordMatches = await bcrypt.compare(password, user?.password || DUMMY_PASSWORD_HASH);

  if (!user?.active || !passwordMatches) {
    return NextResponse.json({ success: false, error: "Invalid username or password" }, { status: 401 });
  }

  await setCurrentUser(user);

  return NextResponse.json({
    success: true,
    user: {
      id: user.id,
      name: user.name,
      username: user.username,
      role: user.role,
      employeeId: user.employeeId || "",
      employeeName: user.employee?.name || "",
      employeeDepartment: user.employee?.department || "",
    },
    home: getRoleHome(user.role),
  });
}
