import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authorizeApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import {
  LoyaltyError,
  changePoints,
  ensureLoyaltyAccount,
  findLoyaltyAccount,
  serializeLoyaltyAccount,
} from "@/lib/loyalty";

function errorResponse(error) {
  if (error instanceof LoyaltyError) {
    return NextResponse.json({ success: false, error: error.message, code: error.code }, { status: error.status });
  }
  throw error;
}

export async function GET(request) {
  const { error } = await authorizeApi("ORDER_READ");
  if (error) return error;
  const { searchParams } = new URL(request.url);
  const lookup = searchParams.get("lookup") || searchParams.get("customerId") || searchParams.get("cardSerial") || searchParams.get("phone");
  const account = await findLoyaltyAccount(prisma, lookup, {
    transactions: { orderBy: { createdAt: "desc" }, take: 50 },
    redemptions: { include: { reward: true }, orderBy: { createdAt: "desc" }, take: 25 },
  });
  return NextResponse.json({ success: true, account: serializeLoyaltyAccount(account), customer: account?.customer || null });
}

export async function POST(request) {
  const { user, error } = await authorizeApi("LOYALTY_MANAGE");
  if (error) return error;
  const body = await request.json().catch(() => ({}));
  const action = String(body.action || "ISSUE").toUpperCase();

  try {
    const result = await prisma.$transaction(async (tx) => {
      if (action === "ISSUE") {
        const customer = await tx.customer.findUnique({ where: { id: String(body.customerId || "") } });
        if (!customer) throw new LoyaltyError("Customer not found", 404, "CUSTOMER_NOT_FOUND");
        return ensureLoyaltyAccount(tx, customer.id, body.cardSerial);
      }

      if (action === "ADJUST") {
        const account = await findLoyaltyAccount(tx, body.accountId || body.lookup);
        if (!account) throw new LoyaltyError("Loyalty account not found", 404, "ACCOUNT_NOT_FOUND");
        await changePoints(tx, {
          accountId: account.id,
          walletType: body.walletType,
          points: body.points,
          type: "ADJUST",
          actor: user,
          reason: String(body.reason || "Manager adjustment").trim(),
          idempotencyKey: body.idempotencyKey || null,
        });
        return tx.loyaltyAccount.findUnique({ where: { id: account.id } });
      }

      if (action === "SET_STATUS") {
        const account = await findLoyaltyAccount(tx, body.accountId || body.lookup);
        if (!account) throw new LoyaltyError("Loyalty account not found", 404, "ACCOUNT_NOT_FOUND");
        return tx.loyaltyAccount.update({ where: { id: account.id }, data: { active: body.active !== false } });
      }

      throw new LoyaltyError("Unsupported loyalty action");
    });

    await writeAudit({
      action: `LOYALTY_${action}`,
      user,
      summary: `${action} loyalty account ${result.cardSerial}`,
      metadata: { accountId: result.id, customerId: result.customerId, body: { ...body, cardSerial: undefined } },
    });
    return NextResponse.json({ success: true, account: serializeLoyaltyAccount(result) });
  } catch (loyaltyError) {
    return errorResponse(loyaltyError);
  }
}
