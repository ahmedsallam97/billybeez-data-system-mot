const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizePlanningCatalogs, normalizeBraceletTypes } = require('../lib/operations/stock-catalog');
const { braceletStockIdentity, rosterBracelets } = require('../lib/operations/bracelet-roster');
const { loadBraceletRoster } = require('../lib/operations/bracelet-roster-service');
const { stockKey } = require('../lib/operations/planning');
const types = [{code:'KID',label:'Kid',showInRoster:true,required:true,color:'#a154e8',material:'PAPER',colorName:'Purple'}, {code:'VISITOR',label:'Visitor',showInRoster:true,required:false}];
const blue = {id:'blue',stockCategory:'BRACELET',usageType:'KID',material:'SATAN',color:'#5aa9e6',colorName:'Blue',cashierQuantity:20,warehouseQuantity:10,allocated:2,issued:1};
const red = {...blue,id:'red',material:'PAPER',color:'#e05252',colorName:'Red'};

test('type normalization removes legacy colors/materials while preserving visibility, names and custom usages',()=>{
 const stockCatalog={braceletUsages:[...types,{code:'custom',label:'Custom',showInRoster:true,required:true,color:'#000000'}],braceletMaterials:[{code:'SATAN'}],braceletFields:{color:'#bad'}};
 const normalized=normalizePlanningCatalogs({stockCatalog,mealOptions:['Burger']});
 for(const type of normalized.stockCatalog.braceletUsages) for(const key of ['color','colorName','material'])assert.equal(Object.hasOwn(type,key),false);
 assert.deepEqual(normalized.stockCatalog.braceletMaterials,stockCatalog.braceletMaterials);
 assert.equal(normalized.stockCatalog.braceletUsages.find(t=>t.code==='CUSTOM').required,true);
 assert.equal(normalized.stockCatalog.braceletUsages.find(t=>t.code==='KID').label,'Kid');
 assert.equal(Object.hasOwn(normalized.stockCatalog,'braceletFields'),false);
 assert.deepEqual(normalizeBraceletTypes(normalized.stockCatalog.braceletUsages),normalized.stockCatalog.braceletUsages);
});
test('stock identity uses actual variant values regardless of old type settings',()=>{
 const catalog={braceletUsages:types,braceletMaterials:[{code:'PAPER'},{code:'SATAN'}]};
 assert.deepEqual(braceletStockIdentity(blue,catalog),{usageType:'KID',material:'SATAN',color:'#5aa9e6',colorName:'Blue'});
 assert.notEqual(stockKey({...braceletStockIdentity(blue,catalog),stockCategory:'BRACELET'}),stockKey({...braceletStockIdentity(red,catalog),stockCategory:'BRACELET'}));
 for(const change of [{usageType:'UNKNOWN'},{color:'blue'},{material:'UNCONFIGURED'}])assert.throws(()=>braceletStockIdentity({...blue,...change},catalog));
});
test('one available variant supplies color/material automatically; missing types never invent colors',()=>{
 const [kid,visitor]=rosterBracelets([blue],types);
 assert.equal(kid.stockId,'blue');assert.equal(kid.color,blue.color);assert.equal(kid.material,'SATAN');assert.equal(kid.remaining,27);assert.equal(kid.state,'READY');
 assert.equal(visitor.color,null);assert.equal(visitor.material,'');assert.equal(visitor.state,'NO_STOCK');
 assert.equal(rosterBracelets([{...blue,warehouseQuantity:0,cashierQuantity:0,allocated:0,issued:0}],types)[0].state,'NO_STOCK');
});
test('multiple variants require a choice; selected depleted/deleted variants do not silently switch colors',()=>{
 assert.equal(rosterBracelets([blue,red],types)[0].state,'SELECT_STOCK');
 assert.equal(rosterBracelets([blue,red],types)[0].color,null);
 assert.equal(rosterBracelets([blue,red],types,{KID:'red'})[0].color,red.color);
 assert.equal(rosterBracelets([blue],types,{KID:'red'})[0].state,'UNAVAILABLE');
 const row=rosterBracelets([blue,{...red,allocated:30,issued:0}],types,{KID:'red'})[0];assert.equal(row.state,'OUT_OF_STOCK');assert.equal(row.color,red.color);
 assert.equal(rosterBracelets([blue,{...red,allocated:30,issued:0}],types)[0].stockId,'blue');
});
test('roster reads are branch/date specific and frozen closed-day colors survive later inventory changes',async()=>{
 const calls=[];const saved={revision:4,selections:{KID:'red'}};
 const db={systemSetting:{findUnique:async({where})=>{calls.push(where.key);return {value:JSON.stringify(where.key==='OPS_PLANNING_CATALOGS'?{stockCatalog:{braceletUsages:types}}:saved)};}}};
 const open=await loadBraceletRoster(db,{branch:'MOT',date:'2026-10-11',items:[blue,red],context:{hasTrips:false,hasBirthdays:false}});
 assert.equal(open.rows[0].color,red.color);assert.ok(calls.includes('OPS_ROSTER_BRACELETS:MOT:2026-10-11'));
 calls.length=0;
 const closed=await loadBraceletRoster(db,{branch:'MOT',date:'2026-10-11',items:[{...red,color:'#000000'}],day:{status:'CLOSED',readinessSnapshotJson:JSON.stringify({braceletRoster:open})}});
 assert.equal(closed.closed,true);assert.equal(closed.rows[0].color,red.color);assert.equal(calls.length,0);
});
test('Trip and Birthday bracelet variants appear only for actual bookings unless explicitly enabled daily',()=>{
 const trip={...blue,id:'trip',usageType:'TRIP'},birthday={...red,id:'birthday',usageType:'BIRTHDAY'};
 assert.equal(rosterBracelets([trip,birthday],types).some(row=>['TRIP','BIRTHDAY'].includes(row.code)),false);
 const withTrips=rosterBracelets([trip,birthday],types,{}, {hasTrips:true});assert.equal(withTrips.find(row=>row.code==='TRIP').color,trip.color);assert.equal(withTrips.some(row=>row.code==='BIRTHDAY'),false);
 const both=rosterBracelets([trip,birthday],types,{}, {hasTrips:true,hasBirthdays:true});assert.equal(both.find(row=>row.code==='BIRTHDAY').color,birthday.color);
 const daily=rosterBracelets([trip], [...types,{code:'TRIP',label:'Trip',showInRoster:true}],{});assert.equal(daily.find(row=>row.code==='TRIP').stockId,'trip');
});
test('booking checks use the current branch/date and exclude cancelled trips and non-birthday events',async()=>{
 const queries=[];
 const db={systemSetting:{findUnique:async()=>null},opsDailyTrip:{count:async query=>{queries.push(query);return 1;}},opsDailyEvent:{count:async query=>{queries.push(query);return 0;}}};
 const roster=await loadBraceletRoster(db,{branch:'MOT',date:'2026-11-05',items:[{...blue,id:'trip',usageType:'TRIP'}]});
 assert.deepEqual(queries,[{where:{branch:'MOT',workDate:'2026-11-05',status:{not:'CANCELLED'}}},{where:{branch:'MOT',workDate:'2026-11-05',status:{not:'CANCELLED'},eventType:'BIRTHDAY'}}]);
 assert.equal(roster.rows.find(row=>row.code==='TRIP').stockId,'trip');assert.equal(roster.rows.some(row=>row.code==='BIRTHDAY'),false);
});
