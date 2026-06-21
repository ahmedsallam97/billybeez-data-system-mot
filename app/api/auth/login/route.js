import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { setCurrentUser } from "@/lib/auth";
import { getRoleHome } from "@/lib/roles";

export async function POST(request) {
  const body = await request.json();
  const username = String(body.username || "").trim();
  const password = String(body.password || "");

  const user = await prisma.user.findFirst({
    where: { username, password, active: true },
  });

  if (!user) {
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
    },
    home: getRoleHome(user.role),
  });
}
