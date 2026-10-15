const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {PAGES}=require('../lib/operations/page-routes');
const {NAVIGATION,defaultDashboardSettings,parseDashboardSettings}=require('../lib/operations/dashboard-settings');
const {NAV_PERMISSIONS,PERMISSIONS}=require('../lib/accounts/registry');
test('retained legacy role metadata has a safe account home without granting module access',()=>{
  const {getRoleHome}=require('../lib/roles');
  for(const role of ['CASHIER','KITCHEN','DATA'])assert.equal(getRoleHome(role),'/account');
  for(const role of ['ADMIN','MANAGER'])assert.equal(getRoleHome(role),'/opmanager');
});
const REMOVED_SOURCE=[
  ".clasp.json",
  ".claspignore",
  "app.js",
  "app/BusinessDayControl.jsx",
  "app/OrderAlerts.jsx",
  "app/OrderItemsSummary.jsx",
  "app/api/business-day/route.js",
  "app/api/categories/route.js",
  "app/api/child-names/route.js",
  "app/api/customers/route.js",
  "app/api/dashboard/route.js",
  "app/api/devices/route.js",
  "app/api/front-dashboard/route.js",
  "app/api/loyalty/rewards/route.js",
  "app/api/loyalty/route.js",
  "app/api/orders/[id]/archive/route.js",
  "app/api/orders/[id]/deliver/route.js",
  "app/api/orders/[id]/geidea/route.js",
  "app/api/orders/[id]/items/route.js",
  "app/api/orders/[id]/left/route.js",
  "app/api/orders/[id]/merge/route.js",
  "app/api/orders/[id]/pay/route.js",
  "app/api/orders/[id]/route.js",
  "app/api/orders/[id]/system/route.js",
  "app/api/orders/[id]/unarchive/route.js",
  "app/api/orders/route.js",
  "app/api/payment-providers/route.js",
  "app/api/print-jobs/[id]/route.js",
  "app/api/print-jobs/route.js",
  "app/api/products/route.js",
  "app/api/reports/daily/route.js",
  "app/api/reports/payments/route.js",
  "app/api/reports/products/route.js",
  "app/cashier/CashierClient.jsx",
  "app/cashier/page.js",
  "app/categoryRules.js",
  "app/data/page.js",
  "app/front/FrontClient.jsx",
  "app/front/page.js",
  "app/invoice/[id]/InvoicePrint.jsx",
  "app/invoice/[id]/page.js",
  "app/kitchen-cashier/page.js",
  "app/kitchen-ticket/[id]/KitchenTicketPrint.jsx",
  "app/kitchen-ticket/[id]/page.js",
  "app/kitchen/KitchenClient.jsx",
  "app/kitchen/QuickRestaurantOrder.jsx",
  "app/kitchen/page.js",
  "app/manager/ManagerClient.jsx",
  "app/manager/page.js",
  "app/recordTableStyles.js",
  "app/uiMessages.js",
  "appsscript.json",
  "auth.js",
  "cashier.html",
  "code.gs",
  "config.js",
  "dashboard.html",
  "delivery.html",
  "index.html",
  "invoice.html",
  "lib/active-bracelets.js",
  "lib/invoice-qr.js",
  "lib/kitchen-ticket-rules.js",
  "lib/loyalty.js",
  "lib/numbering.js",
  "lib/order-records.js",
  "lib/order-workflow.js",
  "lib/order-workflow.mjs",
  "lib/orders.js",
  "lib/product-availability.js",
  "lib/validation.js",
  "lib/workflow-rules.js",
  "lib/workflow-rules.mjs",
  "orders.html",
  "scripts/cleanup-quick-product-duplicates.js",
  "scripts/import-apps-script.js",
  "scripts/import-items-categories.js",
  "scripts/migrate-workflow-state.js",
  "scripts/product-images.js",
  "scripts/sync-product-images.js",
  "style.css",
  "tests/loyalty.test.js",
  "tests/numbering.test.mjs",
  "tests/order-serialization.test.mjs",
  "tests/order-workflow.test.mjs",
  "tests/workflow-rules.test.mjs",
  "tests/workflow-validation.test.js"
];
const REQUIRED_SHARED=[
  "app/api/backups/route.js",
  "app/api/backups/[name]/route.js",
  "lib/business-day.js",
  "lib/daily-snapshot.js",
  "lib/role-matrix.js",
  "lib/roles.js",
  "lib/accounts/registry.js",
  "lib/accounts/service.js",
  "app/api/employees/route.js",
  "app/api/users/route.js",
  "app/api/settings/route.js",
  "app/api/reports/audit/route.js",
  "lib/operations/current-employee-qualifications.js",
  "lib/operations/rotation-handover-config.js",
  "scripts/qualify-current-employees.js",
  "scripts/configure-rotation-handover.js",
  "app/settings/page.js",
  "app/operations/page.js",
  "app/operations/daily-preview/page.js"
];
test('confirmed legacy page routes, APIs and exclusive source are absent from the active code',()=>{
 for(const file of REMOVED_SOURCE)assert.equal(fs.existsSync(file),false,file+' must remain absent');
 const shell=fs.readFileSync('app/AppShell.jsx','utf8');
 assert.ok(!/HIDE_SECONDARY_WORKSPACES|BusinessDayControl|nav-front|nav-data|nav-kitchen|nav-database/.test(shell));
});
test('all enabled sidebar modules retain their unique page and permission ownership',()=>{
 assert.equal(NAVIGATION.length,20);
 assert.equal(new Set(NAVIGATION.map(row=>row[3])).size,NAVIGATION.length);
 for(const [id,,,href]of NAVIGATION){assert.equal(href,PAGES[id][0]);assert.ok(fs.existsSync('app'+href+'/page.js'),href);assert.equal(NAV_PERMISSIONS[id],PAGES[id][3]);assert.ok(PERMISSIONS.some(p=>p.key===PAGES[id][3]));}
});
test('shared account, backup, schema-compatible helpers and Operations redirect routes remain',()=>{
 for(const file of REQUIRED_SHARED)assert.ok(fs.existsSync(file),file+' is required shared source');
 for(const file of ['prisma/schema.prisma','prisma/postgres/schema.prisma','app/api/operations/reports/route.js','app/api/operations/performance/route.js','app/api/operations/responsibilities/route.js','app/operations/RotationPreview.jsx','app/operations/Employee360View.jsx','deploy/pilot/Dockerfile','deploy/pilot/compose.yml','scripts/pilot-backup.js'])assert.ok(fs.existsSync(file),file);
});
test('a saved navigation preference cannot erase an enabled module from route ownership',()=>{
 const config=defaultDashboardSettings();config.navigation.items.find(row=>row.id==='employees').visible=false;
 const parsed=parseDashboardSettings(config);assert.equal(parsed.navigation.items.find(row=>row.id==='employees').visible,false);assert.ok(PAGES.employees);assert.ok(fs.existsSync('app'+PAGES.employees[0]+'/page.js'));
});
test('active source has no imports of removed exclusive modules',()=>{
 const removed=new Set(REMOVED_SOURCE);
 const walk=dir=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(ent=>ent.isDirectory()?walk(path.join(dir,ent.name)):[path.join(dir,ent.name)]);
 for(const file of [...walk('app'),...walk('lib')].filter(file=>/\.(?:js|jsx|mjs|cjs)$/.test(file))){const text=fs.readFileSync(file,'utf8');for(const match of text.matchAll(/\b(?:from\s*|require\s*\(\s*|import\s*\(\s*|import\s*)['"]([^'"]+)['"]/g)){const spec=match[1];let target=spec.startsWith('@/')?spec.slice(2):spec.startsWith('.')?path.join(path.dirname(file),spec):null;if(!target)continue;target=target.replace(/\\/g,'/');for(const possible of [target,...['.js','.jsx','.cjs','.mjs','/index.js','/index.jsx'].map(suffix=>target+suffix)])assert.equal(removed.has(possible),false,file+' imports removed '+possible);}}
});
test('legacy-only executable commands are removed without altering active build/deployment scripts',()=>{
 const pkg=JSON.parse(fs.readFileSync('package.json'));for(const command of ['db:migrate-workflow','products:images','products:cleanup-quick-duplicates','items:import','db:import:apps-script','clasp:push'])assert.equal(pkg.scripts[command],undefined);
 assert.equal(pkg.scripts.build,'node scripts/ensure-prisma-clients.js && next build');assert.ok(pkg.scripts['db:backup']&&pkg.scripts['db:restore']&&pkg.scripts['db:pg:migrate']);
});
