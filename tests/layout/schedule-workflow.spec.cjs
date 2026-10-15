require('../e2e/account-fixtures').installLanguageFixture();
const {test,expect}=require('@playwright/test');
const {readSheet}=require('read-excel-file/node');
const {PDFDocument}=require('pdf-lib');
const {PrismaClient}=require('@prisma/client');
const {assertIsolatedEnvironment}=require('../e2e/isolation');
const {templateSheets,configuredCodes}=require('../../lib/operations/schedule-import');
const {workbookFromSheets}=require('../../lib/operations/schedule-export');
async function json(response){const data=await response.json();expect(response.ok(),JSON.stringify(data)).toBe(true);return data;}
const endpoint='/api/operations/schedules';
test('manual ordering, concurrent edits, import preview/confirmation, branch protection, publication/copy/roster/print/export',async({page,request})=>{
 assertIsolatedEnvironment();const db=new PrismaClient();let draft,publishedCopy;
 try{
  draft=(await json(await request.post(endpoint,{data:{action:'createBlankDraft',branch:'MOT',year:2096,month:10}}))).schedule;
  let payload=await json(await request.get(endpoint+'?year=2096&month=10&branch=MOT&scheduleId='+draft.id));const employees=payload.employees.filter(item=>item.department==='OPERATION').slice(0,3);expect(employees).toHaveLength(3);
  const sheets=templateSheets(draft,employees,await configuredCodes(db),'MOT');for(const row of sheets[1].rows.slice(1))row[4]='AM';const bytes=Buffer.from(workbookFromSheets(sheets));
  const preview=await json(await request.post(endpoint,{multipart:{scheduleId:draft.id,branch:'MOT',mode:'merge',file:{name:'schedule.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:bytes}}}));expect(preview.valid).toBe(true);expect(preview.counts.created).toBe(3);expect(await db.opsScheduleAssignment.count({where:{scheduleId:draft.id}})).toBe(0);
  const invalidSheets=structuredClone(sheets);invalidSheets[1].rows[1][0]='invalid-id';invalidSheets[1].rows[2][4]='BOGUS';const invalid=await json(await request.post(endpoint,{multipart:{scheduleId:draft.id,branch:'MOT',file:{name:'invalid.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:Buffer.from(workbookFromSheets(invalidSheets))}}}));expect(invalid.valid).toBe(false);expect(invalid.errors.length).toBeGreaterThan(1);expect((await request.post(endpoint,{data:{action:'applyImport',importId:invalid.importId,branch:'MOT'}})).status()).toBe(400);
  await json(await request.post(endpoint,{data:{action:'applyImport',importId:preview.importId,branch:'MOT'}}));
  await page.addInitScript(()=>localStorage.setItem('bbLanguage','en'));await page.goto('/operations?tab=schedule',{waitUntil:'networkidle'});await page.getByLabel('Year',{exact:true}).fill('2096');await page.getByLabel('Operational month',{exact:true}).selectOption('10');await expect(page.getByLabel('Schedule revision')).toHaveValue(draft.id);
  let rows=page.locator('.schedule-grid-table').first().locator('tbody tr');const beforeOrder=await rows.evaluateAll(nodes=>nodes.map(node=>node.dataset.employeeId));const name=payload.employees.find(item=>item.id===beforeOrder[1]).name;
  await page.getByRole('button',{name:'Move to top: '+name,exact:true}).click();await expect(rows.first()).toHaveAttribute('data-employee-id',beforeOrder[1]);await page.reload({waitUntil:'networkidle'});
  await page.getByLabel('Year',{exact:true}).fill('2096');await page.getByLabel('Operational month',{exact:true}).selectOption('10');await expect(rows.first()).toHaveAttribute('data-employee-id',beforeOrder[1]);
  payload=await json(await request.get(endpoint+'?year=2096&month=10&scheduleId='+draft.id));const saved=payload.schedule.displayOrder;
  await page.getByLabel('Find employee',{exact:true}).fill(name);await expect(rows).toHaveCount(1);await page.getByLabel('Find employee',{exact:true}).fill('');await page.getByLabel('Temporary display sort').selectOption('name');await page.getByLabel('Temporary display sort').selectOption('manual');expect((await json(await request.get(endpoint+'?year=2096&month=10&scheduleId='+draft.id))).schedule.displayOrder).toEqual(saved);
  expect((await request.post(endpoint,{data:{action:'reorder',scheduleId:draft.id,expectedRevision:0,displayOrder:saved}})).status()).toBe(409);
  const template=await request.get(endpoint+'/export?format=template&scheduleId='+draft.id);expect(template.ok()).toBe(true);expect(await require('read-excel-file/node')(await template.body())).toHaveLength(3);
  await page.locator('input[type=file]').setInputFiles({name:'schedule.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:bytes});const review=page.getByRole('region',{name:'Import review'});await expect(review).toContainText('Dry run only');await expect(review.getByRole('button',{name:'Confirm and apply import'})).toBeEnabled();page.on('dialog',dialog=>dialog.accept());await review.getByRole('button',{name:'Confirm and apply import'}).click();await expect(review).toContainText('Applied');
  await page.getByLabel('Temporary display sort').selectOption('name');await page.evaluate(()=>{window.print=()=>{window.__printedOrder=[...document.querySelector('.schedule-grid-table').querySelectorAll('tbody tr')].map(row=>row.dataset.employeeId);window.dispatchEvent(new Event('afterprint'));};});await page.getByRole('button',{name:'Print',exact:true}).click();await expect.poll(()=>page.evaluate(()=>window.__printedOrder)).toEqual(saved.filter(id=>payload.employees.find(item=>item.id===id)?.department!=='CASHIER'));
  await json(await request.post(endpoint,{data:{action:'publish',scheduleId:draft.id}}));expect((await request.post(endpoint,{data:{action:'reorder',scheduleId:draft.id,expectedRevision:99,displayOrder:saved}})).status()).toBe(409);expect((await request.post(endpoint,{multipart:{scheduleId:draft.id,file:{name:'schedule.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:bytes}}})).status()).toBe(409);
  const roster=await json(await request.get('/api/operations/roster?date='+draft.periodStart));expect(roster.roster.map(item=>item.employee.id)).toEqual(saved.filter(id=>employees.some(employee=>employee.id===id)));
  const exported=await readSheet(await (await request.get(endpoint+'/export?scheduleId='+draft.id)).body());expect(exported.slice(1).map(row=>row[0])).toEqual(saved.filter(id=>employees.some(employee=>employee.id===id)).map(id=>employees.find(employee=>employee.id===id).name));
  const pdf=await PDFDocument.load(await (await request.get(endpoint+'/export?format=pdf&scheduleId='+draft.id)).body());expect(pdf.getPageCount()).toBeGreaterThan(0);
  publishedCopy=(await json(await request.post(endpoint,{data:{action:'createRevision',scheduleId:draft.id}}))).schedule;expect((await json(await request.get(endpoint+'?year=2096&month=10&scheduleId='+publishedCopy.id))).schedule.displayOrder).toEqual(saved);
  expect((await request.get(endpoint+'/export?scheduleId='+draft.id+'&branch=OTHER')).status()).toBe(403);
 }finally{if(publishedCopy)await request.post(endpoint,{data:{action:'deleteDraft',scheduleId:publishedCopy.id}});await db.$disconnect();}
});
