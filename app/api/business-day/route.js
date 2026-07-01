import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { authorizeApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { closeActiveBusinessDay, ensureBusinessDayState, openBusinessDay } from "@/lib/business-day";
import { getSetting } from "@/lib/settings";

async function validBusinessDayPassword(value) {
  const expected = Buffer.from(await getSetting("BUSINESS_DAY_PASSWORD", process.env.BUSINESS_DAY_PASSWORD || ""));
  const received = Buffer.from(String(value || ""));

  return expected.length > 0
    && expected.length === received.length
    && timingSafeEqual(expected, received);
}

export async function GET() {
  const { error } = await authorizeApi("BUSINESS_DAY_READ");
  if (error) return error;

  return NextResponse.json({ success: true, businessState: await ensureBusinessDayState() });
}

export async function POST(request) {
  const { user, error } = await authorizeApi("BUSINESS_DAY_WRITE");
  if (error) return error;

  const body = await request.json();
  const action = String(body.action || "").toLowerCase();
  const requiresPassword = user.role === "CASHIER" || user.role === "KITCHEN";

  if (requiresPassword && !(await validBusinessDayPassword(body.password))) {
    return NextResponse.json({ success: false, error: "Invalid business day password" }, { status: 403 });
  }

  if (!["open", "close"].includes(action)) {
    return NextResponse.json({ success: false, error: "Invalid business day action" }, { status: 400 });
  }

  const currentState = await ensureBusinessDayState();

  if (action === "open" && currentState.isOpen) {
    return NextResponse.json({ success: true, businessState: currentState });
  }

  if (action === "close" && !currentState.isOpen) {
    return NextResponse.json({ success: false, error: "Business day is already closed" }, { status: 400 });
  }

  const businessState = action === "open"
    ? await openBusinessDay()
    : await closeActiveBusinessDay(new Date(), user);

  await writeAudit({
    action: action === "open" ? "BUSINESS_DAY_OPENED" : "BUSINESS_DAY_CLOSED",
    user,
    summary: action === "open" ? "Opened business day" : "Closed business day",
    metadata: {
      businessDate: businessState.businessDate,
      authorizedBy: user.name,
      authorizedRole: user.role,
      closedOrderCount: businessState.closedOrderCount || 0,
    },
    before: currentState,
    after: businessState,
    reason: `Manual business day ${action}`,
  });

  return NextResponse.json({ success: true, businessState });
}
