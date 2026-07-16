const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");
const { ensureFallbackImage, ensureProductImage, productImagePath } = require("./product-images");

const prisma = new PrismaClient();

const employees = [
  "محمد عصام",
  "محمد جمال",
  "صلاح محمد",
  "مصطفي عمارة",
  "يوسف فهمي",
  "محمد عادل",
  "عبدالرحمن هشام",
  "مصطفي خالد",
  "سلمي سلطان",
];

const cashierEmployees = [
  "مهرا سمير",
  "ألاء نصار",
  "محمد مدكور",
  "أحمد السيد",
];

const restaurantEmployees = [
  "موظف مطعم 1",
  "موظف مطعم 2",
  "موظف مطعم 3",
];

const categories = [
  { id: "DRINKS", name: "Drinks", department: "KITCHEN" },
  { id: "BURGERS", name: "Burgers", department: "KITCHEN" },
  { id: "MEALS", name: "Meals", department: "KITCHEN" },
  { id: "SNACKS", name: "Snacks", department: "KITCHEN" },
  { id: "KC_DRINKS", name: "Drinks", department: "KITCHEN_CASHIER" },
  { id: "KC_BURGERS", name: "Burgers", department: "KITCHEN_CASHIER" },
  { id: "KC_MEALS", name: "Meals", department: "KITCHEN_CASHIER" },
  { id: "KC_SNACKS", name: "Snacks", department: "KITCHEN_CASHIER" },
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
  { name: "Data", username: "data", password: "data112411", role: "DATA" },
  { name: "Cashier", username: "cashier", password: "cashier112411", role: "CASHIER" },
  { name: "Kitchen", username: "kitchen", password: "kitchen123", role: "KITCHEN" },
];

function uniqueNames(names) {
  return [...new Set(names.map((name) => String(name || "").trim()).filter(Boolean))];
}

function roleForEmployee(employee) {
  return employee.department === "KITCHEN" ? "KITCHEN" : "DATA";
}

const devices = Array.from({ length: 10 }, (_, index) => {
  const deviceNo = index + 1;
  const type = deviceNo <= 4 ? "FRONT" : deviceNo <= 8 ? "KITCHEN" : "KITCHEN_CASHIER";
  return {
    id: `DEVICE_${deviceNo}`,
    deviceNo,
    name: type === "FRONT" ? `Front Device ${deviceNo}` : type === "KITCHEN_CASHIER" ? `Kitchen Cashier Device ${deviceNo}` : `Kitchen Device ${deviceNo}`,
    type,
    active: true,
  };
});

const paymentProviders = [
  { id: "CASH", name: "Cash", type: "CASH", method: "CASH", editable: false, showInFrontOrder: true, showInDataOrder: true, showInQuickOrder: true, sortOrder: 1, reportBucket: "CASH" },
  { id: "VISA", name: "Visa", type: "VISA", method: "VISA", editable: false, showInFrontOrder: true, showInDataOrder: true, showInQuickOrder: true, sortOrder: 2, reportBucket: "VISA" },
  { id: "KIDZAPP", name: "Kidzapp", type: "CUSTOM", method: "KIDZAPP", editable: true, showInFrontOrder: true, showInDataOrder: false, showInQuickOrder: false, sortOrder: 10, reportBucket: "PARTNER" },
  { id: "WAFFARHA", name: "Waffarha", type: "CUSTOM", method: "WAFFARHA", editable: true, showInFrontOrder: true, showInDataOrder: true, showInQuickOrder: true, sortOrder: 11, reportBucket: "PARTNER" },
  { id: "E_INVOICE", name: "E-Invoice", type: "CUSTOM", method: "E_INVOICE", editable: true, showInFrontOrder: true, showInDataOrder: false, showInQuickOrder: false, sortOrder: 12, reportBucket: "PARTNER" },
  { id: "CUSTOM_1", name: "Loyalty Points", type: "CUSTOM", method: "CUSTOM_1", editable: true, showInFrontOrder: true, showInDataOrder: true, showInQuickOrder: true, sortOrder: 13, reportBucket: "LOYALTY" },
  { id: "CUSTOM_2", name: "Custom 2", type: "CUSTOM", method: "CUSTOM_2", editable: true, showInFrontOrder: true, showInDataOrder: false, showInQuickOrder: false, sortOrder: 14, reportBucket: "CUSTOM" },
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
      create: { ...productData, department: "KITCHEN", printOnKitchen: true, imageUrl: productImagePath(productId) },
      update: { ...productData, department: "KITCHEN", printOnKitchen: true, imageUrl: productImagePath(productId) },
    });

    const kitchenCashierProductId = `KC_${product.id}`;
    const kitchenCashierCategoryId = `KC_${product.categoryId}`;
    ensureProductImage({
      id: kitchenCashierProductId,
      name: product.name,
      categoryName: category?.name || product.categoryId,
    });

    await prisma.product.upsert({
      where: { id: kitchenCashierProductId },
      create: {
        ...product,
        id: kitchenCashierProductId,
        categoryId: kitchenCashierCategoryId,
        department: "KITCHEN_CASHIER",
        printOnKitchen: true,
        imageUrl: productImagePath(kitchenCashierProductId),
      },
      update: {
        ...product,
        id: kitchenCashierProductId,
        categoryId: kitchenCashierCategoryId,
        department: "KITCHEN_CASHIER",
        printOnKitchen: true,
        imageUrl: productImagePath(kitchenCashierProductId),
      },
    });
  }

  for (const device of devices) {
    await prisma.device.upsert({
      where: { id: device.id },
      create: device,
      update: {
        name: device.name,
        type: device.type,
        active: device.active,
      },
    });
  }

  for (const provider of paymentProviders) {
    await prisma.paymentProvider.upsert({
      where: { id: provider.id },
      create: provider,
      update: provider,
    });
  }

  const loyaltyRewards = [
    { id: "LOYALTY_ENTRANCE_25", name: "خصم دخول 25%", nameEn: "25% Entrance Discount", walletType: "ENTRANCE", rewardType: "PERCENT_DISCOUNT", pointsCost: 100, discountPercent: 25, sortOrder: 10 },
    { id: "LOYALTY_ENTRANCE_30", name: "خصم دخول 30%", nameEn: "30% Entrance Discount", walletType: "ENTRANCE", rewardType: "PERCENT_DISCOUNT", pointsCost: 150, discountPercent: 30, sortOrder: 20 },
    { id: "LOYALTY_ENTRANCE_50", name: "خصم دخول 50%", nameEn: "50% Entrance Discount", walletType: "ENTRANCE", rewardType: "PERCENT_DISCOUNT", pointsCost: 250, discountPercent: 50, sortOrder: 30 },
    { id: "LOYALTY_RESTAURANT_ITEM", name: "منتج مجاني من المطعم", nameEn: "Free Restaurant Item", walletType: "RESTAURANT", rewardType: "FREE_PRODUCT", pointsCost: 200, sortOrder: 40 },
    { id: "LOYALTY_RESTAURANT_MEAL", name: "وجبة مجانية من المطعم", nameEn: "Free Restaurant Meal", walletType: "RESTAURANT", rewardType: "FREE_PRODUCT", pointsCost: 500, sortOrder: 50 },
  ];
  for (const reward of loyaltyRewards) {
    await prisma.loyaltyReward.upsert({
      where: { id: reward.id },
      create: reward,
      update: reward,
    });
  }

  for (const employee of employees) {
    await prisma.employee.upsert({
      where: { name: employee },
      create: { name: employee, department: "OPERATION" },
      update: { active: true, department: "OPERATION" },
    });
  }

  const oldAlaa = await prisma.employee.findUnique({ where: { name: "الاء نصار" } });
  const newAlaa = await prisma.employee.findUnique({ where: { name: "ألاء نصار" } });
  if (oldAlaa && !newAlaa) {
    await prisma.employee.update({
      where: { id: oldAlaa.id },
      data: { name: "ألاء نصار", department: "CASHIER", active: true },
    });
  }

  for (const employee of cashierEmployees) {
    await prisma.employee.upsert({
      where: { name: employee },
      create: { name: employee, department: "CASHIER" },
      update: { active: true, department: "CASHIER" },
    });
  }

  for (const employee of restaurantEmployees) {
    await prisma.employee.upsert({
      where: { name: employee },
      create: { name: employee, department: "KITCHEN" },
      update: { active: true, department: "KITCHEN" },
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

  const preferredEmployeeOrder = uniqueNames([...cashierEmployees, ...employees, ...restaurantEmployees]);
  const activeEmployees = await prisma.employee.findMany({
    where: { active: true },
  });
  const employeeMap = new Map(activeEmployees.map((employee) => [employee.name, employee]));
  const orderedEmployees = [
    ...preferredEmployeeOrder.map((name) => employeeMap.get(name)).filter(Boolean),
    ...activeEmployees
      .filter((employee) => !preferredEmployeeOrder.includes(employee.name))
      .sort((a, b) => a.name.localeCompare(b.name, "ar")),
  ];

  for (const [index, employee] of orderedEmployees.entries()) {
    const username = String(1111 + index);
    const password = await bcrypt.hash(username, 12);
    await prisma.user.upsert({
      where: { username },
      create: {
        name: employee.name,
        username,
        password,
        role: roleForEmployee(employee),
        employeeId: employee.id,
        active: true,
      },
      update: {
        name: employee.name,
        password,
        role: roleForEmployee(employee),
        employeeId: employee.id,
        active: true,
      },
    });
  }

  const roleSetting = await prisma.systemSetting.findUnique({ where: { key: "ROLE_PERMISSION_CONFIG" } });
  if (roleSetting?.value) {
    try {
      const parsed = JSON.parse(roleSetting.value);
      const orderCreateRoles = Array.isArray(parsed.ORDER_CREATE) ? parsed.ORDER_CREATE : [];
      const nextOrderCreateRoles = [...new Set([...orderCreateRoles, "MANAGER", "KITCHEN", "DATA"])];
      if (nextOrderCreateRoles.length !== orderCreateRoles.length) {
        parsed.ORDER_CREATE = nextOrderCreateRoles;
        await prisma.systemSetting.update({
          where: { key: "ROLE_PERMISSION_CONFIG" },
          data: { value: JSON.stringify(parsed) },
        });
      }
    } catch {}
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
