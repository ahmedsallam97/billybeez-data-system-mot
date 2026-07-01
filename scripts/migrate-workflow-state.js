const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

function orderReferenceFromSummary(summary) {
  const match = String(summary || "").match(/\b(ORD(?:-|#)[A-Za-z0-9_-]+)\b/);
  return match?.[1] || null;
}

function isOrderAction(action) {
  return String(action || "").startsWith("ORDER_") || action === "CUSTOMER_LEFT";
}

async function migrateGeideaState() {
  const [orders, history] = await Promise.all([
    prisma.order.findMany({
      where: {
        geideaRegisteredAt: null,
        archivedAt: { not: null },
      },
      select: { id: true, archivedAt: true },
    }),
    prisma.orderHistory.findMany({
      where: {
        OR: [
          { geideaRegisteredAt: null },
          { archivedAt: null },
          { status: { not: "ARCHIVED" } },
        ],
      },
      select: {
        id: true,
        archivedAt: true,
        closedAt: true,
        geideaRegisteredAt: true,
      },
    }),
  ]);

  for (const order of orders) {
    await prisma.order.update({
      where: { id: order.id },
      data: { geideaRegisteredAt: order.archivedAt },
    });
  }

  for (const order of history) {
    await prisma.orderHistory.update({
      where: { id: order.id },
      data: {
        status: "ARCHIVED",
        geideaRegisteredAt: order.geideaRegisteredAt || order.archivedAt || order.closedAt,
        archivedAt: order.archivedAt || order.closedAt,
      },
    });
  }

  await prisma.orderHistory.updateMany({
    where: { status: { not: "ARCHIVED" } },
    data: { status: "ARCHIVED" },
  });

  return { orders: orders.length, history: history.length };
}

async function migrateAuditReferences() {
  const logs = await prisma.auditLog.findMany({ orderBy: { createdAt: "asc" } });
  let currentOrderReference = null;
  let updated = 0;

  for (const log of logs) {
    const parsedReference = orderReferenceFromSummary(log.summary);
    if (parsedReference) currentOrderReference = parsedReference;

    const orderReference = log.orderReference
      || log.orderId
      || (isOrderAction(log.action) ? currentOrderReference : null);

    if (orderReference && log.orderReference !== orderReference) {
      await prisma.auditLog.update({
        where: { id: log.id },
        data: { orderReference },
      });
      updated += 1;
    }
  }

  return updated;
}

async function reconcileBusinessDays() {
  const history = await prisma.orderHistory.findMany({
    select: {
      businessDate: true,
      total: true,
      closedAt: true,
    },
  });
  const totals = new Map();

  for (const order of history) {
    const current = totals.get(order.businessDate) || {
      count: 0,
      total: 0,
      closedAt: order.closedAt,
    };
    current.count += 1;
    current.total += Number(order.total) || 0;
    if (order.closedAt > current.closedAt) current.closedAt = order.closedAt;
    totals.set(order.businessDate, current);
  }

  for (const [businessDate, total] of totals.entries()) {
    await prisma.businessDay.upsert({
      where: { businessDate },
      create: {
        businessDate,
        closedAt: total.closedAt,
        closedOrderCount: total.count,
        closedTotal: total.total,
      },
      update: {
        closedAt: total.closedAt,
        closedOrderCount: total.count,
        closedTotal: total.total,
      },
    });
  }

  return totals.size;
}

async function main() {
  const geidea = await migrateGeideaState();
  const auditLogs = await migrateAuditReferences();
  const businessDays = await reconcileBusinessDays();

  console.log(JSON.stringify({ geidea, auditLogs, businessDays }));
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
