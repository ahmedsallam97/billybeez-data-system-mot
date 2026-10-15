require('../e2e/account-fixtures').installLanguageFixture();
const { test, expect } = require("@playwright/test");
const { PrismaClient } = require("@prisma/client");
const { assertIsolatedEnvironment } = require("../e2e/isolation");
const { readConfig, KEY } = require("../../lib/accounts/service");
const { ROLE_NAMES, isOperationsRole } = require("../../lib/accounts/registry");
const sharp = require("sharp");
const fs = require("node:fs"),
  path = require("node:path");
test.beforeEach(async ({ page }) => {
  assertIsolatedEnvironment();
  await page.addInitScript(() => {
    localStorage.setItem("bbLanguage", "en");
  });
});
test("all five visible role templates enforce their configured grants through APIs and direct page URLs", async ({browser,page})=>{
 const roles=(await (await page.request.get('/api/access')).json()).roles;
 const checks=[['/api/operations/summary','dashboard.view'],['/api/operations/employees','employees.view'],['/api/operations/settings?keys=OPS_BRANCH_CONFIG','settings.view'],['/api/access','users.view'],['/api/operations/performance?section=eotm&year=2026&month=10','eom.view'],['/api/operations/daily?view=stock&date=2026-10-07','stock.view']];
 for(const name of ROLE_NAMES){
  const role=roles.find(role=>role.name===name);
  const response=await page.request.post('/api/access',{data:{kind:'user',name:'Template test '+name,username:'template-'+role.id,roleId:role.id,branches:['MOT'],dataScope:'BRANCH',temporaryPassword:'Template-Test-Password-2045',forcePasswordChange:false}});
  expect(response.status()).toBe(200);
  const account=(await response.json()).user;
  const client=await browser.newContext({baseURL:'http://127.0.0.1:3018'});
  try{
   expect((await client.request.post('/api/auth/login',{data:{username:account.username,password:'Template-Test-Password-2045'}})).status()).toBe(200);
   for(const [url,key] of checks){const result=await client.request.get(url);expect(result.status(),name+': '+key).toBe((key==='users.view'?account.permissions['users.view']||account.permissions['roles.view']||account.permissions['users.activity']:account.permissions[key])?200:403);}
   const ui=await client.newPage();
   await ui.goto('/opmanager/settings?category=access');
   if(!account.permissions['users.view'])await expect(ui).toHaveURL(/\/account\?denied=1/);
   else await expect(ui.getByRole('heading',{name:/Users & Access Management|المستخدمون وإدارة الوصول/}).last()).toBeVisible();
  }finally{await client.close();}
 }
});
test("management lists only Operations roles and permissions; hidden rows and hashes are preserved", async ({
  page,
}) => {
  const db = new PrismaClient();
  try {
    const before = await db.user.findMany({
      where: { role: { in: ["CASHIER", "KITCHEN", "DATA"] } },
      orderBy: { id: "asc" },
    });
    const hidden = (await readConfig(db)).config.roles.filter(
      (r) => !isOperationsRole(r),
    );
    const response = await page.request.get("/api/access");
    expect(response.status()).toBe(200);
    const data = await response.json();
    expect(data.roles.map((r) => r.name)).toEqual(ROLE_NAMES);
    expect(
      data.permissions.every((p) => !p.legacy && p.module !== "legacy"),
    ).toBe(true);
    expect(data.users.every((u) => ["ADMIN", "MANAGER"].includes(u.role))).toBe(
      true,
    );
    expect(
      data.roles.every((r) =>
        Object.keys(r.permissions).every((k) => k.includes(".")),
      ),
    ).toBe(true);
    for (const role of hidden) {
      const denied = await page.request.post("/api/access", {
        data: {
          kind: "role",
          id: role.id,
          name: "Forbidden change",
          permissions: {},
        },
      });
      expect(denied.status()).toBe(403);
    }
    for (const user of before) {
      const denied = await page.request.post("/api/access", {
        data: {
          kind: "user",
          confirmDestructive: true,
          id: user.id,
          name: "Forbidden change",
        },
      });
      expect(denied.status()).toBe(403);
    }
    expect(
      (
        await page.request.post("/api/access", {
          data: {
            kind: "role",
            name: "Injected POS",
            permissions: { ORDER_MANAGE: "ALL" },
          },
        })
      ).status(),
    ).toBe(400);
    expect(
      await db.user.findMany({
        where: { role: { in: ["CASHIER", "KITCHEN", "DATA"] } },
        orderBy: { id: "asc" },
      }),
    ).toEqual(before);
    expect(
      (await readConfig(db)).config.roles.filter((r) => !isOperationsRole(r)),
    ).toEqual(hidden);
    await page.goto("/opmanager/settings?category=access");
    await expect(
      page
        .getByRole("heading", {
          name: "Users & Access Management",
          exact: true,
        })
        .last(),
    ).toBeVisible();
    await page
      .getByRole("link", { name: "Roles & Permissions", exact: true })
      .click();
    await expect(page.getByLabel("Select role")).toBeVisible();
    expect(
      await page.getByLabel("Select role").locator("option").allTextContents(),
    ).toEqual(["Select role", ...ROLE_NAMES]);
    await page.getByLabel("Select role").selectOption("role-5");
    await expect(
      page.getByText("Effective permissions before saving", { exact: false }),
    ).toBeVisible();
    expect(
      await page.locator("details summary").allTextContents(),
    ).not.toContain("legacy");
  } finally {
    await db.$disconnect();
  }
});
test("restricted account: direct API denial, branch isolation, stale permissions and session revocation", async ({
  browser,
  page,
}) => {
  const roleResponse = await page.request.post("/api/access", {
    data: {
      kind: "role",
      name: "E2E Restricted Operations",
      permissions: {
        "employees.view": "BRANCH",
        "employees.details": "BRANCH",
        "employees.sensitive": "BRANCH",
      },
    },
  });
  expect(roleResponse.status()).toBe(200);
  const role = (await roleResponse.json()).role;
  const userResponse = await page.request.post("/api/access", {
    data: {
      kind: "user",
      confirmDestructive: true,
      name: "Restricted account",
      displayName: "Sallam",
      username: "account-e2e-restricted",
      roleId: role.id,
      branches: ["MOT"],
      dataScope: "BRANCH",
      temporaryPassword: "Temporary-E2E-2045",
      forcePasswordChange: false,
    },
  });
  expect(userResponse.status()).toBe(200);
  const user = (await userResponse.json()).user;
  const db = new PrismaClient();
  let inside, outside;
  try {
    inside = await db.employee.findFirst({
      where: { active: true, OR: [{ branch: "MOT" }, { branch: null }] },
    });
    outside = await db.employee.create({
      data: {
        name: "E2E outside access",
        department: "OPERATION",
        branch: "OUTSIDE",
      },
    });
  } finally {
    await db.$disconnect();
  }
  const context = await browser.newContext({
    baseURL: "http://127.0.0.1:3018",
  });
  try {
    expect(
      (
        await context.request.post("/api/auth/login", {
          data: { username: user.username, password: "Temporary-E2E-2045" },
        })
      ).status(),
    ).toBe(200);
    expect((await context.request.get("/api/access")).status()).toBe(403);
    expect(
      (await context.request.get("/api/operations/employees")).status(),
    ).toBe(200);
    const denied = await context.request.get(
      `/api/operations/employees/${outside.id}`,
    );
    expect([403, 404]).toContain(denied.status());
    expect(
      (
        await context.request.post("/api/operations/performance", {
          data: { action: "appraisalApprove", appraisalId: "missing" },
        })
      ).status(),
    ).toBe(403);
    const own = await context.request.patch("/api/account", {
      data: { displayName: "Restricted renamed", jobTitle: "Operator" },
    });
    expect(own.status()).toBe(200);
    expect(
      (
        await context.request.patch("/api/account", {
          data: { roleId: "role-1" },
        })
      ).status(),
    ).toBe(403);
    const restrictedPage = await context.newPage();
    await restrictedPage.addInitScript(() =>
      localStorage.setItem("bbLanguage", "en"),
    );
    await restrictedPage.goto("/opmanager/settings?category=access");
    await expect(restrictedPage).toHaveURL(/\/account\?denied=1/);
    await expect(
      restrictedPage.getByRole("link", {
        name: "Account Settings",
        exact: true,
      }),
    ).toHaveCount(0);
    expect(
      (
        await page.request.post("/api/access", {
          data: {
            kind: "user",
            confirmDestructive: true,
            id: user.id,
            overrides: { "employees.view": null },
          },
        })
      ).status(),
    ).toBe(200);
    expect(
      (await context.request.get("/api/operations/employees")).status(),
    ).toBe(403);
    expect(
      (
        await page.request.post("/api/access", {
          data: { kind: "revoke", id: user.id },
        })
      ).status(),
    ).toBe(200);
    expect((await context.request.get("/api/account")).status()).toBe(401);
  } finally {
    await context.close();
  }
});
test("temporary password, profile updates, navbar avatar and photo validation/removal", async ({
  browser,
  page,
}) => {
  const created = await page.request.post("/api/access", {
    data: {
      kind: "user",
      confirmDestructive: true,
      name: "Photo account",
      displayName: "Photo User",
      username: "account-e2e-photo",
      roleId: "role-5",
      branches: ["MOT"],
      temporaryPassword: "Temporary-Photo-2045",
      forcePasswordChange: true,
    },
  });
  expect(created.status()).toBe(200);
  const user = (await created.json()).user;
  const context = await browser.newContext({
    baseURL: "http://127.0.0.1:3018",
  });
  try {
    const signed = await context.request.post("/api/auth/login", {
      data: { username: user.username, password: "Temporary-Photo-2045" },
    });
    expect((await signed.json()).home).toBe("/account?section=password");
    expect(
      (await context.request.get("/api/operations/employees")).status(),
    ).toBe(428);
    expect(
      (
        await context.request.post("/api/account/password", {
          data: { currentPassword: "wrong", newPassword: "Changed-Photo-2045" },
        })
      ).status(),
    ).toBe(403);
    expect(
      (
        await context.request.post("/api/account/password", {
          data: {
            currentPassword: "Temporary-Photo-2045",
            newPassword: "Changed-Photo-2045",
          },
        })
      ).status(),
    ).toBe(200);
    const profilePage = await context.newPage();
    await profilePage.addInitScript(() =>
      localStorage.setItem("bbLanguage", "en"),
    );
    await profilePage.goto("/account");
    await profilePage
      .getByLabel("Display name", { exact: true })
      .fill("Photo updated");
    const saving = profilePage.waitForResponse(
      (r) =>
        r.url().endsWith("/api/account") && r.request().method() === "PATCH",
    );
    await profilePage
      .getByRole("button", { name: "Save profile", exact: true })
      .click();
    const saved = await saving;
    expect(saved.status()).toBe(200);
    expect((await saved.json()).user.profile.displayName).toBe("Photo updated");
    await expect(
      profilePage.locator(".navbar-profile .shell-profile-summary strong"),
    ).toHaveText("Photo updated");
    await expect(
      profilePage.locator(".navbar-profile .shell-profile-summary small"),
    ).toHaveText("Operation Supervisor");
    const buffer = await sharp({
      create: { width: 80, height: 80, channels: 3, background: "#ffbb22" },
    })
      .png()
      .toBuffer();
    const uploaded = await context.request.post(
      `/api/account/avatar/${user.id}`,
      {
        multipart: {
          file: { name: "avatar.png", mimeType: "image/png", buffer },
        },
      },
    );
    expect(uploaded.status()).toBe(200);
    const avatar = (await uploaded.json()).user.profile.avatar;
    expect(
      (await context.request.get(avatar.url)).headers()["content-type"],
    ).toBe("image/webp");
    await profilePage.reload();
    await expect(
      profilePage.locator(".navbar-profile .account-avatar img"),
    ).toBeVisible();
    const invalid = await context.request.post(
      `/api/account/avatar/${user.id}`,
      {
        multipart: {
          file: {
            name: "avatar.png",
            mimeType: "image/png",
            buffer: Buffer.from("bad"),
          },
        },
      },
    );
    expect(invalid.status()).toBe(400);
    expect(
      (await context.request.delete(`/api/account/avatar/${user.id}`)).status(),
    ).toBe(200);
    await profilePage.reload();
    await expect(
      profilePage.locator(".navbar-profile .account-avatar img"),
    ).toHaveCount(0);
    await expect(
      profilePage.locator(".navbar-profile .account-avatar"),
    ).not.toBeEmpty();
  } finally {
    await context.close();
  }
});
for (const language of ["ar", "en"])
  for (const theme of ["classic", "blue", "orange", "red"])
    test(`account layouts ${language} ${theme}: 1920 and 1366, profile keyboard and direction`, async ({
      page,
    }) => {
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.addInitScript(
        ({ language, theme }) => {
          localStorage.setItem("bbLanguage", language);
          localStorage.setItem("bbTheme", theme);
        },
        { language, theme },
      );
      for (const size of [
        { width: 1920, height: 1080 },
        { width: 1366, height: 768 },
      ]) {
        await page.setViewportSize(size);
        await page.goto("/account");
        await expect(page.locator("html")).toHaveAttribute(
          "dir",
          language === "ar" ? "rtl" : "ltr",
        );
        await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
        const profile = page.locator(".navbar-profile .shell-profile-trigger");
        await profile.click();
        const menu = page.locator("#shell-profile-menu");
        await expect(menu).toBeVisible();
        const box = await menu.boundingBox();
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(size.width);
        await page.keyboard.press("Escape");
        await expect(menu).toHaveCount(0);
        await expect(profile).toBeFocused();
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth > window.innerWidth + 1,
        );
        expect(overflow).toBe(false);
        await page.goto("/opmanager/settings?category=access");
        await expect(
          page
            .getByRole("heading", {
              name:
                language === "ar"
                  ? "المستخدمون وإدارة الوصول"
                  : "Users & Access Management",
              exact: true,
            })
            .last(),
        ).toBeVisible();
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth > window.innerWidth + 1,
          ),
        ).toBe(false);
      }
      expect(errors).toEqual([]);
    });

test("restricted Operations workspaces keep controls disabled and redact unrelated module data", async ({
  browser,
  page,
}) => {
  const response = await page.request.post("/api/access", {
    data: {
      kind: "role",
      name: "E2E Workspace Reader",
      permissions: Object.fromEntries(
        [
          "employees.view",
          "employees.details",
          "trips.view",
          "trips.details",
          "schedules.view",
          "attendance.view",
          "eom.view",
          "hall.view",
        ].map((key) => [key, "BRANCH"]),
      ),
    },
  });
  expect(response.status()).toBe(200);
  const role = (await response.json()).role;
  const created = await page.request.post("/api/access", {
    data: {
      kind: "user",
      name: "Workspace Reader",
      username: "account-workspace-reader",
      roleId: role.id,
      branches: ["MOT"],
      dataScope: "BRANCH",
      temporaryPassword: "Workspace-Reader-2045",
      forcePasswordChange: false,
    },
  });
  expect(created.status()).toBe(200);
  const client = await browser.newContext({ baseURL: "http://127.0.0.1:3018" });
  try {
    expect(
      (
        await client.request.post("/api/auth/login", {
          data: {
            username: "account-workspace-reader",
            password: "Workspace-Reader-2045",
          },
        })
      ).status(),
    ).toBe(200);
    const staff = (
      await (await client.request.get("/api/operations/employees")).json()
    ).employees;
    expect(staff.length).toBeGreaterThan(0);
    const id = staff[0].id;
    const employee = await client.request.get(
      `/api/operations/employees/${id}/360`,
    );
    expect(employee.status()).toBe(200);
    const data = (await employee.json()).employee;
    expect(data.nationalId).toBeUndefined();
    expect(data.documents).toEqual([]);
    expect(data.monthlyAppraisals).toEqual([]);
    expect(data.trainingRecords).toEqual([]);
    const daily = await client.request.get(
      "/api/operations/daily?view=trips&date=2026-10-07",
    );
    expect(daily.status()).toBe(200);
    const composite = await daily.json();
    expect(composite.events).toEqual([]);
    expect(composite.wristbands).toEqual([]);
    expect(
      (
        await client.request.post("/api/operations/daily", {
          data: { action: "createTrip", date: "2026-10-07", name: "Forbidden" },
        })
      ).status(),
    ).toBe(403);
    expect(
      (
        await client.request.patch(`/api/operations/employees/${id}`, {
          data: { operationalName: "Forbidden" },
        })
      ).status(),
    ).toBe(403);
    expect(
      (
        await client.request.get(
          `/api/operations/employees/${id}/complete-file`,
        )
      ).status(),
    ).toBe(403);
    const ui = await client.newPage(),
      errors = [];
    ui.on("pageerror", (e) => errors.push(e.message));
    await ui.addInitScript(() => localStorage.setItem("bbLanguage", "en"));
    await ui.setViewportSize({ width: 1366, height: 768 });
    await ui.goto("/operations?tab=trips");
    await expect(
      ui.getByRole("button", { name: "Save trip", exact: true, includeHidden:true }),
    ).toBeDisabled();
    await ui.goto(`/operations?tab=employees&employeeId=${id}`);
    await expect(ui.locator(".employee360-identity h2")).toBeVisible();
    await expect(
      ui.getByRole("button", { name: "Personal", exact: true }),
    ).toHaveCount(0);
    await expect(
      ui.getByRole("button", { name: "Print Profile", exact: true }),
    ).toBeDisabled();
    await ui.goto("/operations?tab=performance&section=eotm");
    await expect(
      ui.getByRole("heading", { name: "Employee of the Month", exact: true }),
    ).toBeVisible();
    await expect(
      ui.getByRole("heading", { name: "Monthly Appraisal", exact: true }),
    ).toHaveCount(0);
    expect(errors).toEqual([]);
  } finally {
    await client.close();
  }
});
test('Arabic permission editor is discoverable, searchable and saves role grants without technical labels', async ({ page }) => {
  const roleResponse = await page.request.post('/api/access', { data: { kind: 'role', name: 'Arabic UI permission fixture', permissions: { 'employees.view': 'BRANCH' } } });
  expect(roleResponse.status()).toBe(200);
  const role = (await roleResponse.json()).role;
  await page.addInitScript(() => localStorage.setItem('bbLanguage', 'ar'));
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('/opmanager/settings?category=access');
  await page.getByRole('tab', { name: 'الأدوار والصلاحيات', exact: true }).click();
  await page.getByLabel('Select role').selectOption(role.id);
  await page.getByRole('button', { name: 'تعديل الصلاحيات', exact: true }).click();
  await expect(page.locator('[data-permission-editor]')).toBeFocused();
  await page.getByRole('textbox', { name: 'بحث عن وحدة أو صلاحية' }).fill('حذف');
  const grant = page.getByRole('checkbox', { name: 'الموظفون وملفاتهم — حذف أو أرشفة', exact: true });
  await expect(grant).toBeVisible(); await expect(grant).toBeEnabled(); await grant.check();
  await expect(page.getByText('تغييرات غير محفوظة', { exact: true })).toBeVisible();
  const summary = page.locator('section').filter({ has: page.getByRole('heading', { name: /ملخص الصلاحيات الفعلية قبل الحفظ/ }) }).last();
  await summary.locator('details > summary').click();
  expect(await summary.textContent()).not.toContain('employees.archive');
  expect(await summary.evaluate(el => el.scrollHeight > el.clientHeight + 2)).toBe(false);
  const employeeSummary = summary.locator('section').filter({ has: page.getByRole('heading', { name: 'الموظفون وملفاتهم', exact: true }) });
  await employeeSummary.getByRole('button', { name: 'تعديل', exact: true }).click();
  await expect(page.locator('details[data-permission-module="employees"]')).toHaveAttribute('open', '');
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'مراجعة وحفظ الدور', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'تم الحفظ' })).toBeVisible();
  const saved = (await (await page.request.get('/api/access')).json()).roles.find(item => item.id === role.id);
  expect(saved.permissions['employees.archive']).toBe('BRANCH');
  await page.getByLabel('Select role').selectOption('role-1');
  await page.getByRole('textbox', { name: 'بحث عن وحدة أو صلاحية' }).fill('إدارة الحسابات');
  await page.getByRole('checkbox', { name: 'إدارة الحسابات — تعديل', exact: true }).uncheck();
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'مراجعة وحفظ الدور', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'لم يُحفظ التغيير لأنه يزيل وصولك' })).toBeVisible();
  const protectedRole = (await (await page.request.get('/api/access')).json()).roles.find(item => item.id === 'role-1');
  expect(protectedRole.permissions['users.edit']).toBe('ALL');
});

test('password-confirmed employee removal deletes empty records, archives history and restores without losing documents', async ({ browser, page }) => {
  const db = new PrismaClient(), password = 'Employee-Removal-Pilot-2026';
  const created = await page.request.post('/api/access', { data: { kind: 'user', name: 'Removal browser admin', username: 'removal-browser-admin', roleId: 'role-1', branches: ['MOT'], dataScope: 'BRANCH', temporaryPassword: password, forcePasswordChange: false, preferredLanguage: 'ar' } });
  expect(created.status()).toBe(200);
  const account = (await created.json()).user;
  const client = await browser.newContext({ baseURL: 'http://127.0.0.1:3018' });
  try {
    const empty = await db.employee.create({ data: { name: 'Removal Browser Empty', branch: 'MOT', active: false, employmentStatus: 'INACTIVE' } });
    const history = await db.employee.create({ data: { name: 'Removal Browser History', branch: 'MOT', active: false, employmentStatus: 'EXITED' } });
    const document = await db.employeeDocument.create({ data: { employeeId: history.id, documentType: 'OTHER', displayName: 'Preserved removal evidence', storageKey: 'removal-browser-evidence.txt', mimeType: 'text/plain', sizeBytes: 4 } });
    expect((await client.request.post('/api/auth/login', { data: { username: account.username, password } })).status()).toBe(200);
    const ui = await client.newPage(); await ui.setViewportSize({ width: 1366, height: 768 });
    await ui.goto(`/operations?tab=employees&employeeId=${empty.id}`);
    await ui.getByRole('button', { name: 'حذف الموظف', exact: true }).click();
    const modal = ui.getByRole('dialog', { name: 'حذف الموظف', exact: true });
    await modal.getByLabel('كلمة مرور حسابك الحالي').fill('wrong');
    await modal.getByRole('button', { name: 'تأكيد الحذف', exact: true }).click();
    await expect(modal.getByRole('alert')).toHaveText('كلمة مرور حسابك غير صحيحة');
    expect(await db.employee.findUnique({ where: { id: empty.id } })).not.toBeNull();
    await modal.getByLabel('كلمة مرور حسابك الحالي').fill(password);
    await modal.getByRole('button', { name: 'تأكيد الحذف', exact: true }).click();
    await expect(ui.getByRole('status').filter({ hasText: 'تم حذف الموظف' })).toBeVisible();
    expect(await db.employee.findUnique({ where: { id: empty.id } })).toBeNull();
    await ui.goto(`/operations?tab=employees&employeeId=${history.id}`);
    await ui.getByRole('button', { name: 'حذف الموظف', exact: true }).click();
    await modal.getByLabel('كلمة مرور حسابك الحالي').fill(password);
    await modal.getByRole('button', { name: 'تأكيد الحذف', exact: true }).click();
    await expect(ui.getByRole('status').filter({ hasText: 'تمت أرشفة الموظف' })).toBeVisible();
    const directory = (await (await client.request.get('/api/operations/employees')).json()).employees;
    expect(directory.some(employee => employee.id === history.id)).toBe(false);
    expect(await db.employeeDocument.findUnique({ where: { id: document.id } })).not.toBeNull();
    await ui.getByRole('combobox', { name: 'كل الحالات', exact: true }).selectOption('ARCHIVED');
    await ui.getByRole('combobox', { name: 'اختيار الموظف', exact: true }).selectOption(history.id);
    await ui.getByRole('button', { name: 'استعادة الموظف', exact: true }).click();
    const restore = ui.getByRole('dialog', { name: 'استعادة الموظف', exact: true });
    await restore.getByLabel('كلمة مرور حسابك الحالي').fill(password);
    await restore.getByRole('button', { name: 'تأكيد الاستعادة', exact: true }).click();
    await expect(ui.getByRole('status').filter({ hasText: 'تمت استعادة الموظف' })).toBeVisible();
    expect((await db.employee.findUnique({ where: { id: history.id } })).employmentStatus).toBe('EXITED');
    const logs = await db.auditLog.findMany({ where: { userId: account.id, action: { startsWith: 'OPS_EMPLOYEE_' } } });
    expect(logs).toHaveLength(3); expect(logs.every(log => !log.metadata.includes(password))).toBe(true);
  } finally { await client.close(); await db.$disconnect(); }
});
