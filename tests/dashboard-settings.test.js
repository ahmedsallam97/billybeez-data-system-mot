const { test } = require("node:test");
const assert = require("node:assert/strict");
const { defaultDashboardSettings: defaults, validateDashboardSettings: validate, parseDashboardSettings, filterAttention, resetDashboardCategory, visibleNavigation, landingPath, resolveEntry, dashboardCssVariables, NAVIGATION } = require("../lib/operations/dashboard-settings");
const { parseOperationsSetting } = require("../lib/operations/config-validation");
const { isOperationsWorkspaceSetting } = require("../lib/operations/settings-scope");

test("dashboard defaults round-trip, retain critical alerts, and do not share mutable state", () => {
  const config = defaults();
  assert.deepEqual(parseDashboardSettings(JSON.stringify(config)), config);
  assert.deepEqual(parseOperationsSetting("OPS_DASHBOARD_UI_CONFIG", JSON.stringify(config)), config);
  assert.equal(config.attention.critical, true);
  config.dashboard.cards[0].visible = false;
  assert.equal(defaults().dashboard.cards[0].visible, true);
});
test("only complete approved configuration and readable presets are accepted", () => {
  for (const mutate of [
    c => { c.secret = "x"; }, c => { c.dashboard.titleEn = "<script>"; },
    c => { c.dashboard.titleAr = ""; }, c => { c.dashboard.columns = 8; },
    c => { c.appearance.primary = "#ffffff"; }, c => { c.appearance.width = "100000px"; },
    c => { c.dashboard.sections[0].visible = "false"; },
    c => { c.dashboard.cards[1].id = c.dashboard.cards[0].id; },
    c => { c.dashboard.sections.forEach(item => { item.visible = false; }); },
    c => { c.dashboard.cards.pop(); }, c => { c.attention.maxItems = 0; }, c => { c.attention.maxItems = 1.5; },
    c => { c.landing.destination = "https://example.com"; }, c => { c.landing.destination = "settings"; },
    c => { c.navigation.items[0].href = "/front"; },
    c => { c.navigation.items.find(item => item.id === "settings").visible = false; },
  ]) { const config = defaults(); mutate(config); assert.throws(() => validate(config)); }
  for (const value of ["null", "[]", "{}", "false", "broken"]) assert.throws(() => parseDashboardSettings(value));
  assert.equal(isOperationsWorkspaceSetting("OPS_DASHBOARD_UI_CONFIG"), true);
  for (const key of ["BUSINESS_DAY_PASSWORD", "PAYMENT_CREDENTIALS", "OPS_UNKNOWN", "ROLE_PERMISSION_CONFIG"]) assert.equal(isOperationsWorkspaceSetting(key), false);
});
test("critical alerts survive item limits, sorting is stable, and explicit filters apply", () => {
  const config = defaults(); config.attention.maxItems = 1;
  const items = [{ code:"i",severity:"info" }, { code:"c1",severity:"danger" }, { code:"c2",severity:"critical" }, { code:"w",severity:"warning" }];
  assert.deepEqual(filterAttention(items, config).map(i => i.code), ["c1","c2"]);
  config.attention.sort = "source";
  assert.deepEqual(filterAttention(items, config).map(i => i.code), ["i","c1","c2"]);
  config.attention.critical = false;
  assert.deepEqual(filterAttention(items, config).map(i => i.code), ["i"]);
  assert.equal(items[0].code,"i");
});
test("category reset preserves other preferences; themes only emit approved CSS", () => {
  const config = defaults(); config.dashboard.titleEn = "My Operations"; config.appearance.primary = "plum";
  const reset = resetDashboardCategory(config,"appearance");
  assert.deepEqual(reset.appearance, defaults().appearance);
  assert.equal(reset.dashboard.titleEn,"My Operations");
  assert.equal(config.appearance.primary,"plum");
  assert.throws(() => resetDashboardCategory(config,"version"));
  assert.equal(dashboardCssVariables(config)["--ops-primary"],"var(--theme-primary-strong,#53265d)");
});
test("navigation and landing accept only implemented Operations routes, with no redirect loops", () => {
  const config = defaults();
  assert.equal(landingPath(config),"/opmanager");
  config.navigation.items.find(item => item.id === "employees").visible = false;
  assert.equal(visibleNavigation(config).some(([id]) => id === "employees"),false);
  assert.ok(NAVIGATION.every(([, , , href]) => /^\/opmanager(?:$|\/settings)|^\/operations\//.test(href)));
  config.landing.destination = "daily";
  assert.equal(resolveEntry(config,null,"2026-10-05"),"/operations/attendance?date=2026-10-05");
  config.landing.view = "last-used"; config.landing.date = "last-used";
  assert.equal(landingPath(config),"/operations?uiEntry=1");
  assert.equal(resolveEntry(config,{id:"roster",date:"2026-09-29"},"2026-10-05"),"/operations/daily?date=2026-09-29");
  for (const remembered of [{id:"settings",href:"https://example.com",date:"2026-02-31"},{id:"/front",date:"2026-02-30"},null]) assert.equal(resolveEntry(config,remembered,"2026-10-05"),"/operations/attendance?date=2026-10-05");
});
