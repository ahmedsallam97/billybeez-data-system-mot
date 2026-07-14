import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authorizeApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";

const productDepartments = ["ENTRANCE", "KITCHEN", "KITCHEN_CASHIER"];

function normalizeId(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9-_]/g, "")
    .toUpperCase();
}

function optionalColor(value) {
  const text = String(value || "").trim();
  return /^#[0-9a-fA-F]{6}$/.test(text) ? text.toLowerCase() : null;
}

function normalizeAvailabilityRules(value) {
  if (!value) return null;
  const rules = typeof value === "string" ? value.trim() : JSON.stringify(value);
  if (!rules) return null;

  try {
    const parsed = JSON.parse(rules);
    const days = Array.isArray(parsed.days)
      ? parsed.days.map((day) => String(day).toLowerCase()).filter((day) => ["sun", "mon", "tue", "wed", "thu", "fri", "sat"].includes(day))
      : [];
    const startTime = /^\d{2}:\d{2}$/.test(String(parsed.startTime || "")) ? parsed.startTime : "";
    const endTime = /^\d{2}:\d{2}$/.test(String(parsed.endTime || "")) ? parsed.endTime : "";
    if (!days.length && !startTime && !endTime) return null;
    return JSON.stringify({ days, startTime, endTime });
  } catch {
    return null;
  }
}

function categoryPayload(body) {
  const department = productDepartments.includes(String(body.department || "").toUpperCase())
    ? String(body.department).toUpperCase()
    : "KITCHEN";
  const name = String(body.name || "").trim().replace(/\s+/g, " ");
  const baseId = normalizeId(body.id || name || "CATEGORY");
  const id = department === "KITCHEN_CASHIER" && !baseId.startsWith("KC_") ? `KC_${baseId}` : baseId;

  return {
    id,
    name,
    department,
    color: optionalColor(body.color),
    availabilityRules: normalizeAvailabilityRules(body.availabilityRules),
    active: body.active !== false,
    showInDataOrder: department === "KITCHEN" && body.showInDataOrder !== false,
    showInQuickOrder: department !== "ENTRANCE" && body.showInQuickOrder !== false,
    sortOrder: Number(body.sortOrder) || 100,
  };
}

function serializeCategory(category) {
  return {
    id: category.id,
    name: category.name,
    department: category.department,
    color: category.color || "",
    availabilityRules: category.availabilityRules || "",
    active: category.active,
    showInDataOrder: category.showInDataOrder !== false,
    showInQuickOrder: category.showInQuickOrder !== false,
    sortOrder: category.sortOrder || 100,
    productsCount: category._count?.products || 0,
  };
}

export async function GET(request) {
  const { user, error } = await authorizeApi("PRODUCT_READ");
  if (error) return error;

  const includeInactive = request.nextUrl.searchParams.get("includeInactive") === "true";

  if (includeInactive && !["ADMIN", "MANAGER"].includes(user.role)) {
    return NextResponse.json({ success: false, error: "Manager permission required" }, { status: 403 });
  }

  const categories = await prisma.category.findMany({
    where: includeInactive ? {} : { active: true },
    include: { _count: { select: { products: true } } },
    orderBy: [{ department: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
  });

  return NextResponse.json({ success: true, categories: categories.map(serializeCategory) });
}

export async function POST(request) {
  const { user, error } = await authorizeApi("PRODUCT_MANAGE");
  if (error) return error;

  const body = await request.json();
  const data = categoryPayload(body);

  if (!data.id || !data.name) {
    return NextResponse.json({ success: false, error: "Category name is required" }, { status: 400 });
  }

  const category = await prisma.category.create({
    data,
    include: { _count: { select: { products: true } } },
  });

  await writeAudit({
    action: "CATEGORY_CREATED",
    user,
    summary: `Created category ${category.name}`,
    metadata: { categoryId: category.id, department: category.department },
  });

  return NextResponse.json({ success: true, category: serializeCategory(category) });
}

export async function PATCH(request) {
  const { user, error } = await authorizeApi("PRODUCT_MANAGE");
  if (error) return error;

  const body = await request.json();
  const id = String(body.id || "").trim();
  const data = categoryPayload({ ...body, id });

  if (!id) {
    return NextResponse.json({ success: false, error: "Category id is required" }, { status: 400 });
  }

  if (!data.name) {
    return NextResponse.json({ success: false, error: "Category name is required" }, { status: 400 });
  }

  const category = await prisma.category.update({
    where: { id },
    data: {
      name: data.name,
      department: data.department,
      color: data.color,
      availabilityRules: data.availabilityRules,
      active: data.active,
      showInDataOrder: data.showInDataOrder,
      showInQuickOrder: data.showInQuickOrder,
      sortOrder: data.sortOrder,
    },
    include: { _count: { select: { products: true } } },
  });

  await writeAudit({
    action: "CATEGORY_UPDATED",
    user,
    summary: `Updated category ${category.name}`,
    metadata: { categoryId: category.id, department: category.department, active: category.active },
  });

  return NextResponse.json({ success: true, category: serializeCategory(category) });
}
