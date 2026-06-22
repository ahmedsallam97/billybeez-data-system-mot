const { PrismaClient } = require("@prisma/client");
const { ensureFallbackImage, ensureProductImage, productImagePath } = require("./product-images");

const prisma = new PrismaClient();

async function main() {
  ensureFallbackImage();

  const products = await prisma.product.findMany({
    include: { category: true },
    orderBy: [{ categoryId: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
  });

  for (const product of products) {
    ensureProductImage({
      id: product.id,
      name: product.name,
      categoryName: product.category?.name || product.categoryId,
    });

    await prisma.product.update({
      where: { id: product.id },
      data: { imageUrl: productImagePath(product.id) },
    });
  }

  console.log(`Synced ${products.length} local product images`);
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
