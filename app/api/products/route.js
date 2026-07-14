import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authorizeApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";

function optionalText(value, max = 500) {
  const text = String(value || "").trim();
  return text ? text.slice(0, max) : null;
}

function optionalColor(value) {
  const text = String(value || "").trim();
  return /^#[0-9a-fA-F]{6}$/.test(text) ? text.toLowerCase() : null;
}

function normalizeProductName(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

function productSort(a, b) {
  return Number(b.popular) - Number(a.popular)
    || (Number(a.sortOrder) || 100) - (Number(b.sortOrder) || 100)
    || String(a.name || "").localeCompare(String(b.name || ""), "en", { sensitivity: "base" });
}

function dedupeQuickProducts(products) {
  const byName = new Map();

  [...products].sort(productSort).forEach((product) => {
    const key = normalizeProductName(product.name);
    if (!key) return;

    const existing = byName.get(key);
    if (!existing) {
      byName.set(key, product);
      return;
    }

    const shouldPreferProduct = (
      existing.department !== "KITCHEN" && product.department === "KITCHEN"
    ) || (
      Boolean(product.popular) && !existing.popular
    ) || (
      (Number(product.sortOrder) || 100) < (Number(existing.sortOrder) || 100)
    );

    if (shouldPreferProduct) byName.set(key, product);
  });

  return [...byName.values()].sort(productSort);
}

function normalizeAvailabilityRules(value) {
  if (!value) return null;
  const raw = typeof value === "string" ? value : JSON.stringify(value);
  try {
    const parsed = JSON.parse(raw);
    const allowedDays = new Set(["sun", "mon", "tue", "wed", "thu", "fri", "sat"]);
    const days = Array.isArray(parsed.days)
      ? [...new Set(parsed.days.map((day) => String(day).toLowerCase()).filter((day) => allowedDays.has(day)))]
      : [];
    const startTime = /^\d{2}:\d{2}$/.test(String(parsed.startTime || "")) ? String(parsed.startTime) : "";
    const endTime = /^\d{2}:\d{2}$/.test(String(parsed.endTime || "")) ? String(parsed.endTime) : "";
    if (!days.length && !startTime && !endTime) return null;
    return JSON.stringify({ days, startTime, endTime });
  } catch {
    return null;
  }
}

function productPayload(body) {
  const name = String(body.name || "").trim().replace(/\s+/g, " ");
  const productDepartments = ["ENTRANCE", "KITCHEN", "KITCHEN_CASHIER"];
  const department = productDepartments.includes(String(body.department || "").toUpperCase())
    ? String(body.department).toUpperCase()
    : "KITCHEN";
  const generatedId = String(body.name || "").trim().replace(/\s+/g, "-").replace(/[^a-zA-Z0-9-_]/g, "").toUpperCase();
  const generatedPrefix = department === "ENTRANCE" ? "ENT_" : department === "KITCHEN_CASHIER" ? "KC_" : "";
  const id = String(body.id || `${generatedPrefix}${generatedId}`).trim().replace(/\s+/g, "-").replace(/[^a-zA-Z0-9-_]/g, "").toUpperCase();
  const categoryIdBase = String(body.categoryId || body.categoryName || "OTHER").trim().replace(/\s+/g, "-").replace(/[^a-zA-Z0-9-_]/g, "").toUpperCase();
  const categoryId = department === "KITCHEN_CASHIER" && !String(categoryIdBase).startsWith("KC_") ? `KC_${categoryIdBase}` : categoryIdBase;
  const categoryName = String(body.categoryName || body.categoryId || "Other").trim().replace(/\s+/g, " ");
  const price = Number(body.price);
  const originalPrice = body.originalPrice === undefined || body.originalPrice === "" ? null : Number(body.originalPrice);
  const netSales = body.netSales === undefined || body.netSales === "" ? null : Number(body.netSales);
  const taxAmount = body.taxAmount === undefined || body.taxAmount === "" ? null : Number(body.taxAmount);
  const taxRate = body.taxRate === undefined || body.taxRate === "" ? null : Number(body.taxRate);

  return {
    id,
    name,
    categoryId,
    categoryName,
    department,
    price,
    originalPrice: Number.isFinite(originalPrice) ? originalPrice : null,
    netSales: Number.isFinite(netSales) ? netSales : null,
    taxAmount: Number.isFinite(taxAmount) ? taxAmount : null,
    taxRate: Number.isFinite(taxRate) ? taxRate : null,
    etaItemCode: String(body.etaItemCode || "").trim() || null,
    etaCodeType: String(body.etaCodeType || "").trim() || null,
    etaUnitType: String(body.etaUnitType || "").trim() || null,
    etaTaxType: String(body.etaTaxType || "").trim() || null,
    etaTaxSubType: String(body.etaTaxSubType || "").trim() || null,
    imageUrl: optionalText(body.imageUrl, 1000),
    iconText: optionalText(body.iconText, 12),
    cardColorStart: optionalColor(body.cardColorStart),
    cardColorEnd: optionalColor(body.cardColorEnd),
    cardTextColor: optionalColor(body.cardTextColor),
    cardAccentColor: optionalColor(body.cardAccentColor),
    availabilityRules: normalizeAvailabilityRules(body.availabilityRules),
    popular: body.popular === true,
    active: body.active !== false,
    printOnKitchen: body.printOnKitchen !== false && ["KITCHEN", "KITCHEN_CASHIER"].includes(department),
    showInDataOrder: department === "KITCHEN" && body.showInDataOrder !== false,
    showInQuickOrder: department !== "ENTRANCE" && body.showInQuickOrder !== false,
    sortOrder: Number(body.sortOrder) || 100,
  };
}

function serializeProduct(product, options = {}) {
  return {
    id: product.id,
    name: product.name,
    price: product.price,
    originalPrice: product.originalPrice,
    netSales: product.netSales,
    taxAmount: product.taxAmount,
    taxRate: product.taxRate,
    department: product.department,
    etaItemCode: product.etaItemCode || "",
    etaCodeType: product.etaCodeType || "",
    etaUnitType: product.etaUnitType || "",
    etaTaxType: product.etaTaxType || "",
    etaTaxSubType: product.etaTaxSubType || "",
    imageUrl: options.includeImages === false ? "" : product.imageUrl,
    iconText: product.iconText || "",
    cardColorStart: product.cardColorStart || "",
    cardColorEnd: product.cardColorEnd || "",
    cardTextColor: product.cardTextColor || "",
    cardAccentColor: product.cardAccentColor || "",
    availabilityRules: product.availabilityRules || "",
    categoryAvailabilityRules: product.category.availabilityRules || "",
    categoryId: product.categoryId,
    categoryName: product.category.name,
    popular: product.popular,
    active: product.active,
    printOnKitchen: product.printOnKitchen,
    showInDataOrder: product.showInDataOrder !== false,
    showInQuickOrder: product.showInQuickOrder !== false,
    sortOrder: product.sortOrder,
  };
}

async function departmentFromRequest(searchParams) {
  const requestedDepartment = String(searchParams.get("department") || "").toUpperCase();
  if (["ENTRANCE", "KITCHEN", "KITCHEN_CASHIER"].includes(requestedDepartment)) return requestedDepartment;

  const deviceId = String(searchParams.get("deviceId") || "").trim();
  if (!deviceId) return null;

  const device = await prisma.device.findUnique({ where: { id: deviceId } });
  if (!device || !device.active) return null;

  if (device.type === "FRONT") return "ENTRANCE";
  if (device.type === "KITCHEN_CASHIER") return "KITCHEN_CASHIER";
  return "KITCHEN";
}

export async function GET(request) {
  const { user, error } = await authorizeApi("PRODUCT_READ");
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const includeInactive = searchParams.get("includeInactive") === "true";
  const includeImages = searchParams.get("images") !== "false";
  const context = String(searchParams.get("context") || "").toLowerCase();
  const department = await departmentFromRequest(searchParams);

  if (includeInactive && !["ADMIN", "MANAGER"].includes(user.role)) {
    return NextResponse.json({ success: false, error: "Manager permission required" }, { status: 403 });
  }

  let products = await prisma.product.findMany({
    where: {
      ...(includeInactive ? {} : { active: true }),
      ...(context === "quick" || context === "quickrestaurant" ? { department: { in: ["KITCHEN", "KITCHEN_CASHIER"] }, showInQuickOrder: true } : {}),
      ...(context === "data" ? { department: "KITCHEN", showInDataOrder: true } : {}),
      ...(department && context !== "quick" && context !== "quickrestaurant" ? { department } : {}),
    },
    include: { category: true },
    orderBy: [{ popular: "desc" }, { sortOrder: "asc" }, { name: "asc" }],
  });

  if ((context === "quick" || context === "quickrestaurant") && !includeInactive) {
    products = dedupeQuickProducts(products);
  }

  return NextResponse.json(products.map((product) => serializeProduct(product, { includeImages })));
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
      originalPrice: data.originalPrice,
      netSales: data.netSales,
      taxAmount: data.taxAmount,
      taxRate: data.taxRate,
      department: data.department,
      etaItemCode: data.etaItemCode,
      etaCodeType: data.etaCodeType,
      etaUnitType: data.etaUnitType,
      etaTaxType: data.etaTaxType,
      etaTaxSubType: data.etaTaxSubType,
      imageUrl: data.imageUrl,
      iconText: data.iconText,
      cardColorStart: data.cardColorStart,
      cardColorEnd: data.cardColorEnd,
      cardTextColor: data.cardTextColor,
      cardAccentColor: data.cardAccentColor,
      availabilityRules: data.availabilityRules,
      popular: data.popular,
      active: data.active,
      printOnKitchen: data.printOnKitchen,
      showInDataOrder: data.showInDataOrder,
      showInQuickOrder: data.showInQuickOrder,
      sortOrder: data.sortOrder,
      category: {
        connectOrCreate: {
          where: { id: data.categoryId },
          create: { id: data.categoryId, name: data.categoryName, department: data.department },
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
      originalPrice: data.originalPrice,
      netSales: data.netSales,
      taxAmount: data.taxAmount,
      taxRate: data.taxRate,
      department: data.department,
      etaItemCode: data.etaItemCode,
      etaCodeType: data.etaCodeType,
      etaUnitType: data.etaUnitType,
      etaTaxType: data.etaTaxType,
      etaTaxSubType: data.etaTaxSubType,
      imageUrl: data.imageUrl,
      iconText: data.iconText,
      cardColorStart: data.cardColorStart,
      cardColorEnd: data.cardColorEnd,
      cardTextColor: data.cardTextColor,
      cardAccentColor: data.cardAccentColor,
      availabilityRules: data.availabilityRules,
      popular: data.popular,
      active: data.active,
      printOnKitchen: data.printOnKitchen,
      showInDataOrder: data.showInDataOrder,
      showInQuickOrder: data.showInQuickOrder,
      sortOrder: data.sortOrder,
      category: {
        connectOrCreate: {
          where: { id: data.categoryId },
          create: { id: data.categoryId, name: data.categoryName, department: data.department },
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

export async function PUT(request) {
  const { user, error } = await authorizeApi("PRODUCT_MANAGE");
  if (error) return error;

  const body = await request.json();
  const ids = Array.isArray(body.ids)
    ? [...new Set(body.ids.map((id) => String(id || "").trim()).filter(Boolean))]
    : [];
  const updates = body.updates && typeof body.updates === "object" ? body.updates : {};

  if (!ids.length) {
    return NextResponse.json({ success: false, error: "Product ids are required" }, { status: 400 });
  }

  if (body.rankBySales === true) {
    const products = await prisma.product.findMany({
      where: { id: { in: ids } },
      include: { category: true },
    });
    const salesRows = await prisma.orderItem.groupBy({
      by: ["productId"],
      where: { productId: { in: ids } },
      _sum: { qty: true, total: true },
    });
    const salesMap = new Map(salesRows.map((row) => [
      row.productId,
      {
        qty: Number(row._sum.qty) || 0,
        total: Number(row._sum.total) || 0,
      },
    ]));
    const ranked = [...products].sort((a, b) => {
      const aSales = salesMap.get(a.id) || { qty: 0, total: 0 };
      const bSales = salesMap.get(b.id) || { qty: 0, total: 0 };
      return (bSales.qty - aSales.qty) || (bSales.total - aSales.total) || a.name.localeCompare(b.name);
    });
    const topPopularCount = Math.min(12, ranked.filter((product) => (salesMap.get(product.id)?.qty || 0) > 0).length);

    const updatedProducts = await prisma.$transaction(ranked.map((product, index) => prisma.product.update({
      where: { id: product.id },
      data: {
        sortOrder: (index + 1) * 10,
        popular: index < topPopularCount,
      },
      include: { category: true },
    })));

    await writeAudit({
      action: "PRODUCTS_RANKED_BY_SALES",
      user,
      summary: `Ranked ${updatedProducts.length} products by sales`,
      metadata: { productIds: ids, topPopularCount },
    });

    return NextResponse.json({
      success: true,
      count: updatedProducts.length,
      products: updatedProducts.map((product) => serializeProduct(product)),
    });
  }

  const hasUpdate = ["active", "popular", "printOnKitchen", "showInDataOrder", "showInQuickOrder"]
    .some((field) => Object.prototype.hasOwnProperty.call(updates, field));

  if (!hasUpdate) {
    return NextResponse.json({ success: false, error: "No supported product update was provided" }, { status: 400 });
  }

  const products = await prisma.product.findMany({ where: { id: { in: ids } } });

  const operations = products.map((product) => {
    const data = {};

    if (Object.prototype.hasOwnProperty.call(updates, "active")) data.active = updates.active === true;
    if (Object.prototype.hasOwnProperty.call(updates, "popular")) data.popular = updates.popular === true;
    if (Object.prototype.hasOwnProperty.call(updates, "showInDataOrder")) {
      data.showInDataOrder = product.department === "KITCHEN" && updates.showInDataOrder === true;
    }
    if (Object.prototype.hasOwnProperty.call(updates, "showInQuickOrder")) {
      data.showInQuickOrder = product.department !== "ENTRANCE" && updates.showInQuickOrder === true;
    }
    if (Object.prototype.hasOwnProperty.call(updates, "printOnKitchen")) {
      data.printOnKitchen = ["KITCHEN", "KITCHEN_CASHIER"].includes(product.department) && updates.printOnKitchen === true;
    }

    return prisma.product.update({
      where: { id: product.id },
      data,
      include: { category: true },
    });
  });

  const updatedProducts = await prisma.$transaction(operations);

  await writeAudit({
    action: "PRODUCT_BULK_UPDATED",
    user,
    summary: `Bulk updated ${updatedProducts.length} products`,
    metadata: { productIds: ids, updates },
  });

  return NextResponse.json({
    success: true,
    count: updatedProducts.length,
    products: updatedProducts.map((product) => serializeProduct(product)),
  });
}
