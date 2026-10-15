const { authorizePerformanceSettingsScope } = require("./performance-settings-service");

async function operationsBranch(db, user, requested) {
  if(user.profile){const row=await db.systemSetting.findUnique({where:{key:'OPS_BRANCH_CONFIG'}});const fallback=JSON.parse(row?.value||'{}').branchCode||'MOT';const branch=String(requested||user.profile.branches[0]||fallback).trim().toUpperCase();if(!/^[A-Z0-9_-]{1,80}$/.test(branch)||(!user.profile.allBranches&&!user.profile.branches.includes(branch)))throw Object.assign(new Error('Branch access denied'),{status:403});return branch;}
  if (user.role === "MANAGER") return (await authorizePerformanceSettingsScope(db, user, requested)).scope.branch;
  const row = await db.systemSetting.findUnique({ where: { key: "OPS_BRANCH_CONFIG" } });
  let branch;
  try { branch = JSON.parse(row?.value || "{}").branchCode; } catch { throw new Error("Branch settings are invalid"); }
  const chosen = String(requested || branch || "MOT").trim().toUpperCase();
  return (await authorizePerformanceSettingsScope(db, user, chosen)).scope.branch;
}

function assertBusinessRole(user, roles, employeeId) {
  if (!Array.isArray(roles) || !roles.includes(user.role)) throw new Error("Your role cannot perform this configured action");
  if (employeeId && user.employeeId === employeeId) throw new Error("You cannot approve or adjust your own score");
}

async function employeeBranchFilter(db, branch) {
  const row=await db.systemSetting.findUnique({where:{key:'OPS_BRANCH_CONFIG'}});
  let defaultBranch;try{defaultBranch=JSON.parse(row?.value||'{}').branchCode;}catch{throw new Error('Branch settings are invalid');}
  return branch===String(defaultBranch||'MOT').trim().toUpperCase() ? {OR:[{branch},{branch:null}]} : {branch};
}
async function assertEmployeeBranch(db, employee, branch) {
  const scope=await employeeBranchFilter(db,branch);
  if(employee.branch ? employee.branch!==branch : !scope.OR) throw Object.assign(new Error('Employee belongs to another branch'),{status:403});
}
module.exports = { operationsBranch, assertBusinessRole, employeeBranchFilter, assertEmployeeBranch };
