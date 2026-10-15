const {openDisclosure}=require('../layout/disclosures.cjs');
const {test,expect}=require("@playwright/test");
const {evidence}=require("./stabilization-helpers");
const endpoint="/api/operations/settings",key="RECOGNITION_ARTWORK_CONFIG";
async function settings(request){return JSON.parse((await (await request.get(endpoint+"?keys="+key)).json()).settings[0].value);}

test("employee photo framing previews, persists and applies to award and hall without altering winners",async({page,request})=>{
 test.setTimeout(120000);
 await page.addInitScript(()=>localStorage.setItem("bbLanguage","en"));await page.setViewportSize({width:1440,height:1000});
 const original=await settings(request),recognition=await (await request.get("/api/operations/recognition?year=2026")).json();
 const winner=recognition.currentWinner;expect(winner.employee.photoUrl).toBeTruthy();
 try{
  await page.goto("/opmanager/settings?category=recognition&employeeId="+winner.employee.id+"#employee-photo-framing",{waitUntil:"networkidle"});
  const editor=page.getByRole("region",{name:"Employee photo framing"}),photo=editor.locator("img");
  await expect(editor.getByLabel("Choose employee",{exact:true})).toHaveValue(winner.employee.id);await expect(photo).toBeVisible();await expect.poll(()=>photo.evaluate(node=>node.complete&&node.naturalWidth>0)).toBeTruthy();
  await editor.getByRole("button",{name:"Use template framing",exact:true}).click();
  await editor.getByLabel("Photo framing",{exact:true}).selectOption("contain");
  for(const label of ["Zoom","Horizontal position","Vertical position"]){await editor.getByLabel(label,{exact:true}).focus();for(let i=0;i<5;i++)await editor.getByLabel(label,{exact:true}).press(label==="Vertical position"?"ArrowLeft":"ArrowRight");}
  await expect(photo).toHaveCSS("object-fit","contain");expect(await photo.evaluate(node=>node.style.transform)).toBe("translate(5%, -5%) scale(1.25)");
  expect(await settings(request)).toEqual(original);
  const response=page.waitForResponse(response=>response.url().endsWith(endpoint)&&response.request().method()==="PATCH");await editor.getByRole("button",{name:"Save photo framing",exact:true}).click();expect((await response).ok()).toBeTruthy();
  await page.reload({waitUntil:"networkidle"});await expect(editor.getByLabel("Zoom",{exact:true})).toHaveValue("1.25");await expect(editor.getByLabel("Horizontal position",{exact:true})).toHaveValue("55");await expect(editor.getByLabel("Vertical position",{exact:true})).toHaveValue("45");
  await openDisclosure(page,"Award live preview");const preview=page.getByRole("complementary",{name:"Award live preview"});await expect(preview.locator(".eotm-master-photo img")).toHaveCSS("object-fit","contain");
  const spacing=await preview.locator(".eotm-master-title").evaluate(node=>{const first=node.querySelector("b").getBoundingClientRect(),second=node.querySelector("strong").getBoundingClientRect();return second.top-first.bottom;});expect(spacing).toBeGreaterThan(1);
  await editor.scrollIntoViewIfNeeded();await page.screenshot({path:evidence("employee-photo-framing.png")});
  await page.getByRole('navigation',{name:'Settings categories'}).locator('a[href="/opmanager/settings/live-editors/hall"]').click();await openDisclosure(page,"Award live preview");const hallPhoto=preview.locator('.hall-month-card img[src="'+winner.employee.photoUrl+'"]');expect(await hallPhoto.count()).toBeGreaterThan(0);await expect(hallPhoto.first()).toHaveCSS("object-fit","contain");
  const saved=await settings(request);for(const invalid of [{x:101,y:50,zoom:1,fit:"cover"},{x:50,y:50,zoom:0,fit:"cover"},{x:50,y:50,zoom:1,fit:"stretch"}])expect((await request.patch(endpoint,{data:{key,value:JSON.stringify({...saved,employeePhotoFrames:{[winner.employee.id]:invalid}})}})).status()).toBe(400);
  expect(await settings(request)).toEqual(saved);expect((await (await request.get("/api/operations/recognition?year=2026")).json()).winners).toEqual(recognition.winners);
 }finally{expect((await request.patch(endpoint,{data:{key,value:JSON.stringify(original)}})).ok()).toBeTruthy();}
});

test("monthly appraisals keep readable labels in the requested viewport scope",async({page})=>{
 await page.addInitScript(()=>localStorage.setItem("bbLanguage","en"));await page.setViewportSize(process.env.OPS_E2E_DESKTOP_ONLY==='1'?{width:1366,height:768}:{width:1100,height:900});await page.goto("/operations?tab=performance&year=2026&month=7",{waitUntil:"networkidle"});
 const table=page.locator(".performance-table");await expect(table.getByRole("cell",{name:"APPROVED",exact:true}).first()).toBeVisible();
 expect(await table.getByRole("cell",{name:"APPROVED",exact:true}).first().evaluate(node=>node.getBoundingClientRect().height)).toBeLessThan(100);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBeTruthy();
 await table.scrollIntoViewIfNeeded();await page.screenshot({path:evidence("appraisals-readable-laptop.png")});
 if(process.env.OPS_E2E_DESKTOP_ONLY!=='1'){await page.getByRole("button",{name:"Switch language"}).click();await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBeTruthy();await page.screenshot({path:evidence("appraisals-rtl-mobile.png")});}
});
