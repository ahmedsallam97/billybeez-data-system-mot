const bcrypt = require("bcryptjs");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

function isBcryptHash(value) {
  return /^\$2[aby]\$\d{2}\$/.test(String(value || ""));
}

async function main() {
  const users = await prisma.user.findMany({
    select: {
      id: true,
      username: true,
      password: true,
    },
  });
  let updated = 0;

  for (const user of users) {
    if (isBcryptHash(user.password)) continue;

    const password = await bcrypt.hash(user.password, 12);
    await prisma.user.update({
      where: { id: user.id },
      data: { password },
    });
    updated += 1;
  }

  console.log(`Hashed ${updated} user password(s)`);
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
