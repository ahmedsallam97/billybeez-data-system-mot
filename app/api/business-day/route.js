import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { closeActiveBusinessDay, ensureBusinessDayState, openBusinessDay } from "@/lib/business-day";

async function authorizePassword(password) {
  if (!password) return null;

  return prisma.user.findFirst({
    where: {
      active: true,
      password,
      role: { in: ["ADMIN", "MANAGER"] },
    },
  });
}

export async function GET() {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ success: false, error: "Login required" }, { status: 401 });
  }

  return NextResponse.json({ success: true, businessState: await ensureBusinessDayState() });
}

export async function POST(request) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ success: false, error: "Login required" }, { status: 401 });
  }

  const body = await request.json();
  const action = String(body.action || "").toLowerCase();
  const authorizedUser = await authorizePassword(String(body.password || ""));

  if (!authorizedUser) {
    return NextResponse.json({ success: false, error: "Manager password is required" }, { status: 403 });
  }

  if (!["open", "close"].includes(action)) {
    return NextResponse.json({ success: false, error: "Invalid business day action" }, { status: 400 });
  }

  const businessState = action === "open"
    ? await openBusinessDay()
    : await closeActiveBusinessDay();

  await writeAudit({
    action: action === "open" ? "BUSINESS_DAY_OPENED" : "BUSINESS_DAY_CLOSED",
    user,
    summary: action === "open" ? "Opened business day" : "Closed business day",
    metadata: {
      businessDate: businessState.businessDate,
      authorizedBy: authorizedUser.name,
      closedOrderCount: businessState.closedOrderCount || 0,
    },
  });

  return NextResponse.json({ success: true, businessState });
}
