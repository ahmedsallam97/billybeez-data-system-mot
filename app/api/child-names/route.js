import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authorizeApi } from "@/lib/api-auth";

function splitChildNames(value) {
  return String(value || "")
    .split(/[,\u060C]/)
    .map((name) => name.trim().replace(/\s+/g, " "))
    .filter(Boolean);
}

function normalizeName(value) {
  return String(value || "").trim().replace(/\s+/g, " ").toLocaleLowerCase("ar-EG");
}

export async function GET() {
  const { error } = await authorizeApi("ORDER_READ");
  if (error) return error;

  const [orders, history] = await Promise.all([
    prisma.order.findMany({
      select: { childNames: true },
      orderBy: { updatedAt: "desc" },
      take: 500,
    }),
    prisma.orderHistory.findMany({
      select: { childNames: true },
      orderBy: { createdAt: "desc" },
      take: 500,
    }),
  ]);

  const names = new Map();

  [...orders, ...history].forEach((row) => {
    splitChildNames(row.childNames).forEach((name) => {
      const key = normalizeName(name);
      if (!names.has(key)) names.set(key, name);
    });
  });

  return NextResponse.json({
    names: Array.from(names.values()).sort((a, b) => a.localeCompare(b, "ar-EG")).slice(0, 500),
  });
}
