const { getSetting } = require("../settings");
const { getRoleHome } = require("../roles");
const { DASHBOARD_SETTING_KEY, parseDashboardSettings, landingPath, resolveEntry } = require("./dashboard-settings");

async function getDashboardSettings() {
  // Page layouts must see a just-saved preference immediately. The general settings
  // cache can be loaded by a different Next route bundle before its invalidation.
  const row = await require('../db').prisma.systemSetting.findUnique({where:{key:DASHBOARD_SETTING_KEY},select:{value:true}});
  return parseDashboardSettings(row?.value);
}
async function getOperationsHome(user) {
  if(user.permissions && !user.permissions['dashboard.view']){const {NAVIGATION}=require('./dashboard-settings');const {NAV_PERMISSIONS}=require('../accounts/registry');return NAVIGATION.find(([id])=>user.permissions[NAV_PERMISSIONS[id]])?.[3] || (user.permissions['users.view']?'/opmanager/settings?category=access':'/account');}
  if (!user.permissions && !["ADMIN", "MANAGER"].includes(user.role)) return getRoleHome(user.role);
  // Failure calculating an optional landing preference falls back to the dashboard route.
  try {
    const config = await getDashboardSettings();
    const path = landingPath(config);
    return path.includes("uiEntry=1") ? path : resolveEntry(config, null, await getOperationsToday());
  }
  catch { return "/opmanager"; }
}
async function getOperationsToday() {
  const branch = JSON.parse(await getSetting("OPS_BRANCH_CONFIG"));
  return new Intl.DateTimeFormat("en-CA", { timeZone: branch.timezone || "Africa/Cairo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
module.exports = { getDashboardSettings, getOperationsHome, getOperationsToday };
