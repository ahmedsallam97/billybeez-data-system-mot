const TAB_PERMISSIONS = { Personal:'employees.sensitive', Employment:'employees.sensitive', Documents:'files.view', Files:'files.view', 'Schedule & Attendance':['schedules.view','attendance.view'], 'Leaves & Balances':'leave.view', Performance:['evaluations.view','appraisals.view'], 'Guest Feedback':'employees.sensitive', 'Guidance & Penalties':'employees.sensitive', Incidents:'employees.sensitive', 'Training & Qualifications':'competencies.view', Recognition:'eom.view', Timeline:'employees.sensitive', 'Manager AI Assistant':'employees.sensitive' };
function permittedEmployeeTabs(tabs, permissions = {}, sectionPermissions = {}) {
  return tabs.filter(name => !TAB_PERMISSIONS[name] || [].concat(TAB_PERMISSIONS[name]).some(key => permissions[key] && sectionPermissions[key] !== false));
}
module.exports = { TAB_PERMISSIONS, permittedEmployeeTabs };
