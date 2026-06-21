import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  const products = await prisma.product.findMany({
    where: { active: true },
    include: { category: true },
    orderBy: [{ popular: "desc" }, { sortOrder: "asc" }, { name: "asc" }],
  });

  return NextResponse.json(products.map((product) => ({
    id: product.id,
    name: product.name,
    price: product.price,
    imageUrl: product.imageUrl,
    categoryId: product.categoryId,
    categoryName: product.category.name,
    popular: product.popular,
  })));
}
