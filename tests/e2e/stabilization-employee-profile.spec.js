const {test,expect}=require("@playwright/test");
const {evidence,roleState}=require("./stabilization-helpers");
const fs=require("node:fs");
const {PDFDocument}=require("pdf-lib");

test("Employee 360 redesigned sections show real records without clipping in desktop mobile and RTL",async({page,request})=>{
  test.setTimeout(120000);
  const errors=[];page.on("pageerror",error=>errors.push(error.message));
  await page.addInitScript(()=>localStorage.setItem("bbLanguage","en"));
  await page.setViewportSize({width:1440,height:1050});
  await page.goto("/operations?tab=employees",{waitUntil:"networkidle"});
  await expect(page.locator(".employee360-identity h2")).toBeVisible();
  const id=await page.getByLabel("Select employee",{exact:true}).inputValue();
  const employee=(await (await request.get(`/api/operations/employees/${id}/360`)).json()).employee;
  await expect(page.locator(".employee360-identity h2")).toHaveText(employee.name);
  const nav=page.getByRole("navigation",{name:"Employee file sections"});
  expect(await nav.evaluate(node=>node.scrollHeight<=node.clientHeight+1)).toBeTruthy();
  for(const tab of ["Overview","Personal","Employment","Documents","Schedule & Attendance","Leaves & Balances","Performance","Training & Qualifications","Recognition","Timeline","Files"]){
    await nav.getByRole("button",{name:tab,exact:true}).click();
    await page.screenshot({path:evidence(`employee360-${tab.toLowerCase().replaceAll(/[^a-z]+/g,"-")}.png`),fullPage:true});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),tab).toBeTruthy();
  }
  await nav.getByRole("button",{name:"Overview",exact:true}).click();
  if(process.env.OPS_E2E_DESKTOP_ONLY==='1')return;
  await page.setViewportSize({width:390,height:844});
  await expect(page.getByLabel("Employee file section",{exact:true})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBeTruthy();
  await page.screenshot({path:evidence("employee360-mobile.png"),fullPage:true});
  await page.addInitScript(()=>localStorage.setItem("bbLanguage","ar"));await page.reload({waitUntil:"networkidle"});
  await expect(page.locator("html")).toHaveAttribute("dir","rtl");
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBeTruthy();
  await page.screenshot({path:evidence("employee360-mobile-rtl.png"),fullPage:true});
  expect(errors).toEqual([]);
});

test("Employee profile preview and download use the same A4 report and enforce modes and permissions",async({page,request,playwright})=>{
  test.setTimeout(120000);
  await page.addInitScript(()=>localStorage.setItem("bbLanguage","en"));
  await page.goto("/operations?tab=employees",{waitUntil:"networkidle"});
  await expect(page.locator(".employee360-identity h2")).toBeVisible();
  const id=await page.getByLabel("Select employee",{exact:true}).inputValue();
  const today=new Date().toISOString().slice(0,10),year=today.slice(0,4),base=`/api/operations/employees/${id}/complete-file?year=${year}&endDate=${today}&attachments=0`;
  for(const language of ["en","ar"]){const response=await request.get(`${base}&language=${language}&mode=STANDARD`);expect(response.ok(),await response.text().then(()=>String(response.status()))).toBeTruthy();const bytes=await response.body();const pdf=await PDFDocument.load(bytes);expect(pdf.getPageCount()).toBe(2);for(const p of pdf.getPages()){expect(p.getWidth()).toBeCloseTo(595.28,1);expect(p.getHeight()).toBeCloseTo(841.89,1);}fs.writeFileSync(evidence(`employee-profile-standard-${language}.pdf`),bytes);}
  const response=await request.get(`${base}&mode=FULL_RESTRICTED&language=en`);expect(response.ok()).toBeTruthy();fs.writeFileSync(evidence("employee-profile-restricted-en.pdf"),await response.body());
  expect((await request.get(`${base}&mode=invalid`)).status()).toBe(400);
  const custom=await request.get(`${base}&mode=CUSTOM&sections=Personal`);expect(custom.ok()).toBeTruthy();expect((await PDFDocument.load(await custom.body())).getPageCount()).toBe(1);
  expect((await request.get(`/api/operations/employees/${id}/complete-file?year=invalid`)).status()).toBe(400);
  expect((await request.get(`${base}&mode=CUSTOM&sections=secret`)).status()).toBe(400);
  expect((await request.get(`/api/operations/employees/${id}/complete-file?year=2026&endDate=2026-02-30`)).status()).toBe(400);
  const denied=await playwright.request.newContext({baseURL:"http://127.0.0.1:3018",storageState:roleState("CASHIER")});try{expect((await denied.get(base)).status()).toBe(403);}finally{await denied.dispose();}
  const previewRequest=page.waitForResponse(response=>response.url().includes("/complete-file?")&&response.url().includes("inline=1"));
  await page.getByRole("button",{name:"Print Profile",exact:true}).click();expect((await previewRequest).ok()).toBeTruthy();
  await expect(page.getByTitle("Employee profile PDF")).toHaveAttribute("src",/^blob:/);
  const previewUrl=await page.getByTitle("Employee profile PDF").getAttribute("src");
  await expect(page.getByRole("link",{name:"Download profile PDF",exact:true})).toHaveAttribute("href",previewUrl);
  const previewBytes=Buffer.from(await page.evaluate(async url=>Array.from(new Uint8Array(await (await fetch(url)).arrayBuffer())),previewUrl));
  const download=page.waitForEvent("download");await page.getByRole("link",{name:"Download profile PDF",exact:true}).click();const file=await download;const path=await file.path();expect(fs.readFileSync(path)).toEqual(previewBytes);
  await page.screenshot({path:evidence("employee-profile-print-preview.png")});
  await page.getByRole("button",{name:"Close preview"}).click();await expect(page.getByTitle("Employee profile PDF")).toHaveCount(0);
});


test("Employee 360 forms save once, validate real dates and roll back when audit storage fails",async({page,request})=>{
 test.setTimeout(120000);
 const {database}=require("./stabilization-helpers");
 await page.addInitScript(()=>localStorage.setItem("bbLanguage","en"));
 await page.goto("/operations?tab=employees",{waitUntil:"networkidle"});await expect(page.locator(".employee360-identity h2")).toBeVisible();
 const id=await page.getByLabel("Select employee",{exact:true}).inputValue(),endpoint="/api/operations/employees/"+id+"/360";
 const original=(await (await request.get(endpoint)).json()).employee;
 const nav=page.getByRole("navigation",{name:"Employee file sections"}), content=page.locator(".employee360-content");
 const position=original.operationalPositions.find(item=>item.requiresQualification);
 let posts=0;
 await page.route("**/employees/"+id+"/360",async route=>{if(route.request().method()==="POST"){posts++;await new Promise(resolve=>setTimeout(resolve,300));}await route.continue();});
 try {
  await nav.getByRole("button",{name:"Personal",exact:true}).click();await content.getByLabel("Phone",{exact:true}).fill("01000000999");await content.getByRole("button",{name:"Save personal details"}).click();await expect(page.getByRole("status").filter({hasText:"Employee record saved."})).toBeVisible();expect((await (await request.get(endpoint)).json()).employee.phone).toBe("01000000999");
  await nav.getByRole("button",{name:"Employment",exact:true}).click();await content.getByLabel("Employment event type").selectOption("OTHER");await content.getByLabel("New value",{exact:true}).fill("UAT historical note");await content.getByLabel("Apply to current employment profile").uncheck();await content.getByRole("button",{name:"Add employment event"}).click();await expect(content.getByRole("cell",{name:"UAT historical note",exact:true})).toBeVisible();
  await nav.getByRole("button",{name:"Training & Qualifications",exact:true}).click();const training=content.locator("section").filter({has:page.getByRole("heading",{name:"Add training record",exact:true})});await training.getByLabel("Training name").fill("UAT training save");await training.getByLabel("Completed",{exact:true}).fill("2026-10-01");
  const count=posts;const button=training.getByRole("button",{name:"Add training",exact:true});await button.evaluate(node=>{node.click();node.click();});await expect(content.getByRole("cell",{name:"UAT training save",exact:true})).toBeVisible();expect(posts-count).toBe(1);
  const qualification=content.locator("section").filter({has:page.getByRole("heading",{name:"Update operational qualification",exact:true})});await qualification.getByLabel("Operational position").selectOption(position.id);await qualification.getByLabel("Record status").selectOption("TRAINING");await qualification.getByRole("button",{name:"Save qualification"}).click();await expect.poll(async()=>((await (await request.get(endpoint)).json()).employee.qualifications.find(item=>item.operationalPositionId===position.id)?.status)).toBe("TRAINING");
  await page.reload({waitUntil:"networkidle"});await nav.getByRole("button",{name:"Training & Qualifications",exact:true}).click();await expect(content.getByRole("cell",{name:"UAT training save",exact:true})).toBeVisible();
  expect((await request.post(endpoint,{data:"{",headers:{"content-type":"application/json"}})).status()).toBe(400);
  for(const data of [{action:"training",name:"Invalid",completedDate:"2026-02-30"},{action:"training",name:"Invalid",status:"UNSUPPORTED"},{action:"qualification",operationalPositionId:position.id,effectiveDate:"2026-10-02",expiryDate:"2026-10-01"},{action:"employmentEvent",eventType:"FAKE",effectiveDate:"2026-10-01",newValue:"Invalid"}])expect((await request.post(endpoint,{data})).status()).toBe(400);
  database(db=>db.exec("CREATE TRIGGER profile_audit_failure BEFORE INSERT ON AuditLog WHEN NEW.action='OPS_EMPLOYEE_TRAINING_RECORDED' BEGIN SELECT RAISE(ABORT,'isolated audit failure'); END"),true);
  try{expect((await request.post(endpoint,{data:{action:"training",name:"Must roll back"}})).status()).toBe(500);expect(database(db=>db.prepare("SELECT COUNT(*) AS n FROM EmployeeTrainingRecord WHERE employeeId=? AND name='Must roll back'").get(id).n)).toBe(0);}finally{database(db=>db.exec("DROP TRIGGER profile_audit_failure"),true);}
 } finally {
  await request.patch("/api/operations/employees/"+id,{data:{phone:original.phone||""}});
  database(db=>{db.prepare("DELETE FROM EmployeeTrainingRecord WHERE employeeId=? AND name='UAT training save'").run(id);db.prepare("DELETE FROM EmployeeEmploymentEvent WHERE employeeId=? AND newValue='UAT historical note'").run(id);},true);
  const old=original.qualifications.find(item=>item.operationalPositionId===position.id);
  if(old)await request.post(endpoint,{data:{action:"qualification",operationalPositionId:position.id,status:old.status,effectiveDate:old.effectiveDate?.slice(0,10)||"",expiryDate:old.expiryDate?.slice(0,10)||"",notes:old.notes||""}});
  else database(db=>db.prepare("DELETE FROM EmployeeQualification WHERE employeeId=? AND operationalPositionId=?").run(id,position.id),true);
 }
});
