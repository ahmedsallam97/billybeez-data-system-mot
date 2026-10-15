const test=require('node:test'),assert=require('node:assert/strict'),{decisionHistoryRange}=require('../lib/operations/report-period');
test('decision history includes the last calendar day, including leap February',()=>{
 for(const [month,last]of [['2026-10','31'],['2026-11','30'],['2026-02','28'],['2028-02','29']])assert.deepEqual(decisionHistoryRange(month,'2026-01-10','2026-10-12'),{from:month+'-01',until:month+'-'+last});
});
test('calendar boundaries stay correct for Cairo and Los Angeles browsers',()=>{
 const original=process.env.TZ;try{for(const tz of ['Africa/Cairo','America/Los_Angeles']){process.env.TZ=tz;assert.equal(decisionHistoryRange('2026-10','','2026-10-12').until,'2026-10-31');}}finally{if(original)process.env.TZ=original;else delete process.env.TZ;}
});
test('custom history dates and deadline reference retain independent meanings',()=>{
 assert.deepEqual(decisionHistoryRange('','2026-09-01','2026-10-12'),{from:'2026-09-01',until:'2026-10-12'});assert.deepEqual(decisionHistoryRange('invalid','','2026-10-12'),{from:'',until:'2026-10-12'});
});
