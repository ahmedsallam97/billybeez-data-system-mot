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

function formatDeviceInvoiceSerial(deviceNo, sequenceValue) {
  const devicePart = String(Math.max(1, Number(deviceNo) || 1)).padStart(5, "0");
  const sequencePart = String(Math.max(1, Number(sequenceValue) || 1)).padStart(5, "0");
  return `${devicePart}${sequencePart}`;
}

async function nextDeviceInvoiceSerial(deviceNo, client = prisma) {
  const sequence = await nextSequence(`invoice:${Math.max(1, Number(deviceNo) || 1)}`, client);
  return formatDeviceInvoiceSerial(deviceNo, sequence);
}

module.exports = {
  formatDeviceInvoiceSerial,
  nextSequence,
  nextDeviceInvoiceSerial,
  seedSequence,
};
