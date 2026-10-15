require('../e2e/account-fixtures').installLanguageFixture();
const {test,expect}=require('@playwright/test'),{PrismaClient}=require('@prisma/client');
const {assertIsolatedEnvironment}=require('../e2e/isolation');
const {physicalConflict}=require('../../lib/operations/rotation-locations');
const fs=require('node:fs'),path=require('node:path'),folder=path.resolve('docs/audit-evidence/handover');fs.mkdirSync(folder,{recursive:true});
const date='2026-10-11',headers={origin:'http://127.0.0.1:3018'};
async function json(response){expect(response.ok()).toBe(true);return response.json();}
test('four daily leaders persist; generated handover respects PM coverage, history, manual rules and print',async({page})=>{
 assertIsolatedEnvironment();const db=new PrismaClient();try{
  await page.addInitScript(()=>localStorage.setItem('bbLanguage','ar'));await page.goto('/operations/daily-preview?date='+date,{waitUntil:'networkidle'});
  const initial=await json(await page.request.get('/api/operations/daily?date='+date+'&branch=MOT'));
  const operators=initial.team.filter(m=>m.working&&!m.frontAssignment&&m.employee.department!=='CASHIER');
  const am=operators.find(m=>m.shiftCode==='AM'),pm=operators.find(m=>m.shiftCode==='PM');expect(am).toBeTruthy();expect(pm).toBeTruthy();
  const responsibilities=page.getByRole('region',{name:'Daily responsibilities'});
  await responsibilities.getByLabel('Morning team leader',{exact:true}).selectOption(am.employeeId);
  await responsibilities.getByLabel('Night team leader',{exact:true}).selectOption(pm.employeeId);
  await responsibilities.getByLabel('Trip Team Leader',{exact:true}).selectOption(pm.employeeId);
  await responsibilities.getByLabel('Birthday Team Leader',{exact:true}).selectOption(am.employeeId);
  await responsibilities.getByRole('button',{name:'Save responsibilities',exact:true}).click();await expect(responsibilities.getByRole('status')).toContainText('Responsibilities saved');
  await page.reload({waitUntil:'networkidle'});await expect(responsibilities.getByLabel('Trip Team Leader',{exact:true})).toHaveValue(pm.employeeId);await expect(responsibilities.getByLabel('Birthday Team Leader',{exact:true})).toHaveValue(am.employeeId);
  const data=await json(await page.request.get('/api/operations/daily?date='+date+'&branch=MOT'));
  let day=await db.opsOperationsDay.findFirst({where:{workDate:date,branch:'MOT'},orderBy:{version:'desc'}});if(!day)day=await db.opsOperationsDay.create({data:{workDate:date,branch:'MOT'}});
  await db.opsOperationsDay.update({where:{id:day.id},data:{status:'OPEN'}});const max=await db.opsRotationPlan.findFirst({where:{operationsDayId:day.id},orderBy:{version:'desc'}});
  await db.opsRotationPlan.updateMany({where:{operationsDayId:day.id},data:{status:'SUPERSEDED'}});const fixture=await db.opsRotationPlan.create({data:{operationsDayId:day.id,branch:'MOT',version:(max?.version||0)+1,status:'ACTIVE'}});
  const stocks=JSON.stringify(await db.opsWristbandStock.findMany({orderBy:{id:'asc'}})),trips=JSON.stringify(await db.opsDailyTrip.findMany({orderBy:{id:'asc'}})),events=JSON.stringify(await db.opsDailyEvent.findMany({orderBy:{id:'asc'}})),schedule=JSON.stringify(await db.opsScheduleAssignment.findMany({orderBy:{id:'asc'}}));
  const preview=(await json(await page.request.post('/api/operations/daily',{headers,data:{action:'previewRotation',date,branch:'MOT'}}))).preview;
  expect(preview.breaks.length).toBeGreaterThan(0);const start=data.shifts.PM.startTime,end=`${String(Number(start.slice(0,2))+1).padStart(2,'0')}:${start.slice(3,5)}`;
  expect(preview.breaks.every(b=>b.startTime===start&&b.endTime===end)).toBe(true);
  expect(preview.assignments.some(a=>a.shiftCode==='AM'&&a.startTime===start)).toBe(false);
  expect(preview.assignments.filter(a=>a.shiftCode==='AM'&&a.startTime>=end).every(a=>['TOWER','ENTRANCE','EXIT'].includes(a.positionCode))).toBe(true);
  for(let i=0;i<preview.assignments.length;i++)for(let j=i+1;j<preview.assignments.length;j++){const a=preview.assignments[i],b=preview.assignments[j];if(a.startTime<b.endTime&&b.startTime<a.endTime)expect(physicalConflict(a.positionCode,b.positionCode)).toBe(false);}
  const applied=await json(await page.request.post('/api/operations/daily',{headers,data:{action:'generateRotation',date,branch:'MOT',confirmed:true,previewFingerprint:preview.sourceFingerprint,reason:'Manager verified approved handover rules'}}));expect(applied.plan.version).toBe(fixture.version+1);
  expect((await db.opsRotationPlan.findUnique({where:{id:fixture.id}})).status).toBe('SUPERSEDED');expect(await db.opsBreakAssignment.count({where:{rotationPlanId:applied.plan.id}})).toBe(preview.breaks.length);
  const editor=(await json(await page.request.get('/api/operations/daily?view=rotationEditor&date='+date+'&branch=MOT'))).editor,breakCell=editor.cells.find(c=>c.blocked==='BREAK');expect(breakCell).toBeTruthy();
  const pos=data.positions.find(p=>p.code==='DROP');const rejected=await page.request.post('/api/operations/daily',{headers,data:{action:'changeRotationCell',date,branch:'MOT',employeeId:breakCell.employeeId,startTime:breakCell.startTime,endTime:breakCell.endTime,operationalPositionId:pos.id,allowDisabled:true,sourceFingerprint:editor.sourceFingerprint,reason:'Cannot bypass handover break'}});expect(rejected.status()).toBe(409);
  const legacy=await page.request.post('/api/operations/daily',{headers,data:{action:'manualAssignment',date,branch:'MOT',employeeId:breakCell.employeeId,startTime:breakCell.startTime,endTime:breakCell.endTime,operationalPositionId:pos.id,allowDisabled:true,reason:'Cannot bypass handover in legacy API'}});expect(legacy.ok()).toBe(false);
  await page.reload({waitUntil:'networkidle'});await expect(page.locator('.ops-shift-am')).toContainText('Break');
  await page.setViewportSize({width:1920,height:2000});
  await page.locator('.daily-operations-poster').screenshot({path:path.join(folder,'approved-handover-roster.png')});
  await page.setViewportSize({width:1920,height:1080});
  for(const shift of ['am','pm']){const bands=await page.locator(`.ops-shift-${shift} .ops-role-band`).allTextContents();expect(bands[0]).toMatch(/Cashier/);expect(bands[1]).toMatch(/Team Leader/);}
  await page.getByRole('button',{name:'Edit rotations',exact:true}).click();await expect(page.locator('[data-rotation-editor]')).toBeVisible();const select=page.locator('.ops-rotation-select').filter({has:page.locator('option', {hasText:'Employee break'})}).first();await expect(select).toBeDisabled();
  expect(await page.locator('.ops-rotation-select').evaluateAll(elements=>elements.every(el=>!/[\u0600-\u06ff]/.test(el.textContent)))).toBe(true);await page.getByRole('button',{name:'Finish editing rotations',exact:true}).click();
  await page.emulateMedia({media:'print'});await expect(responsibilities).toBeHidden();await expect(page.locator('[data-bracelet-selections]')).toBeHidden();await page.pdf({path:path.join(folder,'approved-handover-a4.pdf'),landscape:true,format:'A4',printBackground:true});await page.emulateMedia({media:'screen'});
  expect(JSON.stringify(await db.opsWristbandStock.findMany({orderBy:{id:'asc'}}))).toBe(stocks);expect(JSON.stringify(await db.opsDailyTrip.findMany({orderBy:{id:'asc'}}))).toBe(trips);expect(JSON.stringify(await db.opsDailyEvent.findMany({orderBy:{id:'asc'}}))).toBe(events);expect(JSON.stringify(await db.opsScheduleAssignment.findMany({orderBy:{id:'asc'}}))).toBe(schedule);
 }finally{await db.$disconnect();}
});
test('roster controls are compact, side by side below the roster, open by default and English in every desktop theme',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 for(const language of ['ar','en'])for(const [size,width,height] of [['laptop',1366,768],['desktop',1920,1080]])for(const theme of ['classic','red','blue','orange']){
  await page.setViewportSize({width,height});await page.addInitScript(({language,theme})=>{localStorage.setItem('bbLanguage',language);localStorage.setItem('bbTheme',theme);},{language,theme});await page.goto('/operations/daily-preview?date='+date,{waitUntil:'networkidle'});
  const responsibilities=page.getByRole('region',{name:'Daily responsibilities'}),bracelets=page.locator('[data-bracelet-selections]');await expect(bracelets.getByLabel('Stock for Kid',{exact:true})).toBeVisible();await expect(bracelets.locator('summary')).toHaveCount(0);
  await expect(responsibilities.getByLabel('Trip Team Leader',{exact:true})).toBeVisible();await expect(responsibilities.getByLabel('Birthday Team Leader',{exact:true})).toBeVisible();
  const a=await responsibilities.boundingBox(),b=await bracelets.boundingBox(),poster=await page.locator('.daily-operations-poster').boundingBox();expect(Math.abs(a.y-b.y)).toBeLessThan(2);expect(Math.abs(a.height-b.height)).toBeLessThan(2);expect(a.y).toBeGreaterThan(poster.y+poster.height);expect(a.x+a.width).toBeLessThanOrEqual(b.x);expect(a.width).toBeLessThan(width*.55);const stockRows=Math.max(2,Math.ceil(await bracelets.locator('select').count()/2)),heightLimit=480+(stockRows-2)*94;expect(a.height).toBeLessThan(heightLimit);expect(b.height).toBeLessThan(heightLimit);
  for(const block of [responsibilities,bracelets])expect(await block.evaluate(el=>el.scrollWidth<=el.clientWidth+2)).toBe(true);
  await assertAlignedControls(responsibilities,bracelets);
  await expect(page.getByRole('button',{name:/Preview rotation generation|معاينة توليد الروتيشن/})).toHaveCount(0);
  const text=await page.locator('.daily-operations-poster').innerText();expect(text).not.toMatch(/بدون تكليف|مستبعد من الشيفت/);
  await responsibilities.scrollIntoViewIfNeeded();if(theme==='classic')await page.screenshot({path:path.join(folder,`compact-open-below-${language}-${size}.png`)});
 }
 expect(errors).toEqual([]);
});

async function assertAlignedControls(responsibilities,bracelets){
 const headingA=await responsibilities.locator('h2').boundingBox(),headingB=await bracelets.locator('h2').boundingBox();expect(Math.abs(headingA.y-headingB.y)).toBeLessThan(2);
 const left=responsibilities.locator('select'),right=bracelets.locator('select');
 for(let i=0;i<4;i++){const a=await left.nth(i).boundingBox(),b=await right.nth(i).boundingBox();expect(Math.abs(a.y-b.y)).toBeLessThan(2);expect(a.height).toBe(40);expect(b.height).toBe(40);const nameA=await left.nth(i).locator('..').locator('span').first().boundingBox(),nameB=await right.nth(i).locator('..').locator('span').first().boundingBox();expect(Math.abs(nameA.y-nameB.y)).toBeLessThan(2);}
 const a=await responsibilities.getByRole('button',{name:'Save responsibilities',exact:true}).boundingBox(),b=await bracelets.getByRole('button',{name:'Save today’s bracelet selections',exact:true}).boundingBox();expect(Math.abs(a.y-b.y)).toBeLessThan(2);expect(a.height).toBe(40);expect(b.height).toBe(40);
 for(const block of [responsibilities,bracelets]){const boxes=await block.getByRole('button').evaluateAll(items=>items.map(item=>{const r=item.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width};}));expect(boxes.every(box=>Math.abs(box.y-boxes[0].y)<2)).toBe(true);for(let i=1;i<boxes.length;i++)expect(boxes[i].x).toBeGreaterThan(boxes[i-1].x+boxes[i-1].width);}
}

test('Trip/Birthday bracelets follow current bookings, preserve stock and saved colors, and keep both cards aligned',async({page})=>{
 assertIsolatedEnvironment();const db=new PrismaClient();const createdTrips=[],createdEvents=[],createdStocks=[];let oldTrips=[],oldEvents=[];
 try{
  oldTrips=await db.opsDailyTrip.findMany({where:{branch:'MOT',workDate:date}});oldEvents=await db.opsDailyEvent.findMany({where:{branch:'MOT',workDate:date}});
  await db.opsDailyTrip.updateMany({where:{id:{in:oldTrips.map(row=>row.id)}},data:{status:'CANCELLED'}});await db.opsDailyEvent.updateMany({where:{id:{in:oldEvents.map(row=>row.id)}},data:{status:'CANCELLED'}});
  const trip=await db.opsDailyTrip.create({data:{branch:'MOT',workDate:date,name:'School visit · 60 children',startTime:'09:00',endTime:'13:00',expectedChildren:60,status:'CANCELLED'}});createdTrips.push(trip.id);
  for(const data of [{branch:'MOT',workDate:'2026-10-12',name:'Different date'},{branch:'OTHER',workDate:date,name:'Different branch'}]){const row=await db.opsDailyTrip.create({data});createdTrips.push(row.id);}
  const birthday=await db.opsDailyEvent.create({data:{branch:'MOT',workDate:date,name:'Birthday party',childName:'Alex',eventType:'BIRTHDAY',startTime:'17:00',endTime:'19:00',expectedGuests:20,status:'CANCELLED'}});createdEvents.push(birthday.id);
  const otherEvent=await db.opsDailyEvent.create({data:{branch:'MOT',workDate:date,name:'Other event',eventType:'GENERAL'}});createdEvents.push(otherEvent.id);
  for(const [usageType,color,colorName] of [['TRIP','#32a66f','Green'],['TRIP','#f6b73c','Amber'],['BIRTHDAY','#eb75a9','Pink']]){const row=await db.opsWristbandStock.create({data:{branch:'MOT',workDate:'ALL',stockCategory:'BRACELET',usageType,wristbandType:`ALIGN_${usageType}_${colorName}`,material:'PAPER',color,colorName,availableStock:100}});createdStocks.push(row.id);}
  const getRoster=async()=>json(await page.request.get('/api/operations/roster?date='+date+'&branch=MOT'));
  await page.goto('/operations/daily-preview?date='+date,{waitUntil:'networkidle'});let roster=await getRoster();expect(roster.braceletRoster.rows.some(row=>['TRIP','BIRTHDAY'].includes(row.code))).toBe(false);await expect(page.getByLabel('Stock for Trip',{exact:true})).toHaveCount(0);await expect(page.getByLabel('Stock for Birthday',{exact:true})).toHaveCount(0);
  await db.opsDailyTrip.update({where:{id:trip.id},data:{status:'PLANNED'}});roster=await getRoster();expect(roster.braceletRoster.rows.some(row=>row.code==='TRIP')).toBe(true);expect(roster.braceletRoster.rows.some(row=>row.code==='BIRTHDAY')).toBe(false);
  await db.opsDailyEvent.update({where:{id:birthday.id},data:{status:'PLANNED'}});const stocks=JSON.stringify(await db.opsWristbandStock.findMany({orderBy:{id:'asc'}})),trips=JSON.stringify(await db.opsDailyTrip.findMany({orderBy:{id:'asc'}})),events=JSON.stringify(await db.opsDailyEvent.findMany({orderBy:{id:'asc'}}));
  await page.reload({waitUntil:'networkidle'});const bracelets=page.locator('[data-bracelet-selections]'),responsibilities=page.getByRole('region',{name:'Daily responsibilities'});await bracelets.getByLabel('Stock for Trip',{exact:true}).selectOption(createdStocks[1]);await bracelets.getByLabel('Stock for Birthday',{exact:true}).selectOption(createdStocks[2]);await bracelets.getByRole('button',{name:'Save today’s bracelet selections',exact:true}).click();await expect(bracelets.getByRole('status')).toContainText('saved');await page.reload({waitUntil:'networkidle'});
  await expect(page.locator('.daily-operations-poster [data-bracelet-type=TRIP]')).toContainText('PAPER · Amber');await expect(page.locator('.daily-operations-poster [data-bracelet-type=BIRTHDAY]')).toContainText('PAPER · Pink');await expect(bracelets.getByLabel('Stock for Trip',{exact:true})).toHaveValue(createdStocks[1]);
  const overrides=responsibilities.locator('details');await expect(overrides).not.toHaveAttribute('open','');await overrides.locator('summary').click();await expect(responsibilities.getByLabel('Trip leader · '+trip.name,{exact:true})).toBeVisible();await overrides.locator('summary').click();
  for(const language of ['ar','en'])for(const [size,width,height] of [['laptop',1366,768],['desktop',1920,1080]])for(const theme of ['classic','red','blue','orange']){
   await page.setViewportSize({width,height});await page.addInitScript(({language,theme})=>{localStorage.setItem('bbLanguage',language);localStorage.setItem('bbTheme',theme);},{language,theme});await page.reload({waitUntil:'networkidle'});await expect(bracelets.getByLabel('Stock for Birthday',{exact:true})).toBeVisible();await assertAlignedControls(responsibilities,bracelets);
   const a=await responsibilities.boundingBox(),b=await bracelets.boundingBox();expect(Math.abs(a.height-b.height)).toBeLessThan(2);expect(a.height).toBeLessThan(550);for(const block of [responsibilities,bracelets])expect(await block.evaluate(el=>el.scrollWidth<=el.clientWidth+2)).toBe(true);
   if(theme==='classic'){await responsibilities.scrollIntoViewIfNeeded();await page.screenshot({path:path.join(folder,`aligned-event-bracelets-${language}-${size}.png`)});}
  }
  await page.locator('.ops-bracelet-section').screenshot({path:path.join(folder,'event-bracelet-colors.png')});
  await page.emulateMedia({media:'print'});await expect(bracelets).toBeHidden();await expect(page.locator('.daily-operations-poster [data-bracelet-type=TRIP]')).toContainText('PAPER · Amber');await page.pdf({path:path.join(folder,'event-bracelet-roster-a4.pdf'),landscape:true,format:'A4',printBackground:true});await page.emulateMedia({media:'screen'});
  expect(JSON.stringify(await db.opsWristbandStock.findMany({orderBy:{id:'asc'}}))).toBe(stocks);expect(JSON.stringify(await db.opsDailyTrip.findMany({orderBy:{id:'asc'}}))).toBe(trips);expect(JSON.stringify(await db.opsDailyEvent.findMany({orderBy:{id:'asc'}}))).toBe(events);
  await db.opsDailyTrip.update({where:{id:trip.id},data:{status:'CANCELLED'}});await db.opsDailyEvent.update({where:{id:birthday.id},data:{status:'CANCELLED'}});await page.reload({waitUntil:'networkidle'});await expect(bracelets.getByLabel('Stock for Trip',{exact:true})).toHaveCount(0);
  roster=await getRoster();const baseSelections=Object.fromEntries(roster.braceletRoster.rows.map(row=>[row.code,row.selection||row.stockId||'']));expect((await page.request.patch('/api/operations/daily',{headers,data:{action:'setRosterBracelets',date,branch:'MOT',expectedRevision:roster.braceletRoster.revision,selections:baseSelections}})).ok()).toBe(true);
  await db.opsDailyTrip.update({where:{id:trip.id},data:{status:'PLANNED'}});await db.opsDailyEvent.update({where:{id:birthday.id},data:{status:'PLANNED'}});roster=await getRoster();expect(roster.braceletRoster.rows.find(row=>row.code==='TRIP').stockId).toBe(createdStocks[1]);
 }finally{
  for(const row of oldTrips)await db.opsDailyTrip.update({where:{id:row.id},data:{status:row.status}});for(const row of oldEvents)await db.opsDailyEvent.update({where:{id:row.id},data:{status:row.status}});
  await db.opsDailyTrip.deleteMany({where:{id:{in:createdTrips}}});await db.opsDailyEvent.deleteMany({where:{id:{in:createdEvents}}});await db.opsWristbandStock.deleteMany({where:{id:{in:createdStocks}}});await db.$disconnect();
 }
});
