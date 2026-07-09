const { prisma } = require("./db");

async function nextSequence(name, client = prisma) {
  const current = await client.counterSequence.upsert({
    where: { name },
    create: { name, value: 1 },
    update: { value: { increment: 1 } },
  });

  return current.value;
}

async function seedSequence(name, minimumValue, client = prisma) {
  const current = await client.counterSequence.findUnique({ where: { name } });
  if (current && current.value >= minimumValue) return current.value;

  const sequence = await client.counterSequence.upsert({
    where: { name },
    create: { name, value: minimumValue },
    update: { value: minimumValue },
  });

  return sequence.value;
}

module.exports = {
  nextSequence,
  seedSequence,
};
