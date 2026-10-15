const {openDisclosure}=require("../layout/disclosures.cjs");
const { test, expect }=require("@playwright/test");
const { database,evidence }=require("./stabilization-helpers");
const endpoint="/api/operations/settings";
async function setting(request,key){const response=await request.get(endpoint+"?keys="+key);expect(response.ok()).toBeTruthy();return JSON.parse((await response.json()).settings[0].value);}
async function save(request,key,value){const response=await request.patch(endpoint,{data:{key,value:JSON.stringify(value)}});expect(response.ok(),await response.text()).toBeTruthy();}
test.beforeEach(async({page})=>{await page.addInitScript(()=>localStorage.setItem("bbLanguage","en"));await page.setViewportSize({width:1600,height:1050});});
test("roster editor previews unsaved changes and saves, reloads, resets and reverts explicitly",async({page,request})=>{
 test.setTimeout(120000);const key="DAILY_OPERATIONS_TEMPLATE_CONFIG",original=await setting(request,key);const errors=[];page.on("pageerror",error=>errors.push(error.message));
 try{
  await page.goto("/opmanager/settings?category=template",{waitUntil:"networkidle"});
  await expect(page.getByLabel("Title",{exact:true})).toBeVisible({timeout:30000});
  await openDisclosure(page,"Roster live preview");const preview=page.getByRole("complementary",{name:"Roster live preview"});await expect(preview.locator(".daily-operations-poster")).toBeVisible();
  await page.getByLabel("Title",{exact:true}).fill("OPERATIONS EDITOR UAT");await expect(preview.locator(".ops-brand h2")).toHaveText("OPERATIONS EDITOR UAT");expect(await setting(request,key)).toEqual(original);
  await preview.getByRole("button",{name:"Expand preview",exact:true}).click();await expect(page.getByRole("dialog").locator(".ops-brand h2")).toHaveText("OPERATIONS EDITOR UAT");await page.keyboard.press("Escape");await expect(page.getByLabel("Title",{exact:true})).toHaveValue("OPERATIONS EDITOR UAT");
  await page.getByLabel("AM",{exact:true}).fill("#ffe17a");await expect(preview.locator(".daily-operations-poster")).toHaveCSS("--ops-am","#ffe17a");
  await page.getByLabel("Subtitle",{exact:true}).fill("UAT preview subtitle");await expect(preview.locator(".ops-brand>div>span")).toHaveText("UAT preview subtitle");
  await page.getByLabel("Footer motto",{exact:true}).fill("UAT preview footer");await expect(preview.locator(".ops-footer>b")).toHaveText("UAT preview footer");
  await page.getByLabel("Default notes",{exact:true}).fill("UAT preview notes");await expect(preview.locator(".ops-default-notes")).toContainText("UAT preview notes");
  await page.getByRole("tab",{name:"Sections and phrases",exact:true}).click();
  await page.getByLabel("trips",{exact:true}).check();await page.getByLabel("birthdays",{exact:true}).check();
  await page.getByLabel("Card order",{exact:true}).fill("bracelets, offers, birthdays, trips");await expect(preview.locator(".ops-info-cards>article").first()).toHaveClass(/birthdays/);
  await page.getByLabel("Section order",{exact:true}).fill("notes, roster, leaves, footer");expect(await preview.locator(".ops-notes").evaluate(node=>Boolean(node.compareDocumentPosition(node.parentElement.querySelector(".ops-roster-scroll"))&Node.DOCUMENT_POSITION_FOLLOWING))).toBeTruthy();
  await page.getByLabel("trips",{exact:true}).uncheck();await expect(preview.locator(".ops-info-card.trips")).toHaveCount(0);await page.getByLabel("trips",{exact:true}).check();
  await page.getByRole("tab",{name:"Text and identity",exact:true}).click();
  await page.getByLabel("Date locale",{exact:true}).fill("invalid_locale");await expect(preview.getByRole("alert")).toContainText("Invalid date locale");await page.getByLabel("Date locale",{exact:true}).fill("en-US");await expect(preview.getByRole("alert")).toHaveCount(0);
  const saved=page.waitForResponse(response=>response.url().endsWith(endpoint)&&response.request().method()==="PATCH");await page.getByRole("button",{name:"Save template",exact:true}).click();expect((await saved).ok()).toBeTruthy();await expect(page.getByRole("status").filter({hasText:"Settings saved"})).toBeVisible();
  await page.reload({waitUntil:"networkidle"});await expect(page.getByLabel("Title",{exact:true})).toHaveValue("OPERATIONS EDITOR UAT");
  await page.getByRole("button",{name:"Reset design defaults",exact:true}).click();await expect(page.getByLabel("Title",{exact:true})).toHaveValue("DAILY OPERATIONS");expect((await setting(request,key)).title).toBe("OPERATIONS EDITOR UAT");
  await page.getByRole("button",{name:"Revert design changes",exact:true}).click();await expect(page.getByLabel("Title",{exact:true})).toHaveValue("OPERATIONS EDITOR UAT");
  expect(await page.getByLabel("Title",{exact:true}).evaluate(node=>{const container=node.closest('[class*="controls"]');return container.scrollWidth<=container.clientWidth+1;})).toBeTruthy();
  await page.locator("main").evaluate(node=>node.scrollTop=0);await page.screenshot({path:evidence("roster-editor-live-preview.png")});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBeTruthy();expect(errors).toEqual([]);
 }finally{await save(request,key,original);}
});
test("award editor previews every layout and preserves locked winners through save and reset",async({page,request})=>{
 test.setTimeout(120000);const key="RECOGNITION_ARTWORK_CONFIG",original=await setting(request,key);const winners=(await (await request.get("/api/operations/recognition?year=2026")).json()).winners;expect(winners.length).toBeGreaterThan(0);
 try{
  await page.goto("/opmanager/settings?category=recognition",{waitUntil:"networkidle"});await openDisclosure(page,"Award live preview");const preview=page.getByRole("complementary",{name:"Award live preview"});await expect(preview.locator(".eotm-name-ribbon")).toBeVisible();
  for(const variant of ["T01","T02","T03","T04","T05"]){await page.getByLabel("Default layout",{exact:true}).selectOption(variant);await expect(preview.locator(".eotm-master-artwork")).toHaveClass(new RegExp("eotm-"+variant.toLowerCase()));await page.screenshot({path:evidence("award-editor-"+variant+".png")});}
  expect(await setting(request,key)).toEqual(original);
  await page.getByLabel("Title line 1",{exact:true}).fill("UAT Employee");await expect(preview.locator(".eotm-master-title>b")).toHaveText("UAT Employee");
  const saved=page.waitForResponse(response=>response.url().endsWith(endpoint)&&response.request().method()==="PATCH");await page.getByRole("button",{name:"Save all recognition settings",exact:true}).click();expect((await saved).ok()).toBeTruthy();await expect(page.getByRole("status").filter({hasText:"Recognition artwork settings saved"})).toBeVisible();
  await page.reload({waitUntil:"networkidle"});await expect(page.getByLabel("Default layout",{exact:true})).toHaveValue("T05");
  const nav=page.getByRole('navigation',{name:'Settings categories'});
  await nav.locator('a[href="/opmanager/settings/live-editors/hall"]').click();await openDisclosure(page,"Award live preview");await expect(preview.locator(".hall-month-card")).toHaveCount(12);await expect(preview.locator(".hall-month-card>b").filter({hasText:"TBA"})).toHaveCount(12-winners.length);await page.getByRole("tab",{name:"Annual hall",exact:true}).click();await page.getByLabel("Hall title",{exact:true}).fill("UAT HALL");await expect(preview.locator(".hall-master-heading h2")).toHaveText("UAT HALL");
  await page.screenshot({path:evidence("hall-editor-live-preview.png")});
  await page.getByRole("button",{name:"Save all recognition settings",exact:true}).click();await expect(page.getByRole("status").filter({hasText:"Recognition artwork settings saved"})).toBeVisible();
  await nav.locator('a[href="/opmanager/settings/live-editors/monthly"]').click();await page.getByRole("tab",{name:"Monthly award",exact:true}).click();
  await page.getByRole("button",{name:"Reset design defaults",exact:true}).click();await expect(page.getByLabel("Default layout",{exact:true})).toHaveValue("T01");expect((await setting(request,key)).monthly.template).toBe("T05");
  await page.getByRole("button",{name:"Revert design changes",exact:true}).click();await expect(page.getByLabel("Default layout",{exact:true})).toHaveValue("T05");
  await page.goto("/operations?tab=performance&section=hall",{waitUntil:"networkidle"});await page.getByRole("button",{name:"View winner design",exact:true}).click();await expect(page.locator(".eotm-master-artwork")).toHaveClass(/eotm-t05/);
  expect((await (await request.get("/api/operations/recognition?year=2026")).json()).winners).toEqual(winners);
 }finally{await save(request,key,original);}
});
test("invalid editor values and audit failure cannot persist partial settings",async({request})=>{
 const key="DAILY_OPERATIONS_TEMPLATE_CONFIG",original=await setting(request,key);
 for(const [key,value]of [["DAILY_OPERATIONS_TEMPLATE_CONFIG",{weekdayLocale:"invalid_locale"}],["DAILY_OPERATIONS_TEMPLATE_CONFIG",{cardOrder:["trips","trips"]}],["RECOGNITION_ARTWORK_CONFIG",{monthly:{nameFontSize:999}}],["RECOGNITION_ARTWORK_CONFIG",{hall:{monthLabels:["Jan"]}}],["RECOGNITION_ARTWORK_CONFIG",{global:{logoUrl:"javascript:alert(1)"}}]]){expect((await request.patch(endpoint,{data:{key,value:JSON.stringify(value)}})).status()).toBe(400);}
 database(db=>db.exec("CREATE TRIGGER editor_audit_failure BEFORE INSERT ON AuditLog WHEN NEW.action='OPS_SETTING_UPDATED' BEGIN SELECT RAISE(ABORT,'isolated audit failure'); END"),true);
 try{expect((await request.patch(endpoint,{data:{key,value:JSON.stringify({...original,title:"Must roll back"})}})).status()).toBe(500);expect(await setting(request,key)).toEqual(original);}finally{database(db=>db.exec("DROP TRIGGER editor_audit_failure"),true);}
});
