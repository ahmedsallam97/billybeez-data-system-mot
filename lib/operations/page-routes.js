// Stable module ownership. Query parameters within a page are filters, never module switches.
const PAGES = {
 dashboard: ['/opmanager','Dashboard','لوحة العمليات','dashboard.view'],
 employees: ['/operations/employees','Employees','الموظفون','employees.view'],
 schedule: ['/operations/schedule','Monthly Schedule','الجدول الشهري','schedules.view'],
 daily: ['/operations/attendance','Attendance','الحضور','attendance.view'],
 roster: ['/operations/daily','Daily Roster','الروستر اليومي','roster.view'],
 evaluation: ['/operations/evaluations/daily','Daily Evaluations','التقييمات اليومية','evaluations.view'],
 performance: ['/operations/evaluations/monthly','Monthly Evaluations','التقييمات الشهرية','appraisals.view'],
 eotm: ['/operations/employee-of-the-month','Employee of the Month','موظف الشهر','eom.view'],
 hall: ['/operations/hall-of-fame','Hall of Fame','قاعة المتميزين','hall.view'],
 succession: ['/operations/succession','Succession','الخلافة الوظيفية','succession.view'],
 development: ['/operations/development','Development','التطوير','development.view'],
 trips: ['/operations/trips','Trips','الرحلات','trips.view'],
 birthdays: ['/operations/birthdays','Birthdays','أعياد الميلاد','birthdays.view'],
 offers: ['/operations/offers','Offers','العروض','offers.view'],
 stock: ['/operations/stock','Stock','المخزون','stock.view'],
 time: ['/operations/leave-time','Leave & Time','الإجازات والوقت','leave.view'],
 reports: ['/operations/reports/performance','Performance Reports','تقارير الأداء','performance_reports.view'],
 operationalReports: ['/operations/reports/operational','Operational Reports','التقارير التشغيلية','reports.view'],
 audit: ['/operations/log','Operations Log','سجل العمليات','audit.view'],
 settings: ['/opmanager/settings','Settings','الإعدادات','settings.view'],
};
function pageId(path) { return Object.keys(PAGES).find(id => PAGES[id][0] === path) || (path === '/operations/daily-preview' ? 'roster' : path.startsWith('/opmanager/settings/') ? 'settings' : null); }
function legacyOperationsPath(params = {}) {
 const get = key => params instanceof URLSearchParams ? params.get(key) : params[key];
 const section = get('section'), tab = get('tab');
 const id = tab === 'performance' ? ({appraisal:'performance',eotm:'eotm',hall:'hall',succession:'succession',reports:'operationalReports'}[section] || 'performance') : (PAGES[tab] ? tab : 'roster');
 const query = new URLSearchParams();
 for (const [key,value] of params instanceof URLSearchParams ? params.entries() : Object.entries(params)) {
  if (['tab','section','uiEntry'].includes(key) || value == null) continue;
  for (const item of Array.isArray(value) ? value : [value]) query.append(key,String(item));
 }
 return PAGES[id][0] + (query.size ? '?' + query : '');
}
module.exports={PAGES,pageId,legacyOperationsPath};
