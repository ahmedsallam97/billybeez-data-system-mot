const {resolveScope}=require('../accounts/enforcement');
const READ_KEYS=['employees.sensitive','files.view','files.download','competencies.view','schedules.view','attendance.view','evaluations.view','appraisals.view','eom.view','succession.view','leave.view','overtime.view','reports.view'];
const BASIC_FIELDS=['id','name','nameAr','nameEn','operationalName','hrisNumber','localEmployeeCode','branch','department','jobTitle','employmentType','employmentStatus','active','gender','hireDate','joinDate','createdAt','updatedAt','operationsTeamLeader'];
const PRIVATE_FIELDS=['nationalId','supervisorId','sourceEmployeeId','dateOfBirth','phone','address','emergencyName','emergencyPhone','emergencyRelation','personalNotes'];
async function employeeReadPermissions(db,user,employeeId,resolve=resolveScope){
 const entries=await Promise.all(READ_KEYS.map(async key=>{if(!user.permissions?.[key])return [key,false];const scope=await resolve(db,user,key);return [key,Boolean(scope.unrestricted||scope.employeeIds.includes(employeeId))];}));
 return Object.fromEntries(entries);
}
function employee360Selection(allowed){
 const sensitive=allowed['employees.sensitive'];
 const select=Object.fromEntries([...BASIC_FIELDS,...(sensitive?PRIVATE_FIELDS:[])].map(key=>[key,true]));
 if(sensitive){select.employmentPeriods={orderBy:{startDate:'desc'},include:{assignments:{orderBy:{effectiveFrom:'desc'}}}};select.employmentEvents={orderBy:{effectiveDate:'desc'}};select.guestFeedback={orderBy:{feedbackDate:'desc'}};select.guidanceRecords={orderBy:{recordDate:'desc'}};select.incidents={orderBy:{incidentDate:'desc'}};}
 if(allowed['files.view'])select.documents={orderBy:{uploadedAt:'desc'}};
 else if(allowed['files.download'])select.documents={where:{documentType:'EMPLOYEE_PHOTO',status:'ACTIVE'},orderBy:{uploadedAt:'desc'},take:1};
 if(allowed['competencies.view']){select.trainingRecords={orderBy:{completedDate:'desc'}};select.qualifications={include:{position:true},orderBy:{createdAt:'desc'}};}
 if(allowed['schedules.view'])select.scheduleAssignments={where:{schedule:{status:'PUBLISHED'}},include:{schedule:true},orderBy:{workDate:'desc'},take:1500};
 if(allowed['attendance.view'])select.attendanceRecords={include:{attendanceDay:true},orderBy:{createdAt:'desc'},take:1500};
 if(allowed['leave.view'])select.leaveAccounts={include:{transactions:{orderBy:{effectiveDate:'desc'}}}};
 if(allowed['overtime.view'])select.overtimeAccount={include:{transactions:{orderBy:{transactionDate:'desc'}}}};
 if(allowed['evaluations.view'])select.dailyEvaluations={include:{dailyEvaluationDay:true},orderBy:{createdAt:'desc'},take:100};
 if(allowed['appraisals.view'])select.monthlyAppraisals={orderBy:[{year:'desc'},{month:'desc'}]};
 if(allowed['eom.view'])select.eotmWins={where:{status:'LOCKED'},orderBy:[{year:'desc'},{month:'desc'}]};
 if(allowed['succession.view'])select.successionCandidates={include:{reviews:{orderBy:{reviewDate:'desc'}}}};
 return select;
}
module.exports={READ_KEYS,BASIC_FIELDS,PRIVATE_FIELDS,employeeReadPermissions,employee360Selection};
