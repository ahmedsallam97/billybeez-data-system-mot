const { prisma } = require("../lib/db");

function money(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

async function main() {
  const issues = [];
  const strict = process.argv.includes("--strict");
  const orders = await prisma.order.findMany({
    include: {
      items: true,
      dataEmployee: true,
      paymentEmployee: true,
      geideaEmployee: true,
      exitEmployee: true,
    },
    orderBy: { createdAt: "desc" },
    take: 1000,
  });

  for (const order of orders) {
    const itemsTotal = money(order.items.reduce((sum, item) => sum + item.total, 0));
    const orderTotal = money(order.total);

    if (!order.items.length) issues.push(`${order.id}: order has no items`);
    if (itemsTotal !== orderTotal) issues.push(`${order.id}: total mismatch order=${orderTotal} items=${itemsTotal}`);
    if (!order.dataEmployeeId || !order.dataEmployee) issues.push(`${order.id}: missing data employee`);
    if (order.paymentStatus === "PAID" && !order.paymentEmployeeId) issues.push(`${order.id}: paid without payment employee`);
    if (order.geideaRegisteredAt && !order.geideaEmployeeId) issues.push(`${order.id}: Geidea registered without employee`);
    if (order.customerLeft && !order.exitEmployeeId) issues.push(`${order.id}: customer left without exit employee`);
    if (order.archivedAt && !order.customerLeft) issues.push(`${order.id}: archived before customer left`);
  }

  if (issues.length) {
    console.warn(`Database health audit found ${issues.length} issue(s):`);
    console.warn(issues.join("\n"));
    if (strict) process.exit(1);
    return;
  }

  console.log(`Database health audit passed for ${orders.length} order(s)`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
