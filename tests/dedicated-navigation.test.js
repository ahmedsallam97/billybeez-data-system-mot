const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {PAGES,pageId,legacyOperationsPath}=require('../lib/operations/page-routes');
const {NAVIGATION,parseDashboardSettings,defaultDashboardSettings}=require('../lib/operations/dashboard-settings');
const {NAV_PERMISSIONS}=require('../lib/accounts/registry');
const {routePermission}=require('../lib/accounts/routes');
test('filtering a module-specific daily response does not add unrelated module fields',async()=>{
 const payload={success:true,date:'2026-10-10',branch:'MOT',branchConfig:{branchCode:'MOT'},schedule:null};
 assert.deepEqual(await require('../lib/accounts/payload').filterWorkspacePayload({}, {permissions:{}}, '/api/operations/daily', {...payload}),payload);
});
test('every sidebar destination has a unique path, page component and view permission',()=>{
 assert.equal(new Set(NAVIGATION.map(row=>row[3])).size,NAVIGATION.length);assert.equal(new Set(NAVIGATION.map(([id])=>NAV_PERMISSIONS[id])).size,NAVIGATION.length);
 for(const [id,en,ar,href]of NAVIGATION){assert.ok(en&&ar);assert.equal(href,PAGES[id][0]);assert.ok(!href.includes('?')&&!href.includes('#'));assert.equal(pageId(href),id);assert.ok(fs.existsSync('app'+href+'/page.js'));assert.equal(NAV_PERMISSIONS[id],PAGES[id][3]);}
 const settings=defaultDashboardSettings();settings.navigation.items=settings.navigation.items.filter(row=>!['development','operationalReports'].includes(row.id));const before=JSON.stringify(settings);const upgraded=parseDashboardSettings(settings);assert.equal(upgraded.navigation.items.length,NAVIGATION.length);assert.equal(JSON.stringify(settings),before);
});
test('old query bookmarks redirect safely while retaining filters and record IDs',()=>{
 assert.equal(legacyOperationsPath({tab:'performance',section:'succession',year:'2026',month:'10',planId:'p'}),'/operations/succession?year=2026&month=10&planId=p');
 assert.equal(legacyOperationsPath(new URLSearchParams('tab=performance&section=reports&year=2026&month=10')),'/operations/reports/operational?year=2026&month=10');
 assert.equal(legacyOperationsPath({tab:'daily',date:'2026-10-10'}),'/operations/attendance?date=2026-10-10');
 assert.ok(legacyOperationsPath({tab:'https://outside.test',section:'//outside.test'}).startsWith('/operations/daily'));
});
test('planning permissions are independently enforced on reads and direct writes',()=>{
 for(const [mode,permission]of Object.entries({succession:'succession.view',development:'development.view',reports:'performance_reports.view'}))assert.equal(routePermission('/api/operations/planning','GET',{},new URLSearchParams({mode})),permission);
 for(const [action,permission]of Object.entries({createSuccession:'succession.create',createDevelopment:'development.create',updateAssignment:'development.edit',decideReadiness:'succession.edit'}))assert.equal(routePermission('/api/operations/planning','POST',{action}),permission);
 assert.equal(routePermission('/api/operations/planning','POST',{action:'unknown'}),null);assert.equal(routePermission('/api/operations/planning','GET',{},new URLSearchParams({mode:'anything'})),null);
 assert.ok(!fs.readFileSync('app/operations/PerformanceWorkspace.jsx','utf8').includes('role="tablist"'));assert.ok(!fs.readFileSync('app/operations/PlanningWorkspace.jsx','utf8').includes('MonthlyWinnerArtwork'));
});
