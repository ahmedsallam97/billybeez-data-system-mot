const test = require("node:test");
const assert = require("node:assert/strict");

const {
  DEFAULT_DAILY_OPERATIONS_TEMPLATE_CONFIG,
  DEFAULT_OPS_MOTIVATION_PHRASES,
  normalizeDailyOperationsTemplateConfig,
  normalizeMotivationPhrases,
} = require("../lib/operations/daily-template-config");

test("daily template upgrade fills modern settings and removes retired keys", () => {
  const upgraded = normalizeDailyOperationsTemplateConfig({
    title: "Custom title",
    subtitle: "PLAY • LEARN • CELEBRATE",
    footerMotto: "SAFE PLAY • HAPPY KIDS • AMAZING TEAMS",
    fillerRows: 4,
    rotationHours: [9, 10, 11],
    labels: { employee: "TEAM MEMBER" },
    roleColors: { cashier: "#123456" },
  });

  assert.equal(upgraded.title, "Custom title");
  assert.equal(upgraded.subtitle, DEFAULT_DAILY_OPERATIONS_TEMPLATE_CONFIG.subtitle);
  assert.equal(upgraded.footerMotto, DEFAULT_DAILY_OPERATIONS_TEMPLATE_CONFIG.footerMotto);
  assert.equal(upgraded.labels.employee, "TEAM MEMBER");
  assert.equal(upgraded.labels.rotationTime, DEFAULT_DAILY_OPERATIONS_TEMPLATE_CONFIG.labels.rotationTime);
  assert.equal(upgraded.roleColors.cashier, "#123456");
  assert.equal(upgraded.roleColors.teamLeader, DEFAULT_DAILY_OPERATIONS_TEMPLATE_CONFIG.roleColors.teamLeader);
  assert.equal(Object.hasOwn(upgraded, "fillerRows"), false);
  assert.equal(Object.hasOwn(upgraded, "rotationHours"), false);
});

test("motivation phrase upgrade removes retired phrases and restores a useful default", () => {
  assert.deepEqual(normalizeMotivationPhrases(["PLAY • LEARN • CELEBRATE", "Own the shift"]), ["Own the shift"]);
  assert.deepEqual(normalizeMotivationPhrases(["SAFE PLAY • HAPPY KIDS • AMAZING TEAMS"]), DEFAULT_OPS_MOTIVATION_PHRASES);
  assert.deepEqual(normalizeMotivationPhrases([]), DEFAULT_OPS_MOTIVATION_PHRASES);
});
