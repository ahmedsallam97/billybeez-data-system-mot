const { prisma } = require("./db");

const DEFAULT_SETTINGS = Object.freeze({
  BUSINESS_DAY_PASSWORD: {
    value: process.env.BUSINESS_DAY_PASSWORD || "112411",
    description: "Password required when cashier or restaurant controls the business day",
  },
  BUSINESS_OPEN_HOUR: {
    value: "7",
    description: "Business day opening hour in Africa/Cairo time",
  },
  BUSINESS_CLOSE_HOUR: {
    value: "1",
    description: "Business day closing hour in Africa/Cairo time",
  },
  BRANCH_NAME: {
    value: "BillyBeez MOA",
    description: "Printed branch name",
  },
  BRANCH_TIN: {
    value: "474-214-206",
    description: "Printed tax identification number",
  },
  KITCHEN_PRINTER_NAME: {
    value: "",
    description: "Default kitchen printer name for the local print agent",
  },
  ARCHIVE_REQUIRES_CUSTOMER_LEFT: {
    value: "true",
    description: "Orders can only archive after data team marks customer left",
  },
});

async function ensureDefaultSettings(client = prisma) {
  await Promise.all(Object.entries(DEFAULT_SETTINGS).map(([key, setting]) => client.systemSetting.upsert({
    where: { key },
    create: {
      key,
      value: setting.value,
      description: setting.description,
    },
    update: {},
  })));
}

async function getSetting(key, fallback = "") {
  try {
    const setting = await prisma.systemSetting.findUnique({ where: { key } });
    return setting?.value ?? DEFAULT_SETTINGS[key]?.value ?? fallback;
  } catch {
    return DEFAULT_SETTINGS[key]?.value ?? fallback;
  }
}

async function getNumberSetting(key, fallback) {
  const value = Number(await getSetting(key, String(fallback)));
  return Number.isFinite(value) ? value : fallback;
}

async function getBooleanSetting(key, fallback = false) {
  const value = String(await getSetting(key, fallback ? "true" : "false")).toLowerCase();
  return ["1", "true", "yes", "on"].includes(value);
}

module.exports = {
  DEFAULT_SETTINGS,
  ensureDefaultSettings,
  getBooleanSetting,
  getNumberSetting,
  getSetting,
};
