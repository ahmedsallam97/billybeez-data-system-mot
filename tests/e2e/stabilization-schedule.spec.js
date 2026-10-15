const {test,expect}=require("@playwright/test");
const {database,evidence}=require("./stabilization-helpers");

test.beforeEach(async ({page})=>{await page.addInitScript(()=>localStorage.setItem("bbLanguage","en"));});

test("schedule autosave preserves rapid same-cell edits and does not roll back unrelated cells after failure",async({page,request})=>{
  test.setTimeout(120000);
  await page.goto("/operations?tab=schedule",{waitUntil:"networkidle"});
  await expect(page.getByRole("button",{name:"Import XLSX",exact:true})).toBeVisible();
  const importBackground = await page.evaluate(()=>{const h=getComputedStyle(document.documentElement).getPropertyValue("--theme-primary-soft").trim();return "rgb("+[1,3,5].map(i=>parseInt(h.slice(i,i+2),16)).join(", ")+")";});
  await expect(page.getByRole("button",{name:"Import XLSX",exact:true})).toHaveCSS("background-color",importBackground);
  const pm=page.locator('.schedule-grid-table td[title="PM"]').first();await expect(page.getByLabel("Schedule revision")).toBeEnabled({timeout:30000});await expect(pm).toHaveCSS("background-color","rgb(213, 178, 243)",{timeout:30000});await expect(pm).toHaveCSS("color","rgb(33, 19, 46)");
  const publishedId=await page.getByLabel("Schedule revision").inputValue();
  const history=database(db=>db.prepare("SELECT * FROM OpsScheduleAssignment WHERE scheduleId=? ORDER BY id").all(publishedId));
  await page.screenshot({path:evidence("schedule-before-edit.png")});
  const revisionResponse=page.waitForResponse(response=>response.url().endsWith("/api/operations/schedules")&&response.request().method()==="POST");
  await page.getByRole("button",{name:"Start live editing",exact:true}).click();
  const draftId=(await (await revisionResponse).json()).schedule.id;
  await expect(page.getByLabel("Schedule revision")).toHaveValue(draftId);
  const cells=page.locator(".schedule-grid-table.is-editing tbody select"); await expect(cells.first()).toBeVisible();
  let completed=0; let delayed=false;
  await page.route("**/api/operations/schedules",async route=>{
    if(route.request().method()!=="PATCH") return route.continue();
    const body=route.request().postDataJSON();
    if(body.value==="AM"&&!delayed){delayed=true;await new Promise(resolve=>setTimeout(resolve,500));}
    const response=await route.fetch(); await route.fulfill({response}); completed+=1;
  });
  try {
    await cells.nth(0).selectOption("AM"); await cells.nth(0).selectOption("PM");
    await expect.poll(()=>completed).toBe(2); await expect(cells.nth(0)).toHaveValue("PM");
    await page.unroute("**/api/operations/schedules");
    let failed=false; completed=0;
    await page.route("**/api/operations/schedules",async route=>{
      if(route.request().method()!=="PATCH") return route.continue();
      if(route.request().postDataJSON().value==="Annual"&&!failed){failed=true;await new Promise(resolve=>setTimeout(resolve,500));await route.fulfill({status:500,contentType:"application/json",body:JSON.stringify({success:false,error:"UAT save failure"})});}
      else {const response=await route.fetch();await route.fulfill({response});}
      completed+=1;
    });
    await cells.nth(1).selectOption("Annual");await cells.nth(2).selectOption("BW");await expect.poll(()=>completed).toBe(2);
    await expect(cells.nth(0)).toHaveValue("PM");await expect(cells.nth(2)).toHaveValue("BW");await expect(cells.nth(1)).toHaveValue("Annual");
    await expect(page.locator(".schedule-workspace .alert.danger")).toContainText("UAT save failure");
    await page.getByRole("button",{name:/Retry.*save/i}).first().click();
    await expect.poll(()=>completed).toBe(3); await page.unroute("**/api/operations/schedules");
    await cells.nth(3).selectOption("AM Front");await cells.nth(4).selectOption("BW1");await cells.nth(5).selectOption("N/A");
    await expect(page.getByRole("status")).toContainText(/All changes saved/);
    await page.screenshot({path:evidence("schedule-multiple-cells-saved.png")});
    await page.reload({waitUntil:"networkidle"});
    for(const [index,value] of ["PM","Annual","BW","AM Front","BW1","N/A"].entries()) await expect(cells.nth(index)).toHaveValue(value);
    await page.screenshot({path:evidence("schedule-after-reload.png")});
    expect(database(db=>db.prepare("SELECT * FROM OpsScheduleAssignment WHERE scheduleId=? ORDER BY id").all(publishedId))).toEqual(history);
  } finally {if(!page.isClosed())await page.unroute("**/api/operations/schedules");const cleanup=await request.post("/api/operations/schedules",{data:{action:"deleteDraft",scheduleId:draftId}});expect(cleanup.ok(),await cleanup.text()).toBeTruthy();}
});

test("schedule API rejects malformed dates, historical overtime entry and invalid periods without partial writes",async({request})=>{
  const source=database(db=>db.prepare("SELECT id FROM OpsSchedule WHERE status='PUBLISHED' ORDER BY operationalYear DESC,operationalMonth DESC LIMIT 1").get());
  const res=await request.post("/api/operations/schedules",{data:{action:"createRevision",scheduleId:source.id}});expect(res.ok()).toBeTruthy();const draft=(await res.json()).schedule;
  const before=database(db=>db.prepare("SELECT * FROM OpsScheduleAssignment WHERE scheduleId=? ORDER BY id").all(draft.id));const target=before[0];
  try {
    for(const fields of [{workDate:`${target.workDate}extra`,value:"AM"},{workDate:target.workDate,value:"OverTime"},{workDate:"not-a-date",value:"PM"}]) {
      const invalid=await request.patch("/api/operations/schedules",{data:{scheduleId:draft.id,employeeId:target.employeeId,...fields}});expect.soft(invalid.status()).toBe(400);
    }
    const invalidPeriod=await request.post("/api/operations/schedules",{data:{action:"createBlankDraft",year:2026,month:13}});expect.soft(invalidPeriod.status()).toBe(400);
    expect(database(db=>db.prepare("SELECT * FROM OpsScheduleAssignment WHERE scheduleId=? ORDER BY id").all(draft.id))).toEqual(before);
    expect((await request.patch("/api/operations/schedules",{data:{scheduleId:source.id,employeeId:target.employeeId,workDate:target.workDate,value:"PM"}})).status()).toBe(409);
  } finally {expect((await request.post("/api/operations/schedules",{data:{action:"deleteDraft",scheduleId:draft.id}})).ok()).toBeTruthy();}
});


const {templateSheets}=require('../../lib/operations/schedule-import');
const {workbookFromSheets}=require('../../lib/operations/schedule-export');
const {readSheet:readXlsx}=require('read-excel-file/node');const {PDFDocument}=require('pdf-lib');const fs=require('node:fs');
test('schedule template import is atomic, preserves raw shifts and exports the complete December period',async({request})=>{
 test.setTimeout(120000);const endpoint='/api/operations/schedules';
 const created=await request.post(endpoint,{data:{action:'createBlankDraft',year:2098,month:12}});expect(created.ok()).toBeTruthy();const draft=(await created.json()).schedule;
 const payload=await (await request.get(endpoint+'?year=2098&month=12&scheduleId='+draft.id)).json();const employee=payload.employees.find(item=>item.department==='OPERATION');
 const sheets=templateSheets(draft,[employee],payload.codes,payload.branch),header=sheets[1].rows[0],row=sheets[1].rows[1];
 for(const [date,value]of [['2098-11-16','AM'],['2098-11-17','BW1'],['2098-12-16','BW2'],['2098-12-31','N/A']])row[header.indexOf(date)]=value;
 const upload=workbook=>request.post(endpoint,{multipart:{scheduleId:draft.id,branch:payload.branch,file:{name:'roster.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:Buffer.from(workbookFromSheets(workbook))}}});
 const apply=importId=>request.post(endpoint,{data:{action:'applyImport',importId,branch:payload.branch}});
 const cells=()=>database(db=>db.prepare('SELECT * FROM OpsScheduleAssignment WHERE scheduleId=? ORDER BY workDate').all(draft.id));
 try{
  expect((await request.post(endpoint,{data:{action:'publish',scheduleId:draft.id}})).status()).toBe(400);
  const response=await upload(sheets);expect(response.ok(),await response.text()).toBeTruthy();const preview=await response.json();expect(preview.valid).toBe(true);expect(cells()).toEqual([]);expect((await apply(preview.importId)).ok()).toBe(true);
  expect(cells().map(item=>item.importRawValue)).toEqual(['AM','BW1','BW2','N/A']);const before=cells();
  for(const corrupt of [s=>s[1].rows[1][4]='OverTime',s=>s[1].rows[1][0]='BAD',s=>s[1].rows.push([...s[1].rows[1]]),s=>s[1].rows[0][5]=s[1].rows[0][4],s=>s[1].rows[0][4]='16',s=>s[1].rows[0].push('2099-01-01')]){
   const changed=structuredClone(sheets);corrupt(changed);const invalid=await upload(changed);expect(invalid.ok()).toBe(true);const report=await invalid.json();expect(report.valid).toBe(false);expect((await apply(report.importId)).status()).toBe(400);expect(cells()).toEqual(before);
  }
  const changed=structuredClone(sheets);changed[1].rows[1][4]='PM';const ready=await (await upload(changed)).json();
  database(db=>db.exec("CREATE TRIGGER import_audit_failure BEFORE INSERT ON AuditLog WHEN NEW.action='OPS_SCHEDULE_IMPORTED' BEGIN SELECT RAISE(ABORT,'isolated import audit failure'); END"),true);
  try{expect((await apply(ready.importId)).status()).toBe(500);expect(cells()).toEqual(before);}finally{database(db=>db.exec('DROP TRIGGER import_audit_failure'),true);}
  const xlsx=await request.get(endpoint+'/export?scheduleId='+draft.id+'&format=xlsx');expect(xlsx.ok()).toBeTruthy();const workbook=await readXlsx(Buffer.from(await xlsx.body()));expect(workbook[0].slice(3)).toHaveLength(46);expect(workbook[0][3]).toBe('2098-11-16');expect(workbook[0].at(-1)).toBe('2098-12-31');expect(workbook[1][workbook[0].indexOf('2098-11-17')]).toBe('BW1');expect(workbook[1][workbook[0].indexOf('2098-12-16')]).toBe('BW2');
  const pdfResponse=await request.get(endpoint+'/export?scheduleId='+draft.id+'&format=pdf');expect(pdfResponse.ok()).toBeTruthy();const bytes=await pdfResponse.body();const pdf=await PDFDocument.load(bytes);expect(pdf.getPageCount()).toBe(4);for(const page of pdf.getPages()){expect(page.getWidth()).toBeCloseTo(841.89,1);expect(page.getHeight()).toBeCloseTo(595.28,1);}fs.writeFileSync(evidence('monthly-schedule-december-a4.pdf'),bytes);
  expect((await request.get(endpoint+'/export?scheduleId='+draft.id+'&format=bad')).status()).toBe(400);
 }finally{expect((await request.post(endpoint,{data:{action:'deleteDraft',scheduleId:draft.id}})).ok()).toBeTruthy();}
});
