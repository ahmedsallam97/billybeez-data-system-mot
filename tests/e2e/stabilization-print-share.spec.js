const {test,expect}=require("@playwright/test");
const fs=require("node:fs");const {PDFDocument}=require("pdf-lib");const {evidence}=require("./stabilization-helpers");
test.beforeEach(async({page})=>{await page.addInitScript(()=>localStorage.setItem("bbLanguage","en"));});
test("roster sharing captures real PNG, updates the owned WhatsApp tab date and reports blocked browser actions",async({page})=>{
 test.setTimeout(120000);await page.addInitScript(()=>{
  window.__shareUrls=[];window.__shareBytes=[];window.__openCount=0;window.__denyCopy=false;window.__blockPopup=false;
  class Item{constructor(items){this.items=items;}};Object.defineProperty(window,"ClipboardItem",{configurable:true,value:Item});
  Object.defineProperty(navigator,"clipboard",{configurable:true,value:{write:async items=>{if(window.__denyCopy)throw new DOMException("Permission denied","NotAllowedError");const blob=await items[0].items["image/png"];window.__shareBytes=Array.from(new Uint8Array(await blob.arrayBuffer()));}}});
  window.open=url=>{window.__openCount++;if(window.__blockPopup)return null;window.__shareUrls.push(url);let href=url;return {closed:false,focus(){},location:{get href(){return href;},set href(value){href=value;window.__shareUrls.push(value);}}};};
 });
 await page.goto("/operations/daily-preview?date=2026-09-29",{waitUntil:"networkidle"});await expect(page.locator(".daily-operations-poster")).toBeVisible();
 const share=page.getByRole("button",{name:"Copy & open WhatsApp",exact:true});await share.click();await expect(page.locator(".alert.success")).toContainText("Roster image copied");
 const png=Buffer.from(await page.evaluate(()=>window.__shareBytes));expect(png.subarray(0,8).toString("hex")).toBe("89504e470d0a1a0a");fs.writeFileSync(evidence("whatsapp-roster-2026-09-29.png"),png);
 await page.locator('input[type="date"]').fill("2026-09-30");await expect(share).toBeEnabled();await share.click();await expect(page.locator(".alert.success")).toContainText("Roster image copied");
 expect(await page.evaluate(()=>window.__openCount)).toBe(1);expect(decodeURIComponent(await page.evaluate(()=>window.__shareUrls.at(-1)))).toContain("2026-09-30");
 await page.evaluate(()=>{window.__denyCopy=true;});const download=page.waitForEvent("download");await share.click();const file=await download;expect(file.suggestedFilename()).toContain("2026-09-30");await expect(page.locator(".alert.success")).toContainText("clipboard copy was blocked");
 await page.reload({waitUntil:"networkidle"});await expect(share).toBeEnabled();await page.evaluate(()=>{window.__blockPopup=true;});await share.click();await expect(page.locator(".alert.danger")).toContainText("browser blocked WhatsApp");await page.screenshot({path:evidence("whatsapp-blocked-popup.png")});
});
test("all five award layouts and annual hall print as a single A4 page with saved winners",async({page,request})=>{
 test.setTimeout(180000);await page.setViewportSize({width:1440,height:1050});await page.goto("/operations?tab=performance&section=hall",{waitUntil:"networkidle"});await page.getByRole("button",{name:"View winner design",exact:true}).click();
 await page.evaluate(()=>{window.print=()=>{};});
 const preview=page.getByRole("dialog",{name:"Employee of the Month design",exact:true});
 for(const variant of ["T01","T02","T03","T04","T05"]){
  await preview.getByRole("button",{name:variant,exact:true}).click();await preview.getByRole("button",{name:"Print / Save PDF",exact:true}).click();await expect(page.locator("body")).toHaveAttribute("data-recognition-print","monthly");
  await page.emulateMedia({media:"print"});
  const bounds=await page.locator(".recognition-artwork").evaluate(node=>{const box=node.getBoundingClientRect();return {left:box.left,width:box.width,bodyWidth:document.body.getBoundingClientRect().width};});expect(bounds.left).toBeGreaterThanOrEqual(0);expect(bounds.width).toBeLessThanOrEqual(bounds.bodyWidth+1);
  const bytes=await page.pdf({preferCSSPageSize:true,printBackground:true,displayHeaderFooter:false});fs.writeFileSync(evidence("award-"+variant+"-a4.pdf"),bytes);const pdf=await PDFDocument.load(bytes);expect(pdf.getPageCount(),variant).toBe(1);expect(pdf.getPage(0).getWidth()).toBeCloseTo(595.28,0);expect(pdf.getPage(0).getHeight()).toBeCloseTo(841.89,0);fs.writeFileSync(evidence("award-"+variant+"-a4.pdf"),bytes);await page.evaluate(()=>window.dispatchEvent(new Event("afterprint")));await expect(page.locator("body")).not.toHaveAttribute("data-recognition-print");await page.emulateMedia({media:"screen"});
 }
 await preview.getByRole("button",{name:"Close",exact:true}).click();await page.getByRole("button",{name:"View Hall design",exact:true}).click();const hall=page.getByRole("dialog",{name:"Hall of Fame design",exact:true});await expect(hall.locator(".hall-month-card")).toHaveCount(12);
 const actual=(await (await request.get("/api/operations/recognition?year=2026")).json()).winners;await expect(hall.locator(".hall-month-card>b").filter({hasText:"TBA"})).toHaveCount(12-actual.length);
 await hall.getByRole("button",{name:"Print / Save PDF",exact:true}).click();await expect(page.locator("body")).toHaveAttribute("data-recognition-print","hall");await page.emulateMedia({media:"print"});await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(resolve)));const bytes=await page.pdf({preferCSSPageSize:true,printBackground:true,displayHeaderFooter:false});const pdf=await PDFDocument.load(bytes);expect(pdf.getPageCount()).toBe(1);expect(pdf.getPage(0).getWidth()).toBeCloseTo(595.28,0);expect(pdf.getPage(0).getHeight()).toBeCloseTo(841.89,0);fs.writeFileSync(evidence("hall-of-fame-a4.pdf"),bytes);await page.evaluate(()=>window.dispatchEvent(new Event("afterprint")));
});
