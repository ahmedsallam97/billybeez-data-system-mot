const {test,expect}=require("@playwright/test");
const fs=require("node:fs");
const {database,evidence}=require("./stabilization-helpers");
const settings="/api/operations/settings";
test("invalid stored Operations rules return errors instead of applying defaults or writing records",async({request})=>{
 const clearCache=async()=>{const key="OPS_MOTIVATION_PHRASES",value=database(db=>db.prepare("SELECT value FROM SystemSetting WHERE key=?").get(key)).value;expect((await request.patch(settings,{data:{key,value}})).ok()).toBeTruthy();};
 for(const [key,method,url,body] of [
  ["OPS_STOCK_RULES","get","/api/operations/summary"],
  ["OPS_BRANCH_CONFIG","get","/api/operations/summary"],
  ["OPS_ATTENDANCE_RULES","patch","/api/operations/attendance",{action:"finalize",dayId:"invalid-config-rehearsal"}],
  ["OPS_EVALUATION_RULES","post","/api/operations/evaluations",{action:"open",date:"2026-10-08"}],
  ["OPS_BRANCH_CONFIG","post","/api/operations/config",{action:"savePartner",name:"Must not persist"}],
 ]){
  const original=database(db=>db.prepare("SELECT value FROM SystemSetting WHERE key=?").get(key)).value;
  try{
   database(db=>db.prepare("UPDATE SystemSetting SET value=? WHERE key=?").run("{invalid",key),true);await clearCache();
   const before=database(db=>Object.fromEntries(["OpsAttendanceDay","OpsDailyEvaluationDay","OpsTripPartner"].map(name=>[name,db.prepare("SELECT COUNT(*) count FROM "+name).get().count])));
   const response=await request[method](url,body?{data:body}:{});expect([400,409,422]).toContain(response.status());const message=(await response.json()).error;if(key==="OPS_EVALUATION_RULES")expect(message).toMatch(/Stored evaluation rules.*invalid/i);else expect(message).toContain(key);
   expect(database(db=>Object.fromEntries(Object.keys(before).map(name=>[name,db.prepare("SELECT COUNT(*) count FROM "+name).get().count])))).toEqual(before);
  }finally{database(db=>db.prepare("UPDATE SystemSetting SET value=? WHERE key=?").run(original,key),true);await clearCache();}
 }
});
test("production monthly schedule reaches a usable grid with visible import control",async({page})=>{
 await page.addInitScript(()=>localStorage.setItem("bbLanguage","en"));const started=Date.now();await page.goto("/operations?tab=schedule",{waitUntil:"domcontentloaded"});await expect(page.locator(".schedule-grid-table tbody tr").first()).toBeVisible();await expect(page.getByRole("button",{name:"Import XLSX",exact:true})).toBeVisible();const isDraft=await page.locator(".schedule-live-status em").textContent();if(isDraft.includes("DRAFT"))await expect(page.getByRole("button",{name:"Import XLSX",exact:true})).toBeEnabled();else await expect(page.getByRole("button",{name:"Import XLSX",exact:true})).toBeDisabled();
 const result={mode:process.env.OPS_E2E_PRODUCTION==="1"?"production":"development",readyMilliseconds:Date.now()-started,rows:await page.locator(".schedule-grid-table tbody tr").count(),scope:"Local browser navigation to usable grid; not a remote-load or cold-server benchmark"};fs.writeFileSync(evidence("schedule-ready-timing.json"),JSON.stringify(result,null,2));
});
