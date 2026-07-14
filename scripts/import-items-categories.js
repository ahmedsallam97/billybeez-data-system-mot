const path = require("path");
const readXlsxFile = require("read-excel-file/node");
const { PrismaClient } = require("@prisma/client");
const { ensureFallbackImage, ensureProductImage, productImagePath } = require("./product-images");

const prisma = new PrismaClient();

function slugifyId(parts) {
  return parts
    .filter(Boolean)
    .join("_")
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^a-zA-Z0-9_]/g, "")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toUpperCase()
    .slice(0, 90);
}

function toNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizeDepartment(value) {
  const text = String(value || "").trim().toUpperCase().replace(/[\s-]+/g, "_");
  if (text === "ENTRANCE" || text === "FRONT") return "ENTRANCE";
  if (["KITCHEN_CASHIER", "RESTAURANT_CASHIER", "KITCHEN_POS", "RESTAURANT_POS"].includes(text)) {
    return "KITCHEN_CASHIER";
  }
  return "KITCHEN";
}

function normalizeRows(rows, fallbackDepartment, options = {}) {
  const [header, ...dataRows] = rows;
  const headerMap = new Map((header || []).map((value, index) => [String(value || "").trim().toLowerCase(), index]));
  const indexOf = (name) => headerMap.get(name.toLowerCase());
  const forcedDepartment = options.forceDepartment ? normalizeDepartment(fallbackDepartment) : null;

  return dataRows
    .map((row, index) => {
      const name = String(row[indexOf("Name")] || "").trim().replace(/\s+/g, " ");
      if (!name) return null;

      const department = forcedDepartment || normalizeDepartment(row[indexOf("Department")] || fallbackDepartment);
      const idPrefix = department === "KITCHEN_CASHIER" ? "KITCHEN" : department;
      const categoryName = String(row[indexOf("Category")] || "Other").trim().replace(/\s+/g, " ");
      const originalPrice = toNumber(row[indexOf("Original Price")]);
      const netSales = toNumber(row[indexOf("Net Sales")]);
      const taxAmount = toNumber(row[indexOf("Tax")]);
      const total = toNumber(row[indexOf("Total")], originalPrice);
      const taxRate = total ? Number(((taxAmount / total) * 100).toFixed(2)) : 0;
      const categoryId = slugifyId([idPrefix, categoryName]) || `${idPrefix}_OTHER`;
      const productId = slugifyId([idPrefix, name]) || `${idPrefix}_ITEM_${index + 1}`;

      return {
        id: productId,
        name,
        categoryId,
        categoryName,
        department,
        originalPrice,
        netSales,
        taxAmount,
        taxRate,
        price: total,
        active: true,
        popular: false,
        printOnKitchen: department === "KITCHEN",
        sortOrder: index + 1,
      };
    })
    .filter(Boolean);
}

async function importSheet(filePath, sheet, department) {
  const result = await readXlsxFile(filePath, { sheet });
  const rows = Array.isArray(result?.[0])
    ? result
    : result.find((entry) => String(entry.sheet || "").toLowerCase() === sheet.toLowerCase())?.data || [];
  return normalizeRows(rows, department, { forceDepartment: department === "KITCHEN_CASHIER" });
}

async function main() {
  const filePath = path.resolve(process.argv[2] || "C:/Users/asall/Downloads/items_categories.xlsx");
  ensureProductImage();
  ensureFallbackImage();

  const entranceItems = await importSheet(filePath, "Entrance", "ENTRANCE");
  const kitchenItems = await importSheet(filePath, "Kitchen", "KITCHEN_CASHIER");
  const items = [...entranceItems, ...kitchenItems];

  for (const item of items) {
    await prisma.category.upsert({
      where: { id: item.categoryId },
      create: {
        id: item.categoryId,
        name: item.categoryName,
        department: item.department,
      },
      update: {
        name: item.categoryName,
        department: item.department,
      },
    });

    await prisma.product.upsert({
      where: { id: item.id },
      create: {
        id: item.id,
        name: item.name,
        categoryId: item.categoryId,
        department: item.department,
        price: item.price,
        originalPrice: item.originalPrice,
        netSales: item.netSales,
        taxAmount: item.taxAmount,
        taxRate: item.taxRate,
        active: item.active,
        popular: item.popular,
        printOnKitchen: item.printOnKitchen,
        sortOrder: item.sortOrder,
        imageUrl: productImagePath(item.id),
      },
      update: {
        name: item.name,
        categoryId: item.categoryId,
        department: item.department,
        price: item.price,
        originalPrice: item.originalPrice,
        netSales: item.netSales,
        taxAmount: item.taxAmount,
        taxRate: item.taxRate,
        active: item.active,
        printOnKitchen: item.printOnKitchen,
        sortOrder: item.sortOrder,
      },
    });
  }

  console.log(`Imported ${entranceItems.length} entrance items and ${kitchenItems.length} kitchen cashier items from ${filePath}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
