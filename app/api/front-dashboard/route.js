import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authorizeApi } from "@/lib/api-auth";
import { ensureBusinessDayState } from "@/lib/business-day";
import { getSetting } from "@/lib/settings";

function enabled(value, fallback = true) {
  if (value === undefined || value === null || value === "") return fallback;
  return ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
}

function orderMatches(order, terms) {
  return (order.items || []).some((item) => {
    const text = `${item.name || ""} ${item.product?.category?.name || ""}`.toLowerCase();
    return terms.some((term) => text.includes(term));
  });
}

export async function GET() {
  const { error } = await authorizeApi("ORDER_READ");
  if (error) return error;

  const businessState = await ensureBusinessDayState();
  const [orders, dailyTarget, showChildren, showCustomers, showTrips, showBirthdays, showTarget] = await Promise.all([
    prisma.order.findMany({
      where: {
        businessDate: businessState.businessDate,
        device: { is: { type: "FRONT" } },
      },
      include: {
        items: {
          include: {
            product: { include: { category: true } },
          },
        },
      },
    }),
    getSetting("FRONT_DASHBOARD_DAILY_TARGET", "10000"),
    getSetting("FRONT_DASHBOARD_SHOW_CHILDREN", "true"),
    getSetting("FRONT_DASHBOARD_SHOW_CUSTOMERS", "true"),
    getSetting("FRONT_DASHBOARD_SHOW_TRIPS", "true"),
    getSetting("FRONT_DASHBOARD_SHOW_BIRTHDAYS", "true"),
    getSetting("FRONT_DASHBOARD_SHOW_TARGET", "true"),
  ]);

  const activeOrders = orders.filter((order) => !order.archivedAt && !order.customerLeft);
  const customerKeys = new Set(activeOrders.map((order) => order.customerId || order.customerPhone || order.id));
  const paidSales = orders
    .filter((order) => order.paymentStatus === "PAID")
    .reduce((sum, order) => sum + Number(order.total || 0), 0);
  const target = Math.max(0, Number(dailyTarget) || 0);

  return NextResponse.json({
    success: true,
    businessDate: businessState.businessDate,
    children: activeOrders.reduce((sum, order) => sum + Number(order.childrenCount || 0), 0),
    customers: customerKeys.size,
    trips: activeOrders.filter((order) => orderMatches(order, ["trip", "رحل"])).length,
    birthdays: activeOrders.filter((order) => orderMatches(order, ["birthday", "ميلاد"])).length,
    paidSales,
    dailyTarget: target,
    targetPercent: target > 0 ? Math.min(999, Math.round((paidSales / target) * 100)) : 0,
    visibility: {
      children: enabled(showChildren),
      customers: enabled(showCustomers),
      trips: enabled(showTrips),
      birthdays: enabled(showBirthdays),
      target: enabled(showTarget),
    },
  });
}
