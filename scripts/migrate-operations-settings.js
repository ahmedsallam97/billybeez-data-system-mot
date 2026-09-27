const { prisma } = require("../lib/db");
const { ensureDefaultSettings, clearSettingsCache } = require("../lib/settings");

async function main() {
  const keys = ["DAILY_OPERATIONS_TEMPLATE_CONFIG", "OPS_MOTIVATION_PHRASES", "OPS_ROTATION_RULES", "OPS_EVALUATION_RULES"];
  const before = await prisma.systemSetting.findMany({ where: { key: { in: keys } }, select: { key: true, value: true } });
  await ensureDefaultSettings(prisma);
  clearSettingsCache();
  const after = await prisma.systemSetting.findMany({ where: { key: { in: keys } }, select: { key: true, value: true } });
  const oldValues = new Map(before.map((item) => [item.key, item.value]));
  const changed = after.filter((item) => oldValues.get(item.key) !== item.value).map((item) => item.key);
  console.log(JSON.stringify({ success: true, changed, unchanged: keys.filter((key) => !changed.includes(key)) }, null, 2));
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
