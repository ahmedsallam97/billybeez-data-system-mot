// Readiness history uses a calendar month. Deadline summaries use their separate
// reference date and continue to display current saved records.
function decisionHistoryRange(period, from, referenceDate) {
 if (/^\d{4}-(0[1-9]|1[0-2])$/.test(period || '')) return { from: period+'-01', until: new Date(Date.UTC(Number(period.slice(0,4)),Number(period.slice(5)),0)).toISOString().slice(0,10) };
 return { from: from || '', until: referenceDate };
}
module.exports={decisionHistoryRange};
