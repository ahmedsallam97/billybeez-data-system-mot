const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");
const { ensureFallbackImage, ensureProductImage, productImagePath } = require("./product-images");

const prisma = new PrismaClient();

const employees = [
  "محمد عصام",
  "محمد جمال",
  "صلاح محمد",
  "مصطفي عمارة",
  "محمد مدكور",
  "يوسف فهمي",
  "محمد عادل",
  "عبدالرحمن هشام",
  "مصطفي خالد",
  "مهرا سمير",
  "الاء نصار",
  "سلمي سلطان",
];

const restaurantEmployees = [
  "موظف مطعم 1",
  "موظف مطعم 2",
  "موظف مطعم 3",
];

const categories = [
  { id: "DRINKS", name: "Drinks" },
  { id: "BURGERS", name: "Burgers" },
  { id: "MEALS", name: "Meals" },
  { id: "SNACKS", name: "Snacks" },
];

const products = [
  { id: "WATER", categoryId: "DRINKS", name: "Water", price: 15, popular: true, sortOrder: 1 },
  { id: "PEPSI", categoryId: "DRINKS", name: "Pepsi", price: 30, popular: true, sortOrder: 2 },
  { id: "BURGER", categoryId: "BURGERS", name: "Burger", price: 120, popular: true, sortOrder: 3 },
  { id: "NUGGETS", categoryId: "MEALS", name: "Nuggets", price: 95, popular: true, sortOrder: 4 },
  { id: "FRIES", categoryId: "SNACKS", name: "Fries", price: 55, popular: true, sortOrder: 5 },
  { id: "JUICE", categoryId: "DRINKS", name: "Juice", price: 35, popular: false, sortOrder: 20 },
];

const users = [
  { name: "Admin", username: "admin", password: "admin123", role: "ADMIN" },
  { name: "Manager", username: "manager", password: "manager123", role: "MANAGER" },
  { name: "Data", username: "data", password: "data112411", role: "CASHIER" },
  { name: "Kitchen", username: "kitchen", password: "kitchen123", role: "KITCHEN" },
];

function normalizeProductName(value) {
  return String(value || "").trim().replace(/\s+/g, " ").toLowerCase();
}

async function existingProductIdByName(name) {
  const normalizedName = normalizeProductName(name);
  const products = await prisma.product.findMany();
  const existing = products.find((product) => normalizeProductName(product.name) === normalizedName);

  return existing?.id;
}

async function main() {
  ensureFallbackImage();

  for (const category of categories) {
    await prisma.category.upsert({
      where: { id: category.id },
      create: category,
      update: category,
    });
  }

  for (const product of products) {
    const category = categories.find((item) => item.id === product.categoryId);
    const productId = await existingProductIdByName(product.name) || product.id;
    const productData = { ...product, id: productId };

    ensureProductImage({
      id: productId,
      name: product.name,
      categoryName: category?.name || product.categoryId,
    });

    await prisma.product.upsert({
      where: { id: productId },
      create: { ...productData, imageUrl: productImagePath(productId) },
      update: { ...productData, imageUrl: productImagePath(productId) },
    });
  }

  for (const employee of employees) {
    await prisma.employee.upsert({
      where: { name: employee },
      create: { name: employee, department: "OPERATION" },
      update: { active: true, department: "OPERATION" },
    });
  }

  for (const employee of restaurantEmployees) {
    await prisma.employee.upsert({
      where: { name: employee },
      create: { name: employee, department: "RESTAURANT" },
      update: { active: true, department: "RESTAURANT" },
    });
  }

  for (const user of users) {
    const password = await bcrypt.hash(user.password, 12);
    const secureUser = { ...user, password };

    await prisma.user.upsert({
      where: { username: user.username },
      create: secureUser,
      update: secureUser,
    });
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
    console.log("Database seeded");
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
