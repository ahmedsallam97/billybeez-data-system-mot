const SETTINGS_PAGES=[
 ['dashboard','Dashboard','لوحة العمليات','Title, sections and cards','العنوان والأقسام والبطاقات','settings.view'],
 ['navigation','Navigation & landing','التنقل وصفحة البداية','Menus and your starting view','القوائم وصفحة البداية','settings.view'],
 ['appearance','Appearance','المظهر','Brand accents and spacing','ألوان العلامة والمسافات','settings.view'],
 ['attention','Attention','التنبيهات','Priorities and alert visibility','الأولويات وظهور التنبيهات','settings.view'],
 ['roster','Schedule, shifts & team','الجدول والشيفتات والفريق','Schedules, shift times and rotation coverage','الجدول ومواعيد الشيفتات وتغطية التوزيعات','settings.view'],
 ['live-editors','Live template editors','محررات القوالب المباشرة','Roster, Employee of the Month and Hall of Fame','الروستر وموظف الشهر وقاعة المتميزين','settings.view'],
 ['rules','Evaluation & operating rules','التقييم وقواعد التشغيل','Attendance, leave and scoring','الحضور والإجازات والدرجات','settings.view'],
 ['performance-settings','Performance & Reports','الأداء والتقارير','Versioned business configuration','قواعد العمل بإصدارات','settings.view'],
 ['master','Operations data','بيانات العمليات','Catalogues and supplies','الكتالوج والمستلزمات','settings.view'],
 ['access','Users & Access Management','المستخدمون وإدارة الوصول','Accounts, profiles and access assignments','الحسابات والملفات وتكليفات الوصول','users.view'],
 ['roles','Roles & Permissions','الأدوار والصلاحيات','Independent page and action permissions','صلاحيات الصفحات والإجراءات المستقلة','roles.view'],
 ['account-activity','Account activity','سجل نشاط الحسابات','Review account and permission changes','راجع تغييرات الحسابات والصلاحيات','users.activity'],
];
const UI_CATEGORIES=['dashboard','navigation','appearance','attention'];
const PERFORMANCE_SECTIONS=[['reports','Report Settings','إعدادات التقارير'],['processes','Process Templates','قوالب الإجراءات'],['surveys','Survey Templates','قوالب الاستبيان'],['rewards','Rewards, Penalties & Evaluation','المكافآت والجزاءات والتقييم'],['appraisal','Monthly Appraisal','التقييم الشهري'],['suitability','Suitability & Recommendations','الملاءمة والتوصيات'],['leadership','Shift Leadership & Staffing','قيادة الشيفت والتوظيف'],['succession','Succession Paths & Competencies','مسارات الخلافة والكفاءات'],['permissions','Permissions & Approvals','الصلاحيات والاعتمادات']];
const TEMPLATE_SECTIONS=[['roster','Roster','الروستر'],['monthly','Employee of the Month','موظف الشهر'],['hall','Hall of Fame','قاعة المتميزين']];
const sectionDescriptions={
 reports:['Set evidence, approval and locking requirements for each report type.','حدد الأدلة والاعتماد والقفل لكل نوع تقرير.'],
 processes:['Maintain bilingual procedures and their versioned steps.','إدارة الإجراءات باللغتين وخطواتها بإصدارات.'],
 surveys:['Review survey questions and response choices before publication.','راجع أسئلة الاستبيان والاختيارات قبل النشر.'],
 rewards:['Configure event scoring and the criteria used in daily evaluations.','ضبط درجات الأحداث وبنود التقييم اليومي.'],
 appraisal:['Review monthly scoring weights and evaluation requirements.','مراجعة أوزان الدرجات الشهرية ومتطلبات التقييم.'],
 suitability:['Configure the evidence and rules behind employee recommendations.','ضبط الأدلة والقواعد المستخدمة في توصيات الموظفين.'],
 leadership:['Manage shift leadership and staffing requirements.','إدارة متطلبات قيادة الشيفت والتوظيف.'],
 succession:['Define career paths, competencies and review frequencies.','تحديد المسارات الوظيفية والكفاءات ودوريات المراجعة.'],
 permissions:['Review the approval and publication rules for performance workflows.','مراجعة قواعد الاعتماد والنشر لمسارات الأداء.'],
};
for(const row of PERFORMANCE_SECTIONS)row.push(...sectionDescriptions[row[0]]);
for(const row of TEMPLATE_SECTIONS)row.push('Edit the design; use the optional preview to inspect the result.','عدّل التصميم، وافتح المعاينة عند الحاجة لمراجعة النتيجة.');
function settingsPath(category,section){return '/opmanager/settings/'+category+(section?'/'+section:'');}
const SETTINGS_NAV_GROUPS = [
 {id:'general',en:'General',ar:'عام',categories:['dashboard','navigation','appearance','attention']},
 {id:'operations',en:'Operations',ar:'العمليات',categories:['roster','rules','master']},
 {id:'templates',en:'Template Editors',ar:'محررات القوالب',categories:['live-editors']},
 {id:'performance',en:'Performance & Reports',ar:'الأداء والتقارير',categories:['performance-settings']},
 {id:'access',en:'Access & System',ar:'الوصول والنظام',categories:['access','roles','account-activity']},
];
// Navigation reuses the enabled route catalog and its existing permission keys.
function settingsNavigationGroups(permissions={}) {
 return SETTINGS_NAV_GROUPS.map(group=>{
  const pages=group.categories.flatMap(category=>{
   const row=SETTINGS_PAGES.find(item=>item[0]===category);
   if(!permissions[row[5]])return [];
   const sections=category==='live-editors'?TEMPLATE_SECTIONS:category==='performance-settings'?PERFORMANCE_SECTIONS:null;
   return sections?sections.map(([id,en,ar])=>({id:category+'/'+id,en,ar,href:settingsPath(category,id),permission:row[5],persist:'dashboard-ui'})):
    [{id:category,en:row[1],ar:row[2],href:settingsPath(category),permission:row[5],persist:'dashboard-ui'}];
  });
  if(group.id==='access'&&permissions['audit.view'])pages.push({id:'audit',en:'Audit & system',ar:'السجل والنظام',href:'/operations/log',permission:'audit.view'});
  return {...group,pages};
 }).filter(group=>group.pages.length);
}
function legacySettingsPath(params={}){
 const read=key=>params instanceof URLSearchParams?params.get(key):params[key];
 let category=read('category')||read('tab')||'dashboard',section=read('section');
 if(category==='insights')return '/opmanager';
 if(category==='safety')return '/operations/log';
 if(category==='template'){category='live-editors';section='roster';}
 if(category==='recognition'){category='live-editors';section='monthly';}
 if(category==='access'&&['roles','activity'].includes(read('accessTab')))category=read('accessTab')==='roles'?'roles':'account-activity';
 if(!SETTINGS_PAGES.some(row=>row[0]===category))category='dashboard';
 if(category==='performance-settings'&&!PERFORMANCE_SECTIONS.some(row=>row[0]===section))section=null;
 else if(category==='live-editors'&&!TEMPLATE_SECTIONS.some(row=>row[0]===section))section=null;
 else if(!['performance-settings','live-editors'].includes(category))section=null;
 const query=new URLSearchParams();
 for(const [key,value]of params instanceof URLSearchParams?params.entries():Object.entries(params))if(!['category','tab','section','accessTab'].includes(key)&&value!=null)for(const item of Array.isArray(value)?value:[value])query.append(key,String(item));
 return settingsPath(category,section)+(query.size?'?'+query:'');
}
module.exports={SETTINGS_PAGES,UI_CATEGORIES,PERFORMANCE_SECTIONS,TEMPLATE_SECTIONS,SETTINGS_NAV_GROUPS,settingsNavigationGroups,settingsPath,legacySettingsPath};
