// Dedicated supervised-pilot checks: no existing E2E global setup, no seed/reset.
const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { PDFDocument } = require('pdf-lib');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');

test('pilot HTTPS gate, real logins, three sessions, writes, files, print and recovery canaries', async ({ browser, playwright, baseURL, httpCredentials, ignoreHTTPSErrors }) => {
  const phase = process.env.PILOT_TEST_PHASE || 'verify';
  const branch = process.env.PILOT_TEST_BRANCH || 'MOT';
  const rosterDate = process.env.PILOT_TEST_DATE || '2026-09-29';
  if (!['seed','verify','cleanup'].includes(phase)) throw new Error('Unknown pilot test phase');
  const evidence = path.resolve(process.env.PILOT_TEST_EVIDENCE || 'tmp/pilot-deployment/browser-evidence'); fs.mkdirSync(evidence, { recursive: true });
  const canaryPath = path.join(evidence, 'canary.json');
  const accounts = JSON.parse(fs.readFileSync(process.env.PILOT_ACCOUNTS_FILE, 'utf8'));
  expect(accounts).toHaveLength(3);
  const denied = await playwright.request.newContext({ baseURL, ignoreHTTPSErrors, httpCredentials: { username:'invalid-pilot-user', password:'invalid-pilot-password' } });
  expect((await denied.get('/login')).status()).toBe(401); await denied.dispose();
  const contexts = [];
  try {
    for (const [index, account] of accounts.entries()) {
      const context = await browser.newContext({ baseURL, httpCredentials, ignoreHTTPSErrors, viewport: [{width:1366,height:768},{width:1440,height:900},{width:1920,height:1080}][index] });
      contexts.push(context); await context.addInitScript(() => localStorage.setItem('bbLanguage','en'));
      const page = await context.newPage(), response = await page.goto('/login');
      expect(response.headers()['x-operations-environment']).toBe('supervised-pilot');
      await expect(page.getByRole('status', { name: 'Supervised pilot environment' })).toBeVisible();
      expect((await context.request.get('/api/operations/employees')).status()).toBe(401);
      await page.locator('input[autocomplete="username"]').fill(account.username);
      await page.locator('input[autocomplete="current-password"]').fill(account.password);
      await page.locator('button[type="submit"]').click();
      await expect(page).toHaveURL(/\/(opmanager|operations)(\?|$)/);
      const cookie = (await context.cookies()).find(cookie => cookie.name === '__Host-billybeez_pilot');
      expect(cookie?.secure).toBe(true); expect(cookie?.httpOnly).toBe(true); expect(cookie?.sameSite).toBe('Strict');
      await page.screenshot({ path: path.join(evidence, 'login-' + index + '-' + phase + '.png') });
    }
    const admin = contexts[0].request;
    expect((await admin.get('/manager')).status()).toBe(404);
    expect((await admin.get('/api/backups')).status()).toBe(404);
    const secret = await admin.get('/api/operations/settings?keys=BUSINESS_DAY_PASSWORD');
    expect((await secret.json()).settings).toEqual([]);
    const employees = (await (await admin.get('/api/operations/employees')).json()).employees;
    expect(employees.length).toBeGreaterThan(0);
    const reads = await Promise.all(contexts.map(context => context.request.get('/api/operations/summary')));
    for (const read of reads) expect(read.ok()).toBe(true);
    let canary;
    if (phase === 'seed') {
      if (fs.existsSync(canaryPath)) throw new Error('Existing canary must be verified/cleaned before reseeding');
      const tag = 'PILOT CHECK ' + Date.now();
      const writes = await Promise.all(contexts.map((context,index) => context.request.post('/api/operations/config', { data: { action:'savePartner', branch, name:tag+' '+index, notes:'Temporary supervised deployment test' } })));
      const partners = [];
      for (const write of writes) { expect(write.ok()).toBe(true); partners.push((await write.json()).record); }
      const employeeId = employees.find(employee => employee.active).id;
      const image = fs.readFileSync(path.resolve('public/billy-favicon.png'));
      const uploaded = await admin.post(`/api/operations/employees/${employeeId}/documents`, { multipart: { employeeId, documentType:'OTHER', displayName:tag, notes:'Temporary pilot upload; no official employee photo replacement', file:{ name:'pilot-test.png', mimeType:'image/png', buffer:image } } });
      expect(uploaded.ok()).toBe(true);
      canary = { baseURL, tag, partners:partners.map(partner=>({id:partner.id,name:partner.name})), employeeId, documentId:(await uploaded.json()).document.id, sha256:sha(image) };
      const jpeg=await require('sharp')(image).jpeg().toBuffer();
      const testPdf=await PDFDocument.create();testPdf.addPage().drawText('PILOT TEST EVIDENCE');const pdf=Buffer.from(await testPdf.save());
      canary.documents=[{id:canary.documentId,sha256:canary.sha256,mimeType:'image/png'}];
      for(const [name,mimeType,buffer]of [['pilot-test.jpg','image/jpeg',jpeg],['pilot-test.pdf','application/pdf',pdf]]){
        const response=await admin.post(`/api/operations/employees/${employeeId}/documents`,{multipart:{employeeId,documentType:'OTHER',displayName:tag+' '+name,notes:'Temporary local pilot file verification',file:{name,mimeType,buffer}}});expect(response.ok()).toBe(true);canary.documents.push({id:(await response.json()).document.id,sha256:sha(buffer),mimeType});
      }
      fs.writeFileSync(canaryPath, JSON.stringify(canary,null,2));
    } else canary = JSON.parse(fs.readFileSync(canaryPath,'utf8'));
    if (canary.baseURL !== baseURL) throw new Error('Canary belongs to a different pilot host');
    const config = await (await admin.get('/api/operations/config')).json();
    for (const partner of canary.partners) expect(config.partners.some(item=>item.id===partner.id && item.name===partner.name)).toBe(true);
    const fileUrl = `/api/operations/employees/${canary.employeeId}/documents/${canary.documentId}`;
    const downloaded = await admin.get(fileUrl+'?download=1'); expect(downloaded.ok()).toBe(true); expect(sha(await downloaded.body())).toBe(canary.sha256);
    for(const file of canary.documents||[]){const response=await admin.get(`/api/operations/employees/${canary.employeeId}/documents/${file.id}?download=1`);expect(response.ok()).toBe(true);expect(sha(await response.body())).toBe(file.sha256);}
    const gatedAnonymous = await playwright.request.newContext({ baseURL, httpCredentials, ignoreHTTPSErrors });
    expect((await gatedAnonymous.get(fileUrl)).status()).toBe(401); await gatedAnonymous.dispose();
    const date = new Date().toISOString().slice(0,10);
    for (const language of ['en','ar']) {
      const response = await admin.get(`/api/operations/employees/${canary.employeeId}/complete-file?mode=STANDARD&year=${date.slice(0,4)}&endDate=${date}&language=${language}&attachments=0`);
      expect(response.ok()).toBe(true); const bytes = await response.body(); expect((await PDFDocument.load(bytes)).getPageCount()).toBe(2); fs.writeFileSync(path.join(evidence,'profile-'+language+'-'+phase+'.pdf'),bytes);
    }
    const page = contexts[0].pages()[0];
    await page.goto('/operations/daily-preview?date='+rosterDate+'&branch='+encodeURIComponent(branch)); await expect(page.locator('.daily-operations-poster')).toBeVisible();
    await page.evaluate(()=>{document.body.dataset.dailyPreviewPrint='true';});
    await page.emulateMedia({media:'print'});
    await expect(page.getByRole('status',{name:'Supervised pilot environment'})).toBeHidden();
    const pdf = await page.pdf({preferCSSPageSize:true,printBackground:true});
    expect((await PDFDocument.load(pdf)).getPageCount()).toBe(1); fs.writeFileSync(path.join(evidence,'roster-'+phase+'.pdf'),pdf);
    if (phase === 'cleanup') {
      for(const file of canary.documents||[{id:canary.documentId}])expect((await admin.delete(`/api/operations/employees/${canary.employeeId}/documents/${file.id}`)).ok()).toBe(true);
      for (const partner of canary.partners) expect((await admin.post('/api/operations/config',{data:{action:'deletePartner',branch,partnerId:partner.id}})).ok()).toBe(true);
    }
    fs.writeFileSync(path.join(evidence,'result-'+phase+'.json'),JSON.stringify({phase,baseURL,completedAt:new Date().toISOString(),logins:3,parallelReads:3,parallelSeparateRecordWrites:phase==='seed'?3:0,canariesVerified:true,fileTypesVerified:(canary.documents||[]).map(file=>file.mimeType),pngHashVerified:true,employeePdfs:'EN/AR two pages',rosterPdf:'one page',publicCertificateVerified:!ignoreHTTPSErrors},null,2));
  } finally { for (const context of contexts) await context.close(); }
});
