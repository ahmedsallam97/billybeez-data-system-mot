const { test, expect } = require("@playwright/test");
const { DatabaseSync } = require("node:sqlite");
const { createHash, createHmac, randomBytes } = require("node:crypto");
const path = require("node:path");
const fs = require("node:fs");
const { assertIsolatedEnvironment } = require("./isolation");
const { DASHBOARD_SETTING_KEY: KEY, defaultDashboardSettings: defaults } = require("../../lib/operations/dashboard-settings");
const endpoint = "/api/operations/settings";
function readDb(fn) { assertIsolatedEnvironment(); const db = new DatabaseSync(process.env.DATABASE_URL.slice(5), { readOnly:true }); try { return fn(db); } finally { db.close(); } }
function snapshot() {
  return readDb(db => Object.fromEntries(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT IN ('AuditLog') ORDER BY name").all().map(({name}) => {
    const rows = db.prepare(`SELECT * FROM "${name.replaceAll('"','""')}"`).all().filter(row => name !== "SystemSetting" || row.key !== KEY).map(row => JSON.stringify(row)).sort();
    return [name,createHash("sha256").update(JSON.stringify(rows)).digest("hex")];
  })));
}
async function getConfig(request) { const res = await request.get(`${endpoint}?keys=${KEY}`); expect(res.ok()).toBeTruthy(); return JSON.parse((await res.json()).settings[0].value); }
async function saveConfig(request, config) { const res = await request.patch(endpoint,{maxRetries:1,data:{key:KEY,value:JSON.stringify(config)}}); expect(res.status(),await res.text()).toBe(200); }
function auth(role) {
  const user = readDb(db => db.prepare("SELECT id FROM User WHERE active=1 AND role=? LIMIT 1").get(role));
  expect(user,`Active ${role} fixture`).toBeTruthy();
  const now = Math.floor(Date.now()/1000);
  const payload = Buffer.from(JSON.stringify({sub:user.id,iat:now,exp:now+1800,jti:randomBytes(16).toString("hex"),v:1})).toString("base64url");
  const signature = createHmac("sha256",process.env.SESSION_SECRET).update(payload).digest("base64url");
  return {cookies:[{name:process.env.AUTH_COOKIE_NAME,value:`${payload}.${signature}`,domain:"127.0.0.1",path:"/",expires:now+1800,httpOnly:true,secure:false,sameSite:"Strict"}],origins:[]};
}
test.beforeEach(async ({page}) => { await page.addInitScript(() => localStorage.setItem("bbLanguage","en")); });

test("dashboard preferences enforce roles, strict values, and the Operations-only boundary", async ({playwright,request}) => {
  test.setTimeout(120000);
  const original = await getConfig(request); const before = snapshot();
  try {
    for (const role of ["ADMIN","MANAGER","DATA","CASHIER","KITCHEN"]) {
      const context = await playwright.request.newContext({baseURL:"http://127.0.0.1:3018",storageState:auth(role)});
      try {
        const allowed = ["ADMIN","MANAGER"].includes(role);
        expect((await context.get(endpoint)).status()).toBe(allowed?200:403);
        expect((await context.get("/api/operations/config")).status()).toBe(allowed?200:403);
        const config = defaults(); config.dashboard.titleEn = `${role} dashboard`;
        config.navigation.items.find(item => item.id === "employees").visible = false;
        expect((await context.patch(endpoint,{data:{key:KEY,value:JSON.stringify(config)}})).status()).toBe(allowed?200:403);
        expect((await context.get("/opmanager/settings/dashboard",{maxRedirects:0})).status()).toBe(allowed?200:307);
        expect((await context.get("/operations/employees",{maxRedirects:0})).status()).toBe(allowed?200:307);
        expect((await context.get("/api/operations/employees")).status()).toBe(allowed?200:403);
        if (allowed) { expect((await getConfig(context)).dashboard.titleEn).toBe(`${role} dashboard`); expect((await context.get("/manager",{maxRedirects:0})).status()).toBe(404); }
      } finally { await context.dispose(); }
    }
    const anonymous = await playwright.request.newContext({baseURL:"http://127.0.0.1:3018",storageState:{cookies:[],origins:[]}});
    try { expect((await anonymous.get(endpoint)).status()).toBe(401); expect((await anonymous.patch(endpoint,{data:{key:KEY,value:JSON.stringify(defaults())}})).status()).toBe(401); } finally { await anonymous.dispose(); }
    for (const key of ["BUSINESS_DAY_PASSWORD","PAYMENT_CREDENTIALS","OPS_UNKNOWN","ROLE_PERMISSION_CONFIG"]) expect((await request.patch(endpoint,{data:{key,value:"{}"}})).status()).toBe(400);
    const invalid = defaults(); invalid.navigation.items[0].href = "/front";
    for (const value of ["null","[]","{}","invalid",JSON.stringify(invalid),"x".repeat(20001)]) expect((await request.patch(endpoint,{data:{key:KEY,value}})).status()).toBe(400);
    expect((await request.get(`${endpoint}?keys=BUSINESS_DAY_PASSWORD`)).ok()).toBeTruthy();
    expect((await (await request.get(`${endpoint}?keys=BUSINESS_DAY_PASSWORD`)).json()).settings).toEqual([]);
    expect(await (await request.get(endpoint)).text()).not.toContain("BUSINESS_DAY_PASSWORD");
    expect(await (await request.get("/api/operations/config")).text()).not.toContain("BUSINESS_DAY_PASSWORD");
    expect(snapshot()).toEqual(before);
  } finally { await saveConfig(request,original); }
});

test("edit, real preview, save, reload, navigation, category reset and confirmed full reset", async ({page,request}) => {
  test.setTimeout(180000);
  const original = await getConfig(request); const before = snapshot();
  const evidence = path.resolve(process.env.OPS_E2E_EVIDENCE_DIR || "docs/audit-evidence/dashboard-settings"); fs.mkdirSync(evidence,{recursive:true});
  const browserErrors = []; page.on("pageerror", error => browserErrors.push(error.message));
  const category=async name=>{const nav=page.getByRole("navigation",{name:"Settings categories"});if(name==="Live template editors"){const group=nav.locator("details").filter({has:page.locator("summary").filter({hasText:name})});if(!await group.evaluate(el=>el.open))await group.locator("summary").click();await group.getByRole("link").first().click();}else await nav.getByRole("link",{name,exact:true}).click();};
  const save = async () => { await page.getByRole("button",{name:"Save UI settings",exact:true}).click(); await expect(page.getByRole("status").filter({hasText:"UI settings saved and applied."})).toBeVisible(); };
  try {
    await saveConfig(request,defaults()); await page.setViewportSize({width:1440,height:1000});
    await page.goto("/opmanager",{waitUntil:"networkidle"}); await expect(page.locator("[data-card]")).toHaveCount(7);
    await page.screenshot({path:path.join(evidence,"dashboard-before.png"),fullPage:true});
    await page.goto("/opmanager/settings"); await expect(page.getByRole("heading",{name:"Dashboard",exact:true})).toBeVisible();
    await page.screenshot({path:path.join(evidence,"settings-before.png"),fullPage:true});
    await page.getByLabel("Dashboard title (English)",{exact:true}).fill("MOT Operations · My team");
    await page.getByLabel("Dashboard title (Arabic)",{exact:true}).fill("عمليات بيلي بيز · فريقي");
    await page.getByRole("checkbox",{name:"Active Team",exact:true}).uncheck();
    await page.getByRole("button",{name:"Move up: 7-Day Reservations",exact:true}).click();
    await page.getByRole("button",{name:"Move up: 7-Day Reservations",exact:true}).click();
    await page.getByRole("checkbox",{name:"Billy Assistant",exact:true}).uncheck();
    await page.getByRole("button",{name:"Move up: Action Required",exact:true}).click();
    await expect(page.getByRole("button",{name:"Open preview",exact:true})).toHaveCount(0);
    expect((await getConfig(request)).dashboard.titleEn).toBe(defaults().dashboard.titleEn);
    await category("Appearance"); await page.getByLabel("Primary accent",{exact:true}).selectOption("indigo"); await page.getByLabel("Card accent",{exact:true}).selectOption("green"); await page.getByLabel("Density",{exact:true}).selectOption("compact"); await page.getByLabel("Content width",{exact:true}).selectOption("wide");
    await category("Navigation & landing"); await page.getByRole("checkbox",{name:"Employees",exact:true}).uncheck();
    await category("Attention"); await page.getByLabel("Maximum visible items").fill("3"); await page.getByLabel("Alert display",{exact:true}).selectOption("compact");
    await save();
    await page.getByRole("link",{name:"View dashboard",exact:false}).click();
    await expect(page).toHaveURL(/\/opmanager$/);
    await expect(page.getByRole("heading",{level:1})).toHaveText("MOT Operations · My team");
    await page.locator(".nav-manager").click(); await category("Attention");
    await page.reload(); await expect(page.getByLabel("Maximum visible items")).toHaveValue("3");
    await category("Dashboard"); await expect(page.getByLabel("Dashboard title (English)",{exact:true})).toHaveValue("MOT Operations · My team");
    await expect(page.getByRole("button",{name:"Open preview",exact:true})).toHaveCount(0);
    await page.screenshot({path:path.join(evidence,"settings-after.png"),fullPage:true});
    await page.goto("/opmanager",{waitUntil:"networkidle"}); await expect(page.getByRole("heading",{level:1})).toHaveText("MOT Operations · My team");
    await expect(page.locator("[data-card]").first()).toHaveAttribute("data-card","bookings");
    await expect(page.locator('[data-section="assistant"]')).toHaveCount(0); await expect(page.locator('[data-card="team"]')).toHaveCount(0);
    await expect(page.locator("[data-section]").nth(1)).toHaveAttribute("data-section","attention");
    await expect(page.locator("[data-dashboard]")).toHaveAttribute("data-density","compact");
    expect(await page.locator("[data-dashboard]").evaluate(el => getComputedStyle(el).getPropertyValue("--ops-primary").trim())).toBe(await page.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue("--theme-primary").trim()));
    await page.getByRole("button",{name:"Expand navigation rail"}).click();
    await expect(page.getByRole("navigation",{name:"Operations menu"})).toBeVisible();
    await expect(page.getByRole("navigation",{name:"Operations menu"}).getByRole("link",{name:"Employees",exact:true})).toHaveCount(0);
    await page.keyboard.press("Escape");
    for (const legacy of ["manager","front","data","kitchen","kitchen-cashier","orders","payments"]) await expect(page.locator(`a[href="/${legacy}"], a[href^="/${legacy}?"]`)).toHaveCount(0);
    await page.screenshot({path:path.join(evidence,"dashboard-after.png"),fullPage:true});
    await page.goto("/operations?tab=employees"); await expect(page.locator(".employee-directory-picker")).toBeVisible();
    await page.goto("/opmanager/settings?category=appearance"); await page.getByRole("button",{name:"Reset category",exact:true}).click(); await save();
    expect((await getConfig(request)).appearance).toEqual(defaults().appearance); expect((await getConfig(request)).dashboard.titleEn).toBe("MOT Operations · My team");
    await page.locator("summary").filter({hasText:"Advanced options"}).click();
    page.once("dialog",dialog => dialog.dismiss()); await page.getByRole("button",{name:"Reset all UI preferences",exact:true}).click();
    expect((await getConfig(request)).dashboard.titleEn).toBe("MOT Operations · My team");
    page.once("dialog",dialog => dialog.accept()); await page.getByRole("button",{name:"Reset all UI preferences",exact:true}).click(); await save();
    expect(await getConfig(request)).toEqual(defaults());
    for (const name of ["Schedule, shifts & team","Evaluation & operating rules","Live template editors","Operations data"]) {
      await category(name); await expect(page.locator(".operations-settings-center .ops-settings-section").filter({visible:true}).first()).toBeVisible();
      await expect(page.locator(".operations-settings-center")).not.toContainText("Login required");
    }
    await page.goto("/opmanager",{waitUntil:"networkidle"}); await expect(page.locator("[data-card]")).toHaveCount(7); await expect(page.locator('[data-section="assistant"]')).toBeVisible();
    if (process.env.OPS_E2E_DESKTOP_ONLY !== '1') {
    await page.setViewportSize({width:390,height:844}); await page.goto("/opmanager/settings",{waitUntil:"networkidle"});
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    await page.screenshot({path:path.join(evidence,"settings-mobile-en.png"),fullPage:true});
    await page.evaluate(() => localStorage.setItem("bbLanguage","ar")); await page.reload();
    // Override the English test initialization for subsequent Arabic navigation.
    await page.addInitScript(() => localStorage.setItem("bbLanguage","ar")); await page.reload();
    await expect(page.locator("html")).toHaveAttribute("dir","rtl"); expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    await page.screenshot({path:path.join(evidence,"settings-mobile-ar.png"),fullPage:true});
    await page.goto("/opmanager",{waitUntil:"networkidle"}); expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390); await page.screenshot({path:path.join(evidence,"dashboard-mobile-ar.png"),fullPage:true});
    }
    expect(snapshot()).toEqual(before);
    expect(browserErrors).toEqual([]);
  } finally { await saveConfig(request,original); }
});

test("landing preferences resolve today and last-used module safely and keep direct dashboard available", async ({page,request}) => {
  test.setTimeout(90000);
  const original = await getConfig(request); const before = snapshot();
  try {
    const config = defaults(); config.landing.destination = "daily"; await saveConfig(request,config);
    const today = (await (await request.get("/api/operations/summary")).json()).today;
    for (const home of ["/","/login"]) { const res = await request.get(home,{maxRedirects:0}); expect(res.status()).toBe(307); expect(res.headers().location).toBe(`/operations/attendance?date=${today}`); }
    await page.goto("/operations?tab=roster&date=2026-09-29",{waitUntil:"networkidle"});
    config.landing.view = "last-used"; config.landing.date = "last-used"; await saveConfig(request,config);
    await page.goto("/"); await expect(page).toHaveURL(/\/operations\/daily\?date=2026-09-29$/);
    await page.goto("/opmanager"); await expect(page.getByRole("heading",{level:1})).toHaveText(defaults().dashboard.titleEn);
    await page.goto("/operations?tab=performance&section=hall"); await expect(page.getByRole("heading",{name:"Hall of Fame",level:1,exact:true})).toBeVisible();
    expect(snapshot()).toEqual(before);
  } finally { await saveConfig(request,original); }
});
