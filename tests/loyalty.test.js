const test = require("node:test");
const assert = require("node:assert/strict");
const { LoyaltyError, changePoints, normalizeWalletType } = require("../lib/loyalty");

function loyaltyTx(startingBalance = 100) {
  const state = {
    account: { id: "account-1", active: true, entrancePoints: startingBalance, restaurantPoints: 0 },
    transactions: [],
  };
  return {
    state,
    loyaltyTransaction: {
      findUnique: async () => null,
      create: async ({ data }) => {
        const row = { id: `tx-${state.transactions.length + 1}`, ...data };
        state.transactions.push(row);
        return row;
      },
    },
    loyaltyAccount: {
      findUnique: async () => ({ ...state.account }),
      update: async ({ data }) => {
        Object.assign(state.account, data);
        return { ...state.account };
      },
    },
  };
}

test("loyalty wallet names are normalized", () => {
  assert.equal(normalizeWalletType("entrance"), "ENTRANCE");
  assert.equal(normalizeWalletType("RESTAURANT"), "RESTAURANT");
  assert.throws(() => normalizeWalletType("other"), LoyaltyError);
});

test("loyalty redemption updates the balance and immutable ledger", async () => {
  const tx = loyaltyTx(100);
  const result = await changePoints(tx, {
    accountId: "account-1",
    walletType: "ENTRANCE",
    points: -40,
    type: "REDEEM",
    idempotencyKey: "redeem-1",
  });
  assert.equal(result.balanceAfter, 60);
  assert.equal(tx.state.account.entrancePoints, 60);
  assert.equal(tx.state.transactions[0].points, -40);
  assert.equal(tx.state.transactions[0].balanceBefore, 100);
  assert.equal(tx.state.transactions[0].balanceAfter, 60);
});

test("loyalty cannot produce a negative balance", async () => {
  const tx = loyaltyTx(25);
  await assert.rejects(
    changePoints(tx, { accountId: "account-1", walletType: "ENTRANCE", points: -30, type: "REDEEM" }),
    (error) => error instanceof LoyaltyError && error.code === "INSUFFICIENT_POINTS",
  );
  assert.equal(tx.state.account.entrancePoints, 25);
  assert.equal(tx.state.transactions.length, 0);
});
