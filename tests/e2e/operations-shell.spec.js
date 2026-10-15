const {test,expect}=require("@playwright/test");
const {evidence}=require("./stabilization-helpers");
const {assertIsolatedEnvironment}=require("./isolation");

test("Operations icon rail stays separate from navbar, expands without overlays and supports RTL/mobile",async({page})=>{
 test.setTimeout(180000);assertIsolatedEnvironment();
 await page.addInitScript(()=>localStorage.setItem("bbLanguage","ar"));
 await page.setViewportSize({width:1440,height:1000});
 const errors=[],writes=[];page.on("pageerror",error=>errors.push(error.message));page.on("request",request=>{if(new URL(request.url()).pathname.startsWith("/api/")&&!["GET","HEAD"].includes(request.method()))writes.push(request.url());});
 for(const [name,url,ready] of [["dashboard","/opmanager","[data-dashboard]"],["employee-360","/operations?tab=employees",".employee360-head"],["monthly-schedule","/operations?tab=schedule",".schedule-grid-table"],["daily-operations","/operations?tab=roster&date=2026-09-29",".daily-operations-poster"]]){
  await page.goto(url,{waitUntil:"networkidle"});await expect(page.locator(ready).first()).toBeVisible();
  const rail=page.locator("#operations-navigation"),toggle=page.getByRole("button",{name:"توسيع شريط التنقل"});
  await expect(rail).toBeVisible();await expect(toggle).toHaveAttribute("aria-expanded","false");
  const collapsed=await rail.boundingBox(),main=await page.locator("main").boundingBox(),header=await page.locator(".topbar").boundingBox();
  expect(collapsed.width).toBeGreaterThanOrEqual(56);expect(collapsed.width).toBeLessThanOrEqual(72);expect(collapsed.x+collapsed.width).toBe(1440);expect(collapsed.y).toBe(0);expect(collapsed.height).toBe(1000);
  expect(main.x).toBe(0);expect(header.x).toBe(0);expect(main.width+collapsed.width).toBe(1440);
  await expect(page.locator(".topbar").getByRole("button",{name:/أقسام العمليات/})).toHaveCount(0);
  await expect(page.locator("#operations-navigation a[aria-current=page]")).toHaveCount(1);
  expect(await rail.locator("a b").first().isVisible()).toBe(false);
  await rail.getByRole("link",{name:"الموظفون",exact:true}).hover();await expect(page.getByRole("tooltip")).toHaveText("الموظفون");
  await page.mouse.move(500,100);await expect(page.getByRole("tooltip")).toHaveCount(0);
  await toggle.click();const expanded=await rail.boundingBox();expect(expanded.width).toBeGreaterThanOrEqual(220);expect(expanded.width).toBeLessThanOrEqual(260);expect((await page.locator("main").boundingBox()).x).toBe(0);
  await expect(page.locator("main")).not.toHaveAttribute("inert");await expect(page.getByRole("button",{name:"إغلاق قائمة العمليات"})).toHaveCount(0);
  await page.keyboard.press("Escape");await expect(toggle).toBeFocused();await expect(toggle).toHaveAttribute("aria-expanded","false");
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(1440);expect(await page.locator("main").evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBeTruthy();
  await page.screenshot({path:evidence(`rail-${name}-desktop-ar.png`)});
  if(name==="monthly-schedule"){
   const grid=page.locator(".schedule-grid-scroll").first();await expect(grid.locator("thead th").first()).toHaveCSS("position","sticky");await expect(grid.locator("tbody td").first()).toHaveCSS("position","sticky");
   const before=await grid.locator("tbody td").first().boundingBox();await grid.evaluate(el=>{el.scrollLeft=-500;el.scrollTop=100;});const after=await grid.locator("tbody td").first().boundingBox();expect(Math.abs(before.x-after.x)).toBeLessThanOrEqual(2);
   await page.evaluate(()=>document.body.dataset.monthlySchedulePrint="true");await page.emulateMedia({media:"print"});await expect(rail).toBeHidden();await expect(page.locator("main")).toHaveCSS("overflow","visible");await page.emulateMedia({media:"screen"});await page.evaluate(()=>delete document.body.dataset.monthlySchedulePrint);
  }
 }
 if(process.env.OPS_E2E_DESKTOP_ONLY==='1'){expect(errors).toEqual([]);expect(writes).toEqual([]);return;}
  await page.setViewportSize({width:390,height:844});await page.goto("/opmanager",{waitUntil:"networkidle"});await expect(page.locator("#operations-navigation")).toBeHidden();
 const mobileToggle=page.getByRole("button",{name:"☰ القائمة"});await mobileToggle.click();await expect(page.locator("#operations-navigation")).toBeVisible();
 await page.keyboard.press("Escape");await expect(mobileToggle).toBeFocused();await mobileToggle.click();await page.locator("#operations-navigation").getByRole("link",{name:"الجدول الشهري",exact:true}).click();
 await expect(page).toHaveURL(/tab=schedule/);await expect(page.locator("#operations-navigation")).toBeHidden();expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
 await page.screenshot({path:evidence("rail-schedule-mobile-ar.png")});expect(errors).toEqual([]);expect(writes).toEqual([]);
});

test("full-width monthly schedule live controls remain reachable in an isolated draft", async ({page,request}) => {
  test.setTimeout(90000); assertIsolatedEnvironment();
  await page.addInitScript(() => localStorage.setItem("bbLanguage","en")); await page.setViewportSize({width:1920,height:1080});
  await page.goto("/operations?tab=schedule",{waitUntil:"networkidle"});
  const current = await page.getByLabel("Schedule revision").inputValue();
  await expect(page.getByRole("button",{name:"Start live editing",exact:true})).toBeVisible();
  const response=page.waitForResponse(response=>response.url().endsWith("/api/operations/schedules")&&response.request().method()==="POST");
  await page.getByRole("button",{name:"Start live editing",exact:true}).click();
  const draftId=(await (await response).json()).schedule.id;
  await expect(page.getByLabel("Schedule revision")).toHaveValue(draftId);
  try {
    const cell = page.locator(".schedule-grid-table.is-editing tbody select").first(); await expect(cell).toBeVisible();
    await cell.focus(); await page.keyboard.press("Alt+ArrowDown"); await page.keyboard.press("Escape"); await expect(cell).toBeFocused();
    const box = await cell.boundingBox(); await expect(page.locator("#operations-navigation")).toBeVisible(); expect(box.x).toBeGreaterThanOrEqual(0); expect(box.x+box.width).toBeLessThanOrEqual(1920);
  } finally { expect((await request.post("/api/operations/schedules",{data:{action:"deleteDraft",scheduleId:draftId}})).ok()).toBeTruthy(); }
});
