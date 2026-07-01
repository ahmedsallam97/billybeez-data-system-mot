const { prisma } = require("./db");

const TIME_ZONE = "Africa/Cairo";
const OPEN_HOUR = 7;
const CLOSE_HOUR = 1;

function cairoParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  return Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, Number(part.value)]));
}

function dateString(parts) {
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

function addDays(day, delta) {
  const date = new Date(`${day}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}

function getBusinessState(now = new Date()) {
  const parts = cairoParts(now);
  const today = dateString(parts);

  if (parts.hour < CLOSE_HOUR) {
    return {
      isOpen: true,
      businessDate: addDays(today, -1),
      label: "Late shift",
      message: "Business day is open",
    };
  }

  if (parts.hour >= OPEN_HOUR) {
    return {
      isOpen: true,
      businessDate: today,
      label: "Open",
      message: "Business day is open",
    };
  }

  return {
    isOpen: false,
    businessDate: null,
    label: "Closed",
    message: "Business hours are from 7:00 AM to 1:00 AM",
  };
}

function businessDateFor(date = new Date()) {
  return getBusinessState(date).businessDate || addDays(dateString(cairoParts(date)), -1);
}

function safeItems(order) {
  return JSON.stringify((order.items || []).map((item) => ({
    id: item.id,
    productId: item.productId,
    name: item.name,
    qty: item.qty,
    price: item.price,
    total: item.total,
  })));
}

async function closeOrdersToHistory(orders, now = new Date(), actor = null) {
  if (!orders.length) return { closedOrderCount: 0, closedBusinessDates: [] };

  const closedBusinessDates = new Set();

  await prisma.$transaction(async (tx) => {
    for (const order of orders) {
      const businessDate = order.businessDate || businessDateFor(order.createdAt);
      const systemArchivedAt = order.archivedAt || now;
      const geideaRegisteredAt = order.geideaRegisteredAt || null;
      closedBusinessDates.add(businessDate);

      await tx.orderHistory.upsert({
        where: { originalOrderId: order.id },
        create: {
          originalOrderId: order.id,
          businessDate,
          braceletNo: order.braceletNo,
          customerPhone: order.customerPhone || null,
          childNames: order.childNames,
          childrenCount: order.childrenCount,
          total: order.total,
          status: "ARCHIVED",
          kitchenStatus: order.kitchenStatus,
          paymentStatus: order.paymentStatus,
          paymentMethod: order.paymentMethod,
          customerLeft: order.customerLeft,
          cashierName: order.cashier?.name || null,
          dataEmployeeName: order.dataEmployee?.name || null,
          deliveryEmployeeName: order.deliveryEmployee?.name || null,
          geideaEmployeeName: order.geideaEmployee?.name || null,
          paymentEmployeeName: order.paymentEmployee?.name || null,
          exitEmployeeName: order.exitEmployee?.name || null,
          geideaRegisteredAt,
          itemsJson: safeItems(order),
          orderCreatedAt: order.createdAt,
          orderUpdatedAt: order.updatedAt,
          archivedAt: systemArchivedAt,
          closedAt: now,
        },
        update: {
          businessDate,
          braceletNo: order.braceletNo,
          customerPhone: order.customerPhone || null,
          childNames: order.childNames,
          childrenCount: order.childrenCount,
          total: order.total,
          status: "ARCHIVED",
          kitchenStatus: order.kitchenStatus,
          paymentStatus: order.paymentStatus,
          paymentMethod: order.paymentMethod,
          customerLeft: order.customerLeft,
          cashierName: order.cashier?.name || null,
          dataEmployeeName: order.dataEmployee?.name || null,
          deliveryEmployeeName: order.deliveryEmployee?.name || null,
          geideaEmployeeName: order.geideaEmployee?.name || null,
          paymentEmployeeName: order.paymentEmployee?.name || null,
          exitEmployeeName: order.exitEmployee?.name || null,
          geideaRegisteredAt,
          itemsJson: safeItems(order),
          orderCreatedAt: order.createdAt,
          orderUpdatedAt: order.updatedAt,
          archivedAt: systemArchivedAt,
          closedAt: now,
        },
      });

      await tx.auditLog.create({
        data: {
          action: "ORDER_CLOSED_TO_HISTORY",
          orderId: order.id,
          orderReference: order.id,
          userId: actor?.id || null,
          summary: "Moved order to history",
          metadata: JSON.stringify({ businessDate, closedAt: now }),
        },
      });
    }

    await tx.order.deleteMany({
      where: { id: { in: orders.map((order) => order.id) } },
    });

    for (const businessDate of closedBusinessDates) {
      await reconcileBusinessDay(tx, businessDate, now);
    }
  });

  return {
    closedOrderCount: orders.length,
    closedBusinessDates: Array.from(closedBusinessDates),
  };
}

async function reconcileBusinessDay(client, businessDate, closedAt = new Date()) {
  const totals = await client.orderHistory.aggregate({
    where: { businessDate },
    _count: { _all: true },
    _sum: { total: true },
  });
  const closedOrderCount = totals._count._all;
  const closedTotal = Number(totals._sum.total) || 0;

  await client.businessDay.upsert({
    where: { businessDate },
    create: {
      businessDate,
      closedAt,
      closedOrderCount,
      closedTotal,
    },
    update: {
      closedAt,
      closedOrderCount,
      closedTotal,
    },
  });

  return { closedOrderCount, closedTotal };
}

async function ensureBusinessDayState(now = new Date()) {
  const today = dateString(cairoParts(now));
  let state = getBusinessState(now);

  if (!state.isOpen) {
    const manualDay = await prisma.businessDay.findUnique({ where: { businessDate: today } });

    if (manualDay?.openedAt && !manualDay.closedAt) {
      state = {
        isOpen: true,
        businessDate: today,
        label: "Manual open",
        message: "Business day is manually open",
      };
    } else if (manualDay?.closedAt) {
      state = {
        isOpen: false,
        businessDate: today,
        label: "Closed",
        message: "Business day is manually closed",
        manualClosed: true,
      };
    }
  }

  if (state.businessDate) {
    const currentDay = await prisma.businessDay.findUnique({ where: { businessDate: state.businessDate } });

    if (currentDay?.closedAt) {
      return {
        ...state,
        closedOrderCount: currentDay.closedOrderCount || 0,
        closedBusinessDates: [],
        isOpen: false,
        label: "Closed",
        message: "Business day is manually closed",
        manualClosed: true,
      };
    }
  }

  if (state.businessDate) {
    await prisma.businessDay.upsert({
      where: { businessDate: state.businessDate },
      create: {
        businessDate: state.businessDate,
        openedAt: now,
      },
      update: {},
    });
  }

  return {
    ...state,
    closedOrderCount: 0,
    closedBusinessDates: [],
  };
}

async function openBusinessDay(now = new Date()) {
  const baseState = getBusinessState(now);
  const businessDate = baseState.businessDate || dateString(cairoParts(now));

  await prisma.businessDay.upsert({
    where: { businessDate },
    create: {
      businessDate,
      openedAt: now,
      closedAt: null,
      closedOrderCount: 0,
      closedTotal: 0,
    },
    update: {
      openedAt: now,
      closedAt: null,
    },
  });

  return ensureBusinessDayState(now);
}

async function closeActiveBusinessDay(now = new Date(), actor = null) {
  const state = await ensureBusinessDayState(now);
  const businessDate = state.businessDate || businessDateFor(now);
  const candidateOrders = await prisma.order.findMany({
    where: {
      OR: [
        { businessDate },
        { businessDate: null },
      ],
    },
    include: {
      cashier: true,
      dataEmployee: true,
      deliveryEmployee: true,
      geideaEmployee: true,
      paymentEmployee: true,
      exitEmployee: true,
      items: {
        orderBy: { createdAt: "asc" },
      },
    },
    orderBy: { createdAt: "asc" },
  });
  const orders = candidateOrders.filter((order) => (
    order.businessDate === businessDate
    || (!order.businessDate && businessDateFor(order.createdAt) === businessDate)
  ));
  const registeredOrders = orders.filter((order) => order.geideaRegisteredAt);
  const pendingGeideaOrders = orders.filter((order) => !order.geideaRegisteredAt);
  const closeResult = await closeOrdersToHistory(registeredOrders, now, actor);
  const totals = await reconcileBusinessDay(prisma, businessDate, now);

  return {
    ...state,
    ...closeResult,
    ...totals,
    pendingGeideaOrderCount: pendingGeideaOrders.length,
    isOpen: false,
    businessDate,
    label: "Closed",
    message: "Business day manually closed",
    manualClosed: true,
  };
}

function serializeHistoryOrder(order) {
  let items = [];

  try {
    items = JSON.parse(order.itemsJson || "[]");
  } catch {
    items = [];
  }

  return {
    id: order.originalOrderId,
    originalOrderId: order.originalOrderId,
    businessDate: order.businessDate,
    braceletNo: order.braceletNo,
    customerPhone: order.customerPhone || "",
    childNames: order.childNames,
    childrenCount: order.childrenCount,
    total: order.total,
    status: order.status,
    kitchenStatus: order.kitchenStatus,
    paymentStatus: order.paymentStatus,
    paymentMethod: order.paymentMethod,
    customerLeft: order.customerLeft,
    geideaRegisteredAt: order.geideaRegisteredAt,
    archivedAt: order.archivedAt,
    closedAt: order.closedAt,
    createdAt: order.orderCreatedAt,
    updatedAt: order.orderUpdatedAt,
    cashier: order.cashierName || "",
    dataEmployee: order.dataEmployeeName || "",
    deliveryEmployee: order.deliveryEmployeeName || "",
    geideaEmployee: order.geideaEmployeeName || "",
    paymentEmployee: order.paymentEmployeeName || "",
    exitEmployee: order.exitEmployeeName || "",
    items,
    isHistory: true,
  };
}

module.exports = {
  businessDateFor,
  closeActiveBusinessDay,
  ensureBusinessDayState,
  getBusinessState,
  openBusinessDay,
  serializeHistoryOrder,
};
