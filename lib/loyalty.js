const WALLET_FIELDS = {
  ENTRANCE: "entrancePoints",
  RESTAURANT: "restaurantPoints",
};

class LoyaltyError extends Error {
  constructor(message, status = 400, code = "LOYALTY_ERROR") {
    super(message);
    this.name = "LoyaltyError";
    this.status = status;
    this.code = code;
  }
}

function normalizeWalletType(value) {
  const walletType = String(value || "").trim().toUpperCase();
  if (!WALLET_FIELDS[walletType]) throw new LoyaltyError("Invalid loyalty wallet type");
  return walletType;
}

function walletField(walletType) {
  return WALLET_FIELDS[normalizeWalletType(walletType)];
}

function serializeLoyaltyAccount(account) {
  if (!account) return null;
  return {
    id: account.id,
    customerId: account.customerId,
    cardSerial: account.cardSerial,
    active: account.active,
    entrancePoints: account.entrancePoints,
    restaurantPoints: account.restaurantPoints,
    issuedAt: account.issuedAt,
    expiresAt: account.expiresAt,
    transactions: account.transactions || [],
    redemptions: account.redemptions || [],
  };
}

async function generateCardSerial(tx) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const serial = `88${Math.floor(1000000000 + Math.random() * 9000000000)}`;
    const exists = await tx.loyaltyAccount.findUnique({ where: { cardSerial: serial }, select: { id: true } });
    if (!exists) return serial;
  }
  throw new LoyaltyError("Could not generate a unique loyalty card", 500, "CARD_SERIAL_FAILED");
}

async function ensureLoyaltyAccount(tx, customerId, requestedSerial = "") {
  if (!customerId) throw new LoyaltyError("Customer is required for loyalty");
  const existing = await tx.loyaltyAccount.findUnique({ where: { customerId } });
  if (existing) return existing;

  const cardSerial = String(requestedSerial || "").trim() || await generateCardSerial(tx);
  const serialOwner = await tx.loyaltyAccount.findUnique({ where: { cardSerial }, select: { id: true } });
  if (serialOwner) throw new LoyaltyError("Loyalty card serial is already used", 409, "CARD_SERIAL_EXISTS");

  return tx.loyaltyAccount.create({ data: { customerId, cardSerial } });
}

async function findLoyaltyAccount(tx, lookup, include = {}) {
  const value = String(lookup || "").trim();
  if (!value) return null;
  return tx.loyaltyAccount.findFirst({
    where: {
      OR: [
        { id: value },
        { customerId: value },
        { cardSerial: value },
        { customer: { is: { phone: value } } },
      ],
    },
    include: { customer: true, ...include },
  });
}

async function changePoints(tx, {
  accountId,
  walletType,
  points,
  type,
  orderId = null,
  rewardId = null,
  actor = null,
  reason = null,
  idempotencyKey = null,
}) {
  const normalizedWallet = normalizeWalletType(walletType);
  const field = walletField(normalizedWallet);
  const delta = Math.trunc(Number(points || 0));
  if (!delta) throw new LoyaltyError("Points value cannot be zero");

  if (idempotencyKey) {
    const existing = await tx.loyaltyTransaction.findUnique({ where: { idempotencyKey } });
    if (existing) return { transaction: existing, duplicate: true };
  }

  const account = await tx.loyaltyAccount.findUnique({ where: { id: accountId } });
  if (!account || !account.active) throw new LoyaltyError("Active loyalty account not found", 404, "ACCOUNT_NOT_FOUND");
  const balanceBefore = Number(account[field] || 0);
  const balanceAfter = balanceBefore + delta;
  if (balanceAfter < 0) throw new LoyaltyError("Insufficient loyalty points", 409, "INSUFFICIENT_POINTS");

  await tx.loyaltyAccount.update({ where: { id: account.id }, data: { [field]: balanceAfter } });
  const transaction = await tx.loyaltyTransaction.create({
    data: {
      accountId: account.id,
      walletType: normalizedWallet,
      type: String(type || (delta > 0 ? "EARN" : "REDEEM")).toUpperCase(),
      points: delta,
      balanceBefore,
      balanceAfter,
      orderId,
      rewardId,
      actorUserId: actor?.id || null,
      actorName: actor?.employee?.name || actor?.name || null,
      reason,
      idempotencyKey,
    },
  });
  return { transaction, duplicate: false, balanceAfter };
}

function orderWalletType(order) {
  const departments = new Set((order.items || []).map((item) => item.product?.department).filter(Boolean));
  return departments.size && [...departments].every((department) => department === "ENTRANCE")
    ? "ENTRANCE"
    : "RESTAURANT";
}

async function earnOrderPoints(tx, order, actor, options = {}) {
  if (!order?.customerId || order.paymentMethod === "CUSTOM_1") return null;
  const walletType = orderWalletType(order);
  const points = walletType === "ENTRANCE"
    ? Math.max(0, Math.trunc(Number(options.entrancePointsPerVisit ?? 10)))
    : Math.max(0, Math.floor(Number(order.total || 0) * Number(options.restaurantPointsPerEgp ?? 1)));
  if (!points) return null;
  const account = await ensureLoyaltyAccount(tx, order.customerId);
  return changePoints(tx, {
    accountId: account.id,
    walletType,
    points,
    type: "EARN",
    orderId: order.id,
    actor,
    reason: walletType === "ENTRANCE" ? "Paid entrance visit" : "Paid restaurant purchase",
    idempotencyKey: `ORDER_EARN:${order.id}:${walletType}`,
  });
}

async function redeemOrderWithPoints(tx, { order, account, actor, pointsPerEgp = 1 }) {
  if (!account?.active) throw new LoyaltyError("Active loyalty account not found", 404, "ACCOUNT_NOT_FOUND");
  const walletType = orderWalletType(order);
  const pointsUsed = Math.max(1, Math.ceil(Number(order.total || 0) * Number(pointsPerEgp || 1)));
  const result = await changePoints(tx, {
    accountId: account.id,
    walletType,
    points: -pointsUsed,
    type: "REDEEM",
    orderId: order.id,
    actor,
    reason: `Paid order ${order.id} with loyalty points`,
    idempotencyKey: `ORDER_REDEEM:${order.id}:${walletType}`,
  });
  await tx.loyaltyRedemption.create({
    data: {
      accountId: account.id,
      orderId: order.id,
      walletType,
      pointsUsed,
      discountValue: Number(order.total || 0),
      reference: order.invoiceSerial || order.id,
    },
  });
  return { ...result, walletType, pointsUsed };
}

module.exports = {
  LoyaltyError,
  changePoints,
  earnOrderPoints,
  ensureLoyaltyAccount,
  findLoyaltyAccount,
  normalizeWalletType,
  orderWalletType,
  redeemOrderWithPoints,
  serializeLoyaltyAccount,
};
