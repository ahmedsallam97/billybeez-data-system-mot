const { PrismaClient } = require("@prisma/client");
const { productImagePath, syncProductPhoto, writeFallbackFrom, writeSources } = require("./product-images");

const prisma = new PrismaClient();

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const products = await prisma.product.findMany({
    include: { category: true },
    orderBy: [{ categoryId: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
  });

  const sources = [];

  for (const product of products) {
    const synced = await syncProductPhoto({
      id: product.id,
      name: product.name,
      categoryName: product.category?.name || product.categoryId,
    });

    sources.push(synced);

    await prisma.product.update({
      where: { id: product.id },
      data: { imageUrl: productImagePath(product.id) },
    });

    console.log(`Photo synced: ${product.id} ${product.name}`);
    await sleep(900);
  }

  writeFallbackFrom("BURGER");
  writeSources(sources);

  console.log(`Synced ${products.length} real local product photos`);
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
