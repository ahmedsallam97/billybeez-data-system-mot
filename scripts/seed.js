const { PrismaClient } = require("@prisma/client");
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
  { name: "Cashier", username: "cashier", password: "cashier123", role: "CASHIER" },
  { name: "Kitchen", username: "kitchen", password: "kitchen123", role: "KITCHEN" },
];

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
    ensureProductImage({
      id: product.id,
      name: product.name,
      categoryName: category?.name || product.categoryId,
    });

    await prisma.product.upsert({
      where: { id: product.id },
      create: { ...product, imageUrl: productImagePath(product.id) },
      update: { ...product, imageUrl: productImagePath(product.id) },
    });
  }

  for (const employee of employees) {
    await prisma.employee.upsert({
      where: { name: employee },
      create: { name: employee },
      update: { active: true },
    });
  }

  for (const user of users) {
    await prisma.user.upsert({
      where: { username: user.username },
      create: user,
      update: user,
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
