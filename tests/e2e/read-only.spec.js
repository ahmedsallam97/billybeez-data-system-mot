const { test, expect } = require("@playwright/test");
const { DatabaseSync } = require("node:sqlite");
const { createHash, createHmac, randomBytes } = require("node:crypto");
const { assertIsolatedEnvironment } = require("./isolation");

function snapshot() {
  assertIsolatedEnvironment();
  const db = new DatabaseSync(process.env.DATABASE_URL.slice(5), { readOnly: true });
  try {
    return Object.fromEntries(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(({ name }) => {
      const rows = db.prepare(`SELECT * FROM "${name.replaceAll('"', '""')}"`).all().map((row) => JSON.stringify(row)).sort();
      return [name, createHash("sha256").update(JSON.stringify(rows)).digest("hex")];
    }));
  } finally { db.close(); }
}

test("Operations browsing is read-only and isolated from legacy APIs", async ({ page, request }) => {
  test.setTimeout(180_000);
  const before = snapshot();
  const writes = [];
  const legacy = [];
  page.on("request", (req) => {
    const path = new URL(req.url()).pathname;
    if (path.startsWith("/api/") && !["GET", "HEAD"].includes(req.method())) writes.push(path);
    if (/^\/api\/(dashboard|business-day|orders|payments|customers|children|loyalty|settings)(\/|$)/.test(path)) legacy.push(path);
  });
  for (const date of ["2026-09-12", "2026-09-29", "2026-09-30"]) {
    for (const tab of ["daily", "evaluation", "roster"]) {
      await page.goto(`/operations?tab=${tab}&date=${date}`, { waitUntil: "networkidle" });
      await expect(page.locator("body")).not.toContainText("Login required");
    }
  }
  for (const path of ["/opmanager", "/settings?tab=template"]) {
    await page.goto(path, { waitUntil: "networkidle" });
    await expect(page.locator("body")).not.toContainText("Current orders");
    for (const legacyPath of ["/manager", "/front", "/data", "/kitchen", "/kitchen-cashier", "/orders", "/customers", "/children", "/payments", "/loyalty"]) {
      await expect(page.locator(`a[href="${legacyPath}"], a[href^="${legacyPath}?"]`)).toHaveCount(0);
    }
  }
  for (const home of ["/", "/login"]) {
    const redirect = await request.get(home, { maxRedirects: 0 });
    expect(redirect.status()).toBe(307);
    expect(new URL(redirect.headers().location, "http://localhost").pathname).toBe("/opmanager");
  }
  expect((await request.get("/manager", { maxRedirects: 0 })).status()).toBe(404);
  const response = await request.get("/api/settings");
  expect(response.ok()).toBeTruthy();
  expect(await response.text()).not.toContain("BUSINESS_DAY_PASSWORD");
  const config = await request.get("/api/operations/config");
  expect(config.ok()).toBeTruthy();
  expect(await config.text()).not.toContain("BUSINESS_DAY_PASSWORD");
  const settings = await request.get("/api/operations/settings");
  expect(settings.ok()).toBeTruthy();
  const { OPERATIONS_SETTING_KEYS } = require("../../lib/operations/settings-scope");
  expect((await settings.json()).settings.every(row => OPERATIONS_SETTING_KEYS.includes(row.key))).toBeTruthy();
  const hidden = await request.get("/api/operations/settings?keys=BUSINESS_DAY_PASSWORD,POS_NAME");
  expect((await hidden.json()).settings).toEqual([]);
  const rejected = await request.patch("/api/operations/settings", { data: { key: "BUSINESS_DAY_PASSWORD", value: "must-not-be-saved" } });
  expect(rejected.status()).toBe(400);
  expect(writes).toEqual([]);
  expect(legacy).toEqual([]);
  expect(snapshot()).toEqual(before);
});

test("Operations settings save only allowed keys in the disposable database", async ({ request, playwright }) => {
  const url = "/api/operations/settings";
  const anonymous = await playwright.request.newContext({ baseURL: "http://127.0.0.1:3018", storageState: { cookies: [], origins: [] } });
  try {
    expect((await anonymous.get(url)).status()).toBe(401);
    expect((await anonymous.patch(url, { data: { key: "OPS_BRANCH_CONFIG", value: "{}" } })).status()).toBe(401);
  } finally { await anonymous.dispose(); }

  const before = snapshot();
  for (const key of ["POS_NAME", "OPS_UNKNOWN"]) {
    expect((await request.patch(url, { data: { key, value: "{}" } })).status()).toBe(400);
  }
  expect((await request.patch(url, { data: { key: "OPS_BRANCH_CONFIG", value: "invalid JSON" } })).status()).toBe(400);
  expect(snapshot()).toEqual(before);

  const original = await request.get(`${url}?keys=OPS_BRANCH_CONFIG`);
  const row = (await original.json()).settings[0];
  const value = JSON.stringify({ ...JSON.parse(row.value), branchName: "Operations settings isolation test" });
  try {
    const saved = await request.patch(url, { data: { key: row.key, value } });
    expect(saved.ok()).toBeTruthy();
    expect((await saved.json()).setting.value).toBe(value);
    const reloaded = await request.get(`${url}?keys=OPS_BRANCH_CONFIG`);
    expect((await reloaded.json()).settings[0].value).toBe(value);
  } finally {
    expect((await request.patch(url, { data: { key: row.key, value: row.value } })).ok()).toBeTruthy();
  }
  const after = snapshot();
  for (const table of Object.keys(before).filter(name => !["SystemSetting", "AuditLog"].includes(name))) {
    expect(after[table], table).toEqual(before[table]);
  }
});

test("Operations settings and management routes enforce the role boundary", async ({ playwright }) => {
  assertIsolatedEnvironment();
  const db = new DatabaseSync(process.env.DATABASE_URL.slice(5), { readOnly: true });
  let users;
  try { users = db.prepare("SELECT id, role FROM User WHERE active = 1 ORDER BY id").all(); }
  finally { db.close(); }
  const before = snapshot();
  for (const role of ["ADMIN", "MANAGER", "CASHIER", "DATA", "KITCHEN"]) {
    const user = users.find(row => row.role === role);
    expect(Boolean(user), `Disposable database requires an active ${role} user`).toBeTruthy();
    const now = Math.floor(Date.now() / 1000);
    const payload = Buffer.from(JSON.stringify({ sub: user.id, iat: now, exp: now + 600, jti: randomBytes(16).toString("hex"), v: 1 })).toString("base64url");
    const signature = createHmac("sha256", process.env.SESSION_SECRET).update(payload).digest("base64url");
    const context = await playwright.request.newContext({
      baseURL: "http://127.0.0.1:3018",
      storageState: { cookies: [{ name: process.env.AUTH_COOKIE_NAME, value: `${payload}.${signature}`, domain: "127.0.0.1", path: "/", expires: now + 600, httpOnly: true, secure: false, sameSite: "Strict" }], origins: [] },
    });
    try {
      const managerial = ["ADMIN", "MANAGER"].includes(role);
      expect((await context.get("/api/operations/settings")).status()).toBe(managerial ? 200 : 403);
      expect((await context.patch("/api/operations/settings", { data: { key: "BUSINESS_DAY_PASSWORD", value: "must-not-be-saved" } })).status()).toBe(managerial ? 400 : 403);
      const home = await context.get("/", { maxRedirects: 0 });
      expect(home.status()).toBe(307);
      const destination = new URL(home.headers().location, "http://localhost").pathname;
      if (managerial) {
        expect(destination).toBe("/opmanager");
        expect((await context.get("/opmanager")).status()).toBe(200);
        expect((await context.get("/manager", { maxRedirects: 0 })).status()).toBe(404);
      } else {
        expect(destination).not.toBe("/opmanager");
        expect((await context.get("/opmanager", { maxRedirects: 0 })).status()).toBe(307);
      }
    } finally { await context.dispose(); }
  }
  expect(snapshot()).toEqual(before);
});
