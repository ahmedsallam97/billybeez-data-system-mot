const { test, expect } = require("@playwright/test");
const fs = require("node:fs");
const path = require("node:path");
const { PDFDocument } = require("pdf-lib");
const { database, roleState, evidence, files, imageFixtures, storageRoot } = require("./stabilization-helpers");
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=","base64");
const employee = () => database(db => db.prepare("SELECT id,name FROM Employee WHERE active=1 ORDER BY name LIMIT 1").get());
const url = id => `/api/operations/employees/${id}/documents`;
async function upload(request,id,fields={}) { return request.post(url(id),{multipart:{employeeId:id,documentType:"OTHER",file:{name:"proof.png",mimeType:"image/png",buffer:PNG},...fields}}); }

test.beforeEach(async ({page}) => { await page.addInitScript(() => localStorage.setItem("bbLanguage","en")); });

test("protected upload supports Arabic filenames and duplicate physical names", async ({request}) => {
  const target = employee(); const before = files();
  const first = await upload(request,target.id,{displayName:'عقد الموظف "نسخة" #1.png',notes:"UAT filename",issueDate:"2026-01-01",expiryDate:"2027-01-01"});
  expect(first.status()).toBe(200); const doc=(await first.json()).document;
  const duplicate = await upload(request,target.id,{displayName:"Duplicate filename"}); expect(duplicate.ok()).toBeTruthy(); const second=(await duplicate.json()).document;
  expect(doc.storageKey).not.toBe(second.storageKey); expect(files().length).toBe(before.length+2);
  expect(fs.readFileSync(path.join(process.env.EMPLOYEE_FILE_STORAGE_ROOT,doc.storageKey))).toEqual(PNG);
  expect(doc.uploadedBy).toBeTruthy(); expect(doc.notes).toBe("UAT filename"); expect(doc.issueDate).toContain("2026-01-01");
  for (const suffix of ["","?download=1"]) {
    const viewed = await request.get(`${url(target.id)}/${doc.id}${suffix}`);
    expect(viewed.status()).toBe(200); expect(await viewed.body()).toEqual(PNG);
    expect(viewed.headers()["content-disposition"]).toContain("filename*=UTF-8''");
    expect(viewed.headers()["cache-control"]).toContain("no-store"); expect(viewed.headers()["x-content-type-options"]).toBe("nosniff");
  }
  expect((await request.delete(`${url(target.id)}/${doc.id}`)).ok()).toBeTruthy();
  expect((await request.get(`${url(target.id)}/${doc.id}`)).status()).toBe(404);
  expect(database(db => db.prepare("SELECT status FROM EmployeeDocument WHERE id=?").get(doc.id)).status).toBe("REMOVED");
});

test("upload validation rejects malformed metadata, spoofed MIME, oversized files and unauthorized roles without writes", async ({request,playwright}) => {
  const target=employee(); const before=files(); const count=database(db => db.prepare("SELECT count(*) n FROM EmployeeDocument").get().n);
  for (const fields of [
    {issueDate:"invalid"},{issueDate:"2026-02-30"},{issueDate:"2026-05-01",expiryDate:"2026-01-01"},{documentType:"UNKNOWN"},
    {file:{name:"fake.png",mimeType:"image/png",buffer:Buffer.from("not a PNG")}},
    {file:{name:"unsupported.txt",mimeType:"text/plain",buffer:Buffer.from("text")}},
    {file:{name:"large.png",mimeType:"image/png",buffer:Buffer.concat([PNG,Buffer.alloc(8*1024*1024)])}},
  ]) { const res=await upload(request,target.id,fields); expect.soft(res.status(),JSON.stringify(Object.keys(fields))).toBe(400); }
  expect(files()).toEqual(before); expect(database(db => db.prepare("SELECT count(*) n FROM EmployeeDocument").get().n)).toBe(count);
  for (const role of [null,"DATA","CASHIER","KITCHEN"]) {
    const client=await playwright.request.newContext({baseURL:"http://127.0.0.1:3018",storageState:role?roleState(role):{cookies:[],origins:[]}});
    try { expect((await upload(client,target.id)).status()).toBe(role?403:401); } finally { await client.dispose(); }
  }
});

test("failed upload database transaction retains the old photo and removes the new physical file", async ({request}) => {
  const target=employee(); const beforeFiles=files(); const beforeDocs=database(db => db.prepare("SELECT * FROM EmployeeDocument WHERE employeeId=? ORDER BY id").all(target.id));
  database(db => db.exec("CREATE TRIGGER uat_reject_upload BEFORE INSERT ON EmployeeDocument WHEN NEW.displayName='UAT forced DB failure' BEGIN SELECT RAISE(ABORT,'UAT injected database failure'); END"),true);
  try {
    const res=await upload(request,target.id,{documentType:"EMPLOYEE_PHOTO",displayName:"UAT forced DB failure"});
    expect.soft(res.status()).toBe(500); expect.soft(res.headers()["content-type"] || "").toContain("application/json");
    expect(files()).toEqual(beforeFiles);
    expect(database(db => db.prepare("SELECT * FROM EmployeeDocument WHERE employeeId=? ORDER BY id").all(target.id))).toEqual(beforeDocs);
  } finally { database(db => db.exec("DROP TRIGGER IF EXISTS uat_reject_upload"),true); }
});

test("failed physical write creates no metadata", async ({request}) => {
  const target=employee(); const root=storageRoot(); const directory=path.resolve(root,target.id); const held=path.resolve(root,`${target.id}-uat-held`);
  if(!directory.startsWith(root+path.sep)||!held.startsWith(root+path.sep)) throw new Error("Invalid fixture employee path");
  const before=database(db => db.prepare("SELECT * FROM EmployeeDocument ORDER BY id").all()); const existed=fs.existsSync(directory);
  if (existed) fs.renameSync(directory,held); fs.writeFileSync(directory,"UAT storage failure fixture");
  try {
    const res=await upload(request,target.id); expect(res.status()).toBe(500); expect(res.headers()["content-type"]).toContain("application/json");
    expect(database(db => db.prepare("SELECT * FROM EmployeeDocument ORDER BY id").all())).toEqual(before);
  } finally { fs.unlinkSync(directory); if(existed) fs.renameSync(held,directory); }
});

test("Employee 360 uploads JPG PNG WebP and PDF through the UI, replaces photos, reloads and removes", async ({page,request}) => {
  test.setTimeout(180000);
  const target=employee(); const oldPhotos=database(db => db.prepare("SELECT id,status FROM EmployeeDocument WHERE employeeId=? AND documentType='EMPLOYEE_PHOTO'").all(target.id));
  const originals=new Set(oldPhotos.map(doc => doc.id)); const errors=[]; page.on("pageerror",error=>errors.push(error.message));
  await page.goto("/operations?tab=employees",{waitUntil:"networkidle"}); await page.locator(".employee-directory-picker").selectOption(target.id);
  await expect(page.locator(".employee360-head h2")).toHaveText(target.name);
  const images=await imageFixtures(page); const pdf=await PDFDocument.create(); pdf.addPage([595,842]).drawText("Operations upload UAT",{x:50,y:770}); const pdfBytes=Buffer.from(await pdf.save());
  try {
    for (const [type,extension,buffer] of [["image/jpeg","jpg",images["image/jpeg"]],["image/png","png",images["image/png"]],["image/webp","webp",images["image/webp"]],["application/pdf","pdf",pdfBytes]]) {
      await page.locator(".employee360-tabs").getByRole("button",{name:"Documents"}).click();
      const form=page.locator("[data-employee-id]"); const title=`UAT ملف ${extension}`;
      await form.getByLabel("Document type").selectOption(type.startsWith("image/")?"EMPLOYEE_PHOTO":"CONTRACT");
      await form.getByLabel("Display name").fill(title); await form.getByLabel("Issue date").fill("2026-01-01"); await form.getByLabel("Expiry date").fill("2027-01-01");
      await form.getByLabel("Secure local file").setInputFiles({name:`UAT صورة (1).${extension}`,mimeType:type,buffer});
      const sent=page.waitForResponse(response => response.url().endsWith(url(target.id))&&response.request().method()==="POST");
      await form.getByRole("button",{name:/Upload document for/}).click(); expect((await sent).ok()).toBeTruthy();
      await expect(page.getByRole("link",{name:`View ${title}`,exact:true})).toBeVisible();
      const doc=database(db => db.prepare("SELECT * FROM EmployeeDocument WHERE employeeId=? AND displayName=? ORDER BY uploadedAt DESC LIMIT 1").get(target.id,title));
      const downloaded=await request.get(`${url(target.id)}/${doc.id}?download=1`); expect(downloaded.ok()).toBeTruthy(); expect(await downloaded.body()).toEqual(buffer);
      const downloadEvent=page.waitForEvent("download");
      await page.locator(".employee-doc-actions").filter({has:page.getByRole("link",{name:`View ${title}`,exact:true})}).getByRole("link",{name:"Download",exact:true}).click();
      const download=await downloadEvent; expect(download.suggestedFilename()).toContain(title);
      expect(fs.readFileSync(await download.path())).toEqual(buffer);
      if(type.startsWith("image/")) {
        const popupEvent=page.waitForEvent("popup"); await page.getByRole("link",{name:`View ${title}`,exact:true}).click(); const popup=await popupEvent;
        await expect.poll(()=>popup.locator("img").evaluate(img=>img.complete&&img.naturalWidth>0)).toBeTruthy(); await popup.close();
      }
      await page.reload({waitUntil:"networkidle"}); await page.locator(".employee360-tabs").getByRole("button",{name:"Documents"}).click();
      if(type.startsWith("image/")) { await expect(page.locator(".employee360-photo img")).toHaveAttribute("src",`${url(target.id)}/${doc.id}`); expect(await page.locator(".employee360-photo img").evaluate(img => img.complete&&img.naturalWidth>0)).toBeTruthy(); }
      await page.screenshot({path:evidence(`upload-${extension}.png`)});
    }
    const active=database(db => db.prepare("SELECT id,displayName FROM EmployeeDocument WHERE employeeId=? AND documentType='EMPLOYEE_PHOTO' AND status='ACTIVE'").get(target.id));
    const row=page.locator(".employee-doc-actions").filter({has:page.getByRole("link",{name:`View ${active.displayName}`,exact:true})});
    const removalUrl=`**${url(target.id)}/${active.id}`;
    await page.route(removalUrl,route=>route.request().method()==="DELETE"?route.fulfill({status:500,contentType:"application/json",body:JSON.stringify({success:false,error:"UAT removal failure"})}):route.continue());
    page.once("dialog",dialog=>dialog.accept()); await row.getByRole("button",{name:"Remove",exact:true}).click();
    await expect(page.locator(".employee360-content").getByRole("alert")).toContainText("UAT removal failure"); await expect(row).toBeVisible(); await page.unroute(removalUrl);
    page.once("dialog",dialog=>dialog.accept()); await row.getByRole("button",{name:"Remove",exact:true}).click();
    await expect(page.locator(".employee360-photo img")).toHaveCount(0); await expect(page.locator(".employee360-photo b")).not.toBeEmpty();
    expect((await request.get(`${url(target.id)}/${active.id}`)).status()).toBe(404); expect(errors).toEqual([]);
    await page.screenshot({path:evidence("upload-photo-removed.png")});
  } finally {
    database(db => { for(const doc of oldPhotos) db.prepare("UPDATE EmployeeDocument SET status=? WHERE id=?").run(doc.status,doc.id); for(const doc of db.prepare("SELECT id FROM EmployeeDocument WHERE employeeId=? AND documentType='EMPLOYEE_PHOTO'").all(target.id)) if(!originals.has(doc.id)) db.prepare("UPDATE EmployeeDocument SET status='REMOVED' WHERE id=?").run(doc.id); },true);
  }
});
