const { parseOptionalDate } = require("./employees");
const STATUSES = {
  training:["COMPLETED","IN_PROGRESS","EXPIRED"],
  qualification:["QUALIFIED","TRAINING","RESTRICTED","NOT_QUALIFIED","EXPIRED"],
  guestFeedback:["OPEN","RESOLVED","NO_ACTION"],
  guidance:["OPEN","CLOSED","APPEALED"],
  incident:["OPEN","INVESTIGATING","CLOSED"],
  incidentUpdate:["OPEN","INVESTIGATING","CLOSED"],
};
function validateEmployeeRecordInput(body) {
  if(!body || typeof body!=="object" || Array.isArray(body))throw new Error("Employee record must be an object");
  if(!["convertToHris","employmentEvent",...Object.keys(STATUSES)].includes(body.action))throw new Error("Unknown Employee 360 action");
  if(body.status!==undefined&&!STATUSES[body.action]?.includes(body.status))throw new Error("Invalid record status");
  for(const key of ["effectiveDate","contractEnd","completedDate","expiryDate","feedbackDate","recordDate","followUpDate","incidentDate"]){if(body[key])parseOptionalDate(body[key],key);}
  for(const [start,end]of [["effectiveDate","expiryDate"],["completedDate","expiryDate"],["recordDate","followUpDate"]]){
    if(body[start]&&body[end]&&body[end]<body[start])throw new Error(end+" cannot be before "+start);
  }
  if(body.action==="employmentEvent"&&!["POSITION_CHANGE","BRANCH_TRANSFER","SUPERVISOR_CHANGE","OTHER"].includes(body.eventType))throw new Error("Invalid employment event type");
  if(body.applyCurrent!==undefined&&typeof body.applyCurrent!=="boolean")throw new Error("Apply current must be a boolean");
  for(const [key,value]of Object.entries(body)){if(typeof value==="string"&&value.length>4000)throw new Error(key+" is too long");}
  return body;
}
module.exports={validateEmployeeRecordInput};
