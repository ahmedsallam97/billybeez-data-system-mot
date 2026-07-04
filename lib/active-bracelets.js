async function findActiveBraceletOrder(tx, braceletNo, excludeOrderId = null) {
  return tx.order.findFirst({
    where: {
      braceletNo,
      archivedAt: null,
      ...(excludeOrderId ? { NOT: { id: excludeOrderId } } : {}),
    },
    select: { id: true },
  });
}

async function assertActiveBraceletAvailable(tx, braceletNo, excludeOrderId = null) {
  const duplicate = await findActiveBraceletOrder(tx, braceletNo, excludeOrderId);
  if (!duplicate) return null;
  return {
    status: 409,
    message: `Bracelet ${braceletNo} already has an active order: ${duplicate.id}`,
    orderId: duplicate.id,
  };
}

async function claimActiveBracelet(tx, braceletNo, orderId) {
  await tx.activeBraceletLock.create({
    data: { braceletNo, orderId },
  });
}

async function moveActiveBracelet(tx, braceletNo, orderId) {
  await tx.activeBraceletLock.deleteMany({ where: { orderId } });
  await claimActiveBracelet(tx, braceletNo, orderId);
}

async function releaseActiveBracelet(tx, orderId) {
  await tx.activeBraceletLock.deleteMany({ where: { orderId } });
}

function isBraceletLockConflict(error) {
  return error?.code === "P2002" && String(error?.meta?.modelName || "").includes("ActiveBraceletLock");
}

module.exports = {
  assertActiveBraceletAvailable,
  claimActiveBracelet,
  findActiveBraceletOrder,
  isBraceletLockConflict,
  moveActiveBracelet,
  releaseActiveBracelet,
};
