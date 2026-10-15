const test=require('node:test'),assert=require('node:assert/strict');
const {READ_KEYS,employeeReadPermissions,employee360Selection}=require('../lib/operations/employee-360-access');
test('FD02 denied employee modules and private scalar fields are never selected for preload',()=>{
 const selected=employee360Selection({'schedules.view':true});
 assert.ok(selected.name&&selected.scheduleAssignments);
 for(const key of ['nationalId','phone','employmentPeriods','documents','attendanceRecords','monthlyAppraisals','guestFeedback','qualifications','eotmWins','overtimeAccount'])assert.ok(!selected[key],key);
 const photoOnly=employee360Selection({'files.download':true});assert.deepEqual(photoOnly.documents.where,{documentType:'EMPLOYEE_PHOTO',status:'ACTIVE'});
});
test('FD02 module grants respect the selected employee scope, independently of the page grant',async()=>{
 const calls=[];const allowed=await employeeReadPermissions({}, {permissions:{'employees.details':'ALL','employees.sensitive':'OWN','appraisals.view':'ALL','attendance.view':'TEAM'}},'other',async(_,user,key)=>{calls.push(key);return {unrestricted:key==='appraisals.view',employeeIds:['self']};});
 assert.equal(allowed['employees.sensitive'],false);assert.equal(allowed['attendance.view'],false);assert.equal(allowed['appraisals.view'],true);assert.equal(calls.length,3);
 const full=employee360Selection(Object.fromEntries(READ_KEYS.map(key=>[key,true])));assert.ok(full.nationalId&&full.employmentPeriods&&full.monthlyAppraisals&&full.eotmWins);
 const {permittedEmployeeTabs}=require('../lib/operations/employee-tabs');assert.deepEqual(permittedEmployeeTabs(['Overview','Personal','Schedule & Attendance','Performance'],{'employees.sensitive':'OWN','attendance.view':'TEAM','appraisals.view':'ALL'},allowed),['Overview','Performance']);
});
test('UX08 native and server errors share a field without losing either error or the existing hint',()=>{
 const {associateFieldError}=require('../lib/client/field-feedback');
 const attrs=new Map([['aria-describedby','appointment-hint'],['aria-invalid','false']]);const field={getAttribute:key=>attrs.get(key)??null,setAttribute:(key,value)=>attrs.set(key,value),removeAttribute:key=>attrs.delete(key)};
 const native=associateFieldError(field,'native-error'),server=associateFieldError(field,'server-error');assert.equal(attrs.get('aria-invalid'),'true');
 native();assert.equal(attrs.get('aria-invalid'),'true');assert.equal(attrs.get('aria-describedby'),'appointment-hint server-error');
 server();assert.equal(attrs.get('aria-invalid'),'false');assert.equal(attrs.get('aria-describedby'),'appointment-hint');server();assert.equal(attrs.get('aria-describedby'),'appointment-hint');
});
test('UX05 and UX13 joined booking event codes identify the real action and resource in both languages',()=>{
 const {eventLabel}=require('../lib/operational-copy');
 for(const [code,english,arabic]of [['OPS_CREATETRIP','Trip booking created','إنشاء حجز رحلة'],['OPS_UPDATEEVENT','Birthday booking updated','تعديل حجز عيد ميلاد'],['OPS_DELETEOFFER','Offer removed','إزالة عرض']]){assert.equal(eventLabel(code,'en'),english);assert.equal(eventLabel(code,'ar'),arabic);}
 const {translateUiCopy}=require('../lib/ui-copy');assert.equal(translateUiCopy('Use a unique catalog code.','ar'),'استخدم كودًا فريدًا للكتالوج.');assert.equal(translateUiCopy('Incident status','ar'),'حالة الواقعة');
});
