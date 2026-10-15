const { annualEmployeeInsights } = require("./employee-intelligence");
const { qualificationState } = require("./live-daily");

const isoDate = value => value instanceof Date ? value.toISOString().slice(0,10) : String(value || "").slice(0,10);
const leaveBalance = (account, endDate) => (account.transactions || []).filter(item => item.status === "VALID" && isoDate(item.effectiveDate) <= endDate).reduce((sum,item) => sum + Number(item.amount || 0),0);

function employeeProfileSummary(employee, endDate = new Date().toISOString().slice(0, 10), year = Number(endDate.slice(0, 4))) {
  const insight = annualEmployeeInsights(employee, year, endDate);
  const qualifications = (employee.operationalPositions || []).map(position => ({
    ...position, status: qualificationState(employee.qualifications || [], employee.id, position, endDate),
    record: (employee.qualifications || []).find(item => item.operationalPositionId === position.id) || null,
  }));
  const leaves = (employee.leaveAccounts || []).filter(account => Number(account.leaveYear) === Number(year)).map(account => ({
    ...account, balance: leaveBalance(account,endDate),
  }));
  const upcoming = (employee.scheduleAssignments || []).filter(item => item.schedule?.status === "PUBLISHED" && item.workDate >= endDate).sort((a,b) => a.workDate.localeCompare(b.workDate)).filter((item,index,items) => !index || item.workDate !== items[index-1].workDate).slice(0,7);
  const recent = (employee.timeline || []).filter(item => isoDate(item.date) <= endDate).slice(0,6);
  const employment = (employee.employmentPeriods || []).flatMap(period => (period.assignments || []).map(assignment => ({...assignment,periodStatus:period.status,periodStart:period.startDate,periodEnd:period.endDate})));
  return {...insight,qualifications,leaves,upcoming,recent,employment};
}
module.exports = { employeeProfileSummary, leaveBalance };
