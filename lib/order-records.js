function actorFields(prefix, user, employee) {
  return {
    [`${prefix}ByUserId`]: user?.id || null,
    [`${prefix}ByUserName`]: user?.name || "",
    [`${prefix}ByEmployeeId`]: employee?.id || user?.employee?.id || user?.employeeId || null,
    [`${prefix}ByEmployeeName`]: employee?.name || user?.employee?.name || "",
  };
}

function orderRecordBase(order) {
  return {
    braceletNo: order.braceletNo,
    businessDate: order.businessDate || null,
    childNames: order.childNames || "",
    orderTotal: Number(order.total) || 0,
    archivedAt: order.archivedAt || null,
  };
}

async function upsertOrderRecord(client, order, fields = {}) {
  if (!order?.id) return null;

  const base = orderRecordBase(order);

  return client.orderTransactionRecord.upsert({
    where: { orderId: order.id },
    create: {
      orderId: order.id,
      ...base,
      ...fields,
    },
    update: {
      ...base,
      ...fields,
    },
  });
}

function serializeOrderRecord(record) {
  return {
    id: record.id,
    orderId: record.orderId,
    businessDate: record.businessDate,
    braceletNo: record.braceletNo,
    childNames: record.childNames || "",
    orderTotal: record.orderTotal,
    orderCreatedAt: record.orderCreatedAt,
    orderCreatedByUserName: record.orderCreatedByUserName || "",
    orderCreatedByEmployeeName: record.orderCreatedByEmployeeName || "",
    preparationStartedAt: record.preparationStartedAt,
    preparationStartedByUserName: record.preparationStartedByUserName || "",
    preparationStartedByEmployeeName: record.preparationStartedByEmployeeName || "",
    deliveredAt: record.deliveredAt,
    deliveredByUserName: record.deliveredByUserName || "",
    deliveredByEmployeeName: record.deliveredByEmployeeName || "",
    paidAt: record.paidAt,
    paymentMethod: record.paymentMethod || "",
    paidByUserName: record.paidByUserName || "",
    paidByEmployeeName: record.paidByEmployeeName || "",
    geideaRegisteredAt: record.geideaRegisteredAt,
    geideaByUserName: record.geideaByUserName || "",
    geideaByEmployeeName: record.geideaByEmployeeName || "",
    customerLeftAt: record.customerLeftAt,
    customerLeftByUserName: record.customerLeftByUserName || "",
    customerLeftByEmployeeName: record.customerLeftByEmployeeName || "",
    archivedAt: record.archivedAt,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

module.exports = {
  actorFields,
  serializeOrderRecord,
  upsertOrderRecord,
};
