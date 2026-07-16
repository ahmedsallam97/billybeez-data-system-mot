import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authorizeApi } from "@/lib/api-auth";

function serializeDate(value) {
  return value ? value.toISOString() : null;
}

function ageFromBirthDate(value) {
  if (!value) return "";
  const now = new Date();
  let age = now.getUTCFullYear() - value.getUTCFullYear();
  if (
    now.getUTCMonth() < value.getUTCMonth()
    || (now.getUTCMonth() === value.getUTCMonth() && now.getUTCDate() < value.getUTCDate())
  ) age -= 1;
  return age >= 0 ? age : "";
}

function csvValue(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function uniqueChildren(children) {
  const seen = new Set();
  return children.filter((child) => {
    const key = `${child.name}|${child.birthDate ? child.birthDate.toISOString().slice(0, 10) : ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function serializeCustomer(customer, totalSpend = 0) {
  const lastOrder = customer.orders?.[0] || null;
  const children = uniqueChildren(customer.children || []);
  return {
    id: customer.id,
    name: customer.name,
    phone: customer.phone || "",
    comments: customer.comments || "",
    totalSpend,
    loyalty: customer.loyaltyAccount ? {
      id: customer.loyaltyAccount.id,
      cardSerial: customer.loyaltyAccount.cardSerial,
      active: customer.loyaltyAccount.active,
      entrancePoints: customer.loyaltyAccount.entrancePoints,
      restaurantPoints: customer.loyaltyAccount.restaurantPoints,
      issuedAt: serializeDate(customer.loyaltyAccount.issuedAt),
      expiresAt: serializeDate(customer.loyaltyAccount.expiresAt),
      transactions: (customer.loyaltyAccount.transactions || []).map((transaction) => ({
        id: transaction.id,
        walletType: transaction.walletType,
        type: transaction.type,
        points: transaction.points,
        balanceAfter: transaction.balanceAfter,
        reason: transaction.reason || "",
        createdAt: serializeDate(transaction.createdAt),
      })),
    } : null,
    visits: customer._count?.orders || customer.orders?.length || 0,
    lastOrderAt: serializeDate(lastOrder?.createdAt || customer.updatedAt),
    recentOrders: (customer.orders || []).map((order) => ({
      id: order.id,
      invoiceSerial: order.invoiceSerial || "",
      braceletNo: order.braceletNo,
      childNames: order.childNames,
      total: order.total,
      paymentMethod: order.paymentMethod,
      createdAt: serializeDate(order.createdAt),
    })),
    children: children.map((child) => ({
      id: child.id,
      name: child.name,
      birthDate: serializeDate(child.birthDate),
      age: ageFromBirthDate(child.birthDate),
      comments: child.comments || "",
      allowOpenCharges: child.allowOpenCharges,
    })),
  };
}

export async function GET(request) {
  const { user, error } = await authorizeApi("ORDER_READ");
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const phone = String(searchParams.get("phone") || "").trim();
  const query = String(searchParams.get("q") || "").trim();
  const exportMode = searchParams.get("export");
  const canExport = ["ADMIN", "MANAGER"].includes(user.role);

  if (exportMode && !canExport) {
    return NextResponse.json({ success: false, error: "Manager permission required" }, { status: 403 });
  }

  const search = phone || query;
  const where = search ? {
    OR: [
      { phone: { contains: search } },
      { name: { contains: search } },
      { children: { some: { name: { contains: search } } } },
    ],
  } : {};

  const customers = await prisma.customer.findMany({
    where,
    include: {
      children: { orderBy: { createdAt: "desc" } },
      orders: { orderBy: { createdAt: "desc" }, take: 5 },
      loyaltyAccount: {
        include: { transactions: { orderBy: { createdAt: "desc" }, take: 10 } },
      },
      _count: { select: { orders: true } },
    },
    orderBy: { updatedAt: "desc" },
    take: exportMode ? 2000 : 50,
  });

  const spendRows = customers.length ? await prisma.order.groupBy({
    by: ["customerId"],
    where: { customerId: { in: customers.map((customer) => customer.id) }, paymentStatus: "PAID" },
    _sum: { total: true },
  }) : [];
  const spendMap = new Map(spendRows.map((row) => [row.customerId, Number(row._sum.total || 0)]));
  const serialized = customers.map((customer) => serializeCustomer(customer, spendMap.get(customer.id) || 0));

  if (exportMode === "csv") {
    const rows = [["Customer", "Phone", "Visits", "Last order", "Child", "Birth date", "Age", "Child comments", "Customer comments"]];
    serialized.forEach((customer) => {
      const children = customer.children.length ? customer.children : [{ name: "", birthDate: "", age: "", comments: "" }];
      children.forEach((child) => {
        rows.push([
          customer.name,
          customer.phone,
          customer.visits,
          customer.lastOrderAt || "",
          child.name,
          child.birthDate ? child.birthDate.slice(0, 10) : "",
          child.age,
          child.comments,
          customer.comments,
        ]);
      });
    });
    return new NextResponse(rows.map((row) => row.map(csvValue).join(",")).join("\n"), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="billybeez-customers-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  }

  return NextResponse.json({ customers: serialized });
}
