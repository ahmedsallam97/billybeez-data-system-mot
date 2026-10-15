const {assertIsolatedEnvironment}=require('../e2e/isolation');
module.exports=async()=>{
 await require('../e2e/global-setup')();assertIsolatedEnvironment();
 const {PrismaClient}=require('@prisma/client'),db=new PrismaClient();
 try{
  const raw=await db.user.findFirst({where:{active:true,role:'ADMIN'}}),user=await require('../../lib/accounts/service').loadAccount(db,raw);
  const accounts=require('../../lib/accounts/service'),{config}=await accounts.readConfig(db);for(const profile of Object.values(config.accounts))profile.preferredLanguage=null;await db.systemSetting.update({where:{key:accounts.KEY},data:{value:JSON.stringify(config)}});
  const service=require('../../lib/operations/planning-service'),{proposedFramework,keyOf}=require('../../lib/operations/succession-workspace');
  const configuration=(await require('../../lib/operations/performance-settings-service').getEffectivePerformanceSettings(db,{branch:'MOT'})).value.succession;
  for(const [index,name]of ['Sara Hassan — سارة حسن','Karim Nabil — كريم نبيل'].entries()){
   const employee=await db.employee.create({data:{name,branch:'MOT',department:'OPERATION',jobTitle:'Ride Operator'}});
   const framework=proposedFramework(configuration,{currentRole:'Ride Operator',targetRole:'Front Cashier'}).slice(0,2);
   const {candidate}=await service.createSuccession(db,{user,branch:'MOT',employeeId:employee.id,targetRole:'Front Cashier',framework,details:{ownerUserId:user.id,nextReviewDate:index?'2027-01-10':'2026-10-01',targetDate:'2027-03-01',reviewFrequency:'MONTHLY',businessNeed:'Provide reliable cashier cover through supervised practical development.'}});
   const {development}=await service.createDevelopment(db,{user,branch:'MOT',candidateId:candidate.id,ownerUserId:user.id,objectives:framework.map((definition,i)=>({gapKey:keyOf(definition),outcome:i?'Handle guest requests independently during two observed shifts':'Complete opening checks and demonstrate safe incident response',successCriteria:'Supervisor verifies the practical checklist during two observed shifts.',targetDate:index?'2027-02-01':'2026-10-08',assignments:[{task:i?'Shadow an experienced cashier and practise guest requests':'Run a supervised opening check and emergency response drill',responsibleUserId:user.id,dueDate:index?'2027-01-20':'2026-10-07'}]}))});
   if(!index)await service.updateAssignment(db,{user,branch:'MOT',developmentId:development.id,assignmentId:development.objectives[0].assignments[0].id,expectedRevision:1,status:'BLOCKED',blocker:'Drill equipment is unavailable. Arrange a supervised alternative with the shift leader.',reason:'Document support needed before the next progress review.'});
  }
  const product=await db.product.findFirst({where:{active:true}});
  await db.order.create({data:{id:'DESKTOP-AUDIT-ORDER',invoiceSerial:'DESKTOP-AUDIT-2026',businessDate:'2026-10-11',braceletNo:'AUDIT-1001',customerName:'Hassan family',childNames:JSON.stringify(['Amina Hassan']),childrenCount:1,total:250,cashierId:raw.id,items:product?{create:{productId:product.id,name:product.name,qty:1,price:250,total:250}}:undefined}});
 }finally{await db.$disconnect();}
 const {request}=require('@playwright/test');const api=await request.newContext({baseURL:'http://127.0.0.1:3018',storageState:'playwright/.auth/admin.json'});
 try{for(const [endpoint,data]of [['attendance',{action:'open',date:'2026-10-11'}],['evaluations',{action:'open',date:'2026-10-11'}]]){const response=await api.post('/api/operations/'+endpoint,{data});if(!response.ok())throw Error(`Realistic ${endpoint} fixture: ${response.status()} ${await response.text()}`);}}finally{await api.dispose();}
};
