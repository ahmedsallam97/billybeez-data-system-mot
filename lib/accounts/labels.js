// Presentation only: permission keys and authorization rules remain in registry.js.
const MODULE_LABELS = {
  dashboard: ["لوحة العمليات", "Dashboard"],
  operations: ["العمليات اليومية", "Daily operations"],
  employees: ["الموظفون وملفاتهم", "Employees & Employee 360"],
  files: ["مستندات الموظفين", "Employee documents"],
  roster: ["الروستر اليومي", "Daily roster"],
  schedules: ["الجدول الشهري", "Monthly schedule"],
  attendance: ["الحضور والانصراف", "Attendance"],
  evaluations: ["التقييم اليومي", "Daily evaluations"],
  appraisals: ["التقييم الشهري", "Monthly evaluations"],
  competencies: ["الكفاءات والتأهيل", "Competencies"],
  development: ["خطط التطوير", "Development plans"],
  performance_reports: ["تقارير الأداء", "Performance reports"],
  succession: ["الخلافة الوظيفية", "Succession paths"],
  rotations: ["توزيع المواقع", "Rotations"],
  breaks: ["الاستراحات", "Breaks"],
  stock: ["المخزون", "Stock"],
  trips: ["الرحلات", "Trips"],
  birthdays: ["أعياد الميلاد", "Birthdays"],
  leadership: ["تقارير قيادة الشيفت", "Shift leadership"],
  offers: ["العروض", "Offers"],
  leave: ["الإجازات والطلبات", "Leave & requests"],
  overtime: ["الوقت الإضافي", "Overtime"],
  holidays: ["العطلات الرسمية", "Public holidays"],
  eom: ["موظف الشهر", "Employee of the month"],
  hall: ["قاعة المتميزين", "Hall of Fame"],
  reports: ["التقارير التشغيلية", "Operational reports"],
  notifications: ["التنبيهات", "Notifications"],
  editors: ["المحررات والقوالب", "Live editors & templates"],
  appearance: ["المظهر والألوان", "Appearance & themes"],
  branches: ["إعدادات الفروع", "Branch settings"],
  settings: ["إعدادات النظام", "System settings"],
  backups: ["حالة النسخ الاحتياطي", "Backup status"],
  users: ["إدارة الحسابات", "Account management"],
  roles: ["الأدوار والصلاحيات", "Roles & permissions"],
  audit: ["سجل المراجعة", "Audit log"],
};
const ACTION_LABELS = {
  view: ["عرض", "View"],
  details: ["عرض التفاصيل", "View details"],
  sensitive: ["عرض البيانات الحساسة", "View sensitive information"],
  create: ["إضافة", "Create"],
  edit: ["تعديل", "Edit"],
  archive: ["حذف أو أرشفة", "Delete or archive"],
  restore: ["استعادة", "Restore"],
  assign: ["تعيين وتوزيع", "Assign"],
  approve: ["اعتماد", "Approve"],
  publish: ["نشر", "Publish"],
  lock: ["قفل", "Lock"],
  unlock: ["إعادة فتح", "Unlock"],
  import: ["استيراد", "Import"],
  export: ["تصدير", "Export"],
  upload: ["رفع ملفات", "Upload files"],
  download: ["تنزيل ملفات", "Download files"],
  print: ["طباعة", "Print"],
  pdf: ["إنشاء PDF", "Generate PDF"],
  share: ["مشاركة", "Share"],
  issue: ["صرف مخزون", "Issue stock"],
  templates: ["إدارة القوالب", "Manage templates"],
  configure: ["تغيير الإعدادات", "Configure"],
  resetPassword: ["إعادة تعيين كلمة المرور", "Reset password"],
  revokeSessions: ["تسجيل خروج الجلسات", "Revoke sessions"],
  activity: ["عرض نشاط الحسابات", "View account activity"],
};
const SCOPE_LABELS = {
  OWN: ["سجلاتي فقط", "Own records"],
  TEAM: ["الموظفون المحددون للفريق", "Assigned team"],
  BRANCH: ["الفرع المعين", "Assigned branch"],
  SELECTED: ["الفروع المحددة", "Selected branches"],
  ALL: ["جميع الفروع", "All branches"],
};
const label = (labels, key, arabic) => labels[key]?.[arabic ? 0 : 1] || key;
const moduleLabel = (key, arabic) => label(MODULE_LABELS, key, arabic);
const actionLabel = (key, arabic) => label(ACTION_LABELS, key, arabic);
const scopeLabel = (key, arabic) => label(SCOPE_LABELS, key, arabic);
function permissionLabel(key, arabic) {
  const [module, action] = key.split(".");
  return action
    ? `${moduleLabel(module, arabic)} — ${actionLabel(action, arabic)}`
    : key;
}
module.exports = { moduleLabel, actionLabel, scopeLabel, permissionLabel };
