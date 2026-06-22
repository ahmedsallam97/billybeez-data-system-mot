const fs = require("fs");
const path = require("path");
const { PrismaClient } = require("@prisma/client");
const { ensureFallbackImage, ensureProductImage, productImagePath } = require("./product-images");

const prisma = new PrismaClient();

function readApiUrl() {
  const configPath = path.join(__dirname, "..", "config.js");
  const config = fs.readFileSync(configPath, "utf8");
  const match = config.match(/https:\/\/script\.google\.com\/macros\/s\/[^"']+\/exec/);

  if (!match) {
    throw new Error("Could not find Apps Script API_URL in config.js");
  }

  return match[0];
}

async function fetchJson(apiUrl, action, params = {}) {
  const url = new URL(apiUrl);
  url.searchParams.set("action", action);

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, value);
    }
  });

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`${action} failed with ${response.status}`);
  }

  return response.json();
}

function cleanId(value, fallback) {
  const cleaned = String(value || "")
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 80);

  return cleaned || fallback;
}

function textValue(value, fallback = "") {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number") return String(value);
  return fallback;
}

function mapPaymentMethod(value) {
  return String(value || "").toLowerCase() === "visa" ? "VISA" : "CASH";
}

function mapPaymentStatus(value) {
  return String(value || "").toLowerCase() === "paid" ? "PAID" : "UNPAID";
}

function mapKitchenStatus(value) {
  return String(value || "").toLowerCase() === "delivered" ? "DELIVERED" : "PENDING";
}

function mapOrderStatus(order) {
  if (order.archivedAt) return "ARCHIVED";
  if (mapPaymentStatus(order.paymentStatus) === "PAID") return "PAID";
  if (mapKitchenStatus(order.kitchenStatus) === "DELIVERED") return "DELIVERED";
  return "OPEN";
}

function parseDate(value) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date : undefined;
}

function parseBoolean(value) {
  return value === true || String(value).toLowerCase() === "true";
}

function customerPhoneFor(order) {
  return textValue(order.customerPhone || order.phone || order.mobile || order.customerMobile, null) || null;
}

async function ensureImportedCashier(name) {
  const cashierName = String(name || "Imported Cashier").trim() || "Imported Cashier";
  const username = `cashier_${Buffer.from(cashierName).toString("base64url").slice(0, 24)}`;

  return prisma.user.upsert({
    where: { username },
    create: {
      name: cashierName,
      username,
      password: "imported123",
      role: "CASHIER",
    },
    update: {
      name: cashierName,
      role: "CASHIER",
      active: true,
    },
  });
}

async function ensureProduct(product) {
  const categoryId = cleanId(textValue(product.categoryId, textValue(product.categoryName, "IMPORTED")), "IMPORTED");
  const categoryName = textValue(product.categoryName, textValue(product.categoryId, "Imported"));
  const productName = textValue(product.productName, textValue(product.name, "Imported Product"));
  const productId = cleanId(product.productId || productName, `IMP_${Date.now()}`);
  const productImageUrl = productImagePath(productId);

  ensureProductImage({
    id: productId,
    name: productName,
    categoryName,
  });

  await prisma.category.upsert({
    where: { id: categoryId },
    create: { id: categoryId, name: categoryName },
    update: { name: categoryName },
  });

  return prisma.product.upsert({
    where: { id: productId },
    create: {
      id: productId,
      categoryId,
      name: productName,
      price: Number(product.price) || 0,
      imageUrl: productImageUrl,
      popular: Boolean(product.popular),
      sortOrder: Number(product.sortOrder) || 100,
    },
    update: {
      categoryId,
      name: productName,
      price: Number(product.price) || 0,
      imageUrl: productImageUrl,
      active: true,
    },
  });
}

async function ensureProductForItem(item) {
  const name = item.productName || item.name || "Imported Item";
  const product = await prisma.product.findFirst({ where: { name } });

  if (product) return product;

  return ensureProduct({
    productId: `IMP_${cleanId(name, "ITEM")}`,
    productName: name,
    price: Number(item.price) || 0,
    categoryId: "IMPORTED",
    categoryName: "Imported",
  });
}

async function importProducts(apiUrl) {
  const products = await fetchJson(apiUrl, "getProducts");

  for (const product of products) {
    await ensureProduct(product);
  }

  return products.length;
}

async function importEmployees(apiUrl) {
  const employees = await fetchJson(apiUrl, "getDataEmployees").catch(() => []);

  for (const employee of employees) {
    const name = employee.name || employee.employeeName;
    if (!name) continue;

    await prisma.employee.upsert({
      where: { name },
      create: { name, active: employee.active !== false },
      update: { active: employee.active !== false },
    });
  }

  return employees.length;
}

async function importOrders(apiUrl) {
  const dashboard = await fetchJson(apiUrl, "getDashboard");
  const orders = Array.isArray(dashboard.orders) ? dashboard.orders : [];

  for (const order of orders) {
    const orderId = order.orderId || order.id;
    if (!orderId) continue;

    const cashier = await ensureImportedCashier(order.cashier);
    const dataEmployeeName = order.dataEmployee || "Unassigned";
    const dataEmployee = await prisma.employee.upsert({
      where: { name: dataEmployeeName },
      create: { name: dataEmployeeName },
      update: { active: true },
    });
    const createdAt = parseDate(order.time || order.createdAt);
    const archivedAt = parseDate(order.archivedAt);

    await prisma.order.upsert({
      where: { id: orderId },
      create: {
        id: orderId,
        braceletNo: String(order.bracelet || order.braceletNo || ""),
        customerPhone: customerPhoneFor(order),
        childNames: order.childName || order.child || "",
        childrenCount: Number(order.childrenCount) || 1,
        total: Number(order.total) || 0,
        status: mapOrderStatus(order),
        kitchenStatus: mapKitchenStatus(order.kitchenStatus),
        paymentStatus: mapPaymentStatus(order.paymentStatus),
        paymentMethod: mapPaymentMethod(order.paymentMethod),
        customerLeft: parseBoolean(order.customerLeft),
        archivedAt,
        cashierId: cashier.id,
        dataEmployeeId: dataEmployee.id,
        createdAt,
      },
      update: {
        braceletNo: String(order.bracelet || order.braceletNo || ""),
        customerPhone: customerPhoneFor(order),
        childNames: order.childName || order.child || "",
        childrenCount: Number(order.childrenCount) || 1,
        total: Number(order.total) || 0,
        status: mapOrderStatus(order),
        kitchenStatus: mapKitchenStatus(order.kitchenStatus),
        paymentStatus: mapPaymentStatus(order.paymentStatus),
        paymentMethod: mapPaymentMethod(order.paymentMethod),
        customerLeft: parseBoolean(order.customerLeft),
        archivedAt,
        cashierId: cashier.id,
        dataEmployeeId: dataEmployee.id,
      },
    });

    await prisma.orderItem.deleteMany({ where: { orderId } });

    for (const item of order.items || []) {
      const product = await ensureProductForItem(item);
      const qty = Math.max(1, Number(item.qty) || 1);
      const price = Number(item.price) || 0;
      const total = Number(item.total) || price * qty;

      await prisma.orderItem.create({
        data: {
          orderId,
          productId: product.id,
          name: item.name || item.productName || product.name,
          qty,
          price,
          total,
        },
      });
    }
  }

  return orders.length;
}

async function main() {
  ensureFallbackImage();

  const apiUrl = readApiUrl();
  const products = await importProducts(apiUrl);
  const employees = await importEmployees(apiUrl);
  const orders = await importOrders(apiUrl);

  console.log(`Imported ${products} products, ${employees} employees, ${orders} orders`);
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
