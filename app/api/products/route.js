import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authorizeApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";

function productPayload(body) {
  const id = String(body.id || body.name || "").trim().replace(/\s+/g, "-").replace(/[^a-zA-Z0-9-_]/g, "").toUpperCase();
  const name = String(body.name || "").trim().replace(/\s+/g, " ");
  const categoryId = String(body.categoryId || body.categoryName || "OTHER").trim().replace(/\s+/g, "-").replace(/[^a-zA-Z0-9-_]/g, "").toUpperCase();
  const categoryName = String(body.categoryName || body.categoryId || "Other").trim().replace(/\s+/g, " ");
  const price = Number(body.price);

  return {
    id,
    name,
    categoryId,
    categoryName,
    price,
    imageUrl: String(body.imageUrl || "").trim() || null,
    popular: body.popular === true,
    active: body.active !== false,
    sortOrder: Number(body.sortOrder) || 100,
  };
}

function serializeProduct(product) {
  return {
    id: product.id,
    name: product.name,
    price: product.price,
    imageUrl: product.imageUrl,
    categoryId: product.categoryId,
    categoryName: product.category.name,
    popular: product.popular,
    active: product.active,
    sortOrder: product.sortOrder,
  };
}

export async function GET(request) {
  const { user, error } = await authorizeApi("PRODUCT_READ");
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const includeInactive = searchParams.get("includeInactive") === "true";

  if (includeInactive && !["ADMIN", "MANAGER"].includes(user.role)) {
    return NextResponse.json({ success: false, error: "Manager permission required" }, { status: 403 });
  }

  const products = await prisma.product.findMany({
    where: includeInactive ? {} : { active: true },
    include: { category: true },
    orderBy: [{ popular: "desc" }, { sortOrder: "asc" }, { name: "asc" }],
  });

  return NextResponse.json(products.map(serializeProduct));
}

export async function POST(request) {
  const { user, error } = await authorizeApi("PRODUCT_MANAGE");
  if (error) return error;

  const body = await request.json();
  const data = productPayload(body);

  if (!data.id || !data.name || !Number.isFinite(data.price) || data.price < 0) {
    return NextResponse.json({ success: false, error: "Product name and valid price are required" }, { status: 400 });
  }

  const product = await prisma.product.create({
    data: {
      id: data.id,
      name: data.name,
      price: data.price,
      imageUrl: data.imageUrl,
      popular: data.popular,
      active: data.active,
      sortOrder: data.sortOrder,
      category: {
        connectOrCreate: {
          where: { id: data.categoryId },
          create: { id: data.categoryId, name: data.categoryName },
        },
      },
    },
    include: { category: true },
  });

  await writeAudit({
    action: "PRODUCT_CREATED",
    user,
    summary: `Created product ${product.name}`,
    metadata: { productId: product.id, price: product.price, categoryId: product.categoryId },
  });

  return NextResponse.json({ success: true, product: serializeProduct(product) });
}

export async function PATCH(request) {
  const { user, error } = await authorizeApi("PRODUCT_MANAGE");
  if (error) return error;

  const body = await request.json();
  const id = String(body.id || "");
  const data = productPayload({ ...body, id });

  if (!id) {
    return NextResponse.json({ success: false, error: "Product id is required" }, { status: 400 });
  }

  if (!data.name || !Number.isFinite(data.price) || data.price < 0) {
    return NextResponse.json({ success: false, error: "Product name and valid price are required" }, { status: 400 });
  }

  const product = await prisma.product.update({
    where: { id },
    data: {
      name: data.name,
      price: data.price,
      imageUrl: data.imageUrl,
      popular: data.popular,
      active: data.active,
      sortOrder: data.sortOrder,
      category: {
        connectOrCreate: {
          where: { id: data.categoryId },
          create: { id: data.categoryId, name: data.categoryName },
        },
      },
    },
    include: { category: true },
  });

  await writeAudit({
    action: "PRODUCT_UPDATED",
    user,
    summary: `Updated product ${product.name}`,
    metadata: { productId: product.id, price: product.price, active: product.active },
  });

  return NextResponse.json({ success: true, product: serializeProduct(product) });
}
