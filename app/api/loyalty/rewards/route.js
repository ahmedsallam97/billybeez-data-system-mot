import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authorizeApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";

const walletTypes = new Set(["ENTRANCE", "RESTAURANT"]);
const rewardTypes = new Set(["PERCENT_DISCOUNT", "FIXED_DISCOUNT", "FREE_PRODUCT"]);

function rewardData(body) {
  const walletType = String(body.walletType || "ENTRANCE").toUpperCase();
  const rewardType = String(body.rewardType || "PERCENT_DISCOUNT").toUpperCase();
  return {
    name: String(body.name || "").trim(),
    nameEn: String(body.nameEn || "").trim() || null,
    walletType: walletTypes.has(walletType) ? walletType : "ENTRANCE",
    rewardType: rewardTypes.has(rewardType) ? rewardType : "PERCENT_DISCOUNT",
    pointsCost: Math.max(1, Math.trunc(Number(body.pointsCost || 1))),
    discountPercent: body.discountPercent === "" || body.discountPercent == null ? null : Math.max(0, Number(body.discountPercent)),
    discountAmount: body.discountAmount === "" || body.discountAmount == null ? null : Math.max(0, Number(body.discountAmount)),
    productId: String(body.productId || "").trim() || null,
    active: body.active !== false,
    sortOrder: Math.trunc(Number(body.sortOrder || 100)),
    availabilityRules: typeof body.availabilityRules === "string" ? body.availabilityRules : JSON.stringify(body.availabilityRules || {}),
  };
}

export async function GET() {
  const { error } = await authorizeApi("ORDER_READ");
  if (error) return error;
  const rewards = await prisma.loyaltyReward.findMany({ orderBy: [{ walletType: "asc" }, { sortOrder: "asc" }, { name: "asc" }] });
  return NextResponse.json({ success: true, rewards });
}

export async function POST(request) {
  const { user, error } = await authorizeApi("LOYALTY_MANAGE");
  if (error) return error;
  const body = await request.json().catch(() => ({}));
  const data = rewardData(body);
  if (!data.name) return NextResponse.json({ success: false, error: "Reward name is required" }, { status: 400 });
  const reward = await prisma.loyaltyReward.create({ data });
  await writeAudit({ action: "LOYALTY_REWARD_CREATED", user, summary: `Created loyalty reward ${reward.name}`, metadata: { rewardId: reward.id } });
  return NextResponse.json({ success: true, reward });
}

export async function PATCH(request) {
  const { user, error } = await authorizeApi("LOYALTY_MANAGE");
  if (error) return error;
  const body = await request.json().catch(() => ({}));
  const id = String(body.id || "").trim();
  if (!id) return NextResponse.json({ success: false, error: "Reward id is required" }, { status: 400 });
  const reward = await prisma.loyaltyReward.update({ where: { id }, data: rewardData(body) });
  await writeAudit({ action: "LOYALTY_REWARD_UPDATED", user, summary: `Updated loyalty reward ${reward.name}`, metadata: { rewardId: reward.id } });
  return NextResponse.json({ success: true, reward });
}
