const { prisma } = require("../lib/db");

function normalizeName(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

async function main() {
  const products = await prisma.product.findMany({
    where: { department: { in: ["KITCHEN", "KITCHEN_CASHIER"] } },
    select: {
      id: true,
      name: true,
      department: true,
      active: true,
      showInQuickOrder: true,
    },
    orderBy: [{ department: "asc" }, { name: "asc" }],
  });

  const dataProductNames = new Set(
    products
      .filter((product) => product.department === "KITCHEN")
      .map((product) => normalizeName(product.name))
      .filter(Boolean),
  );

  const duplicateQuickProducts = products.filter((product) => (
    product.department === "KITCHEN_CASHIER"
    && dataProductNames.has(normalizeName(product.name))
  ));

  let deleted = 0;
  let hidden = 0;

  for (const product of duplicateQuickProducts) {
    const orderItemsCount = await prisma.orderItem.count({
      where: { productId: product.id },
    });

    if (orderItemsCount === 0) {
      await prisma.product.delete({ where: { id: product.id } });
      deleted += 1;
    } else if (product.active || product.showInQuickOrder) {
      await prisma.product.update({
        where: { id: product.id },
        data: {
          active: false,
          showInQuickOrder: false,
        },
      });
      hidden += 1;
    }
  }

  console.log(`Quick duplicates checked: ${duplicateQuickProducts.length}`);
  console.log(`Deleted unused duplicates: ${deleted}`);
  console.log(`Hidden used duplicates: ${hidden}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
