const test=require('node:test'),assert=require('node:assert/strict');
const {modelFilter,nestedSelections,models}=require('../lib/accounts/enforcement');
test('operational position definitions remain readable while related employee records stay scoped',()=>{
 const scope={unrestricted:false,employeeIds:['permitted-employee'],branches:['MOT'],scheduleIds:[]};
 assert.equal(modelFilter('OpsOperationalPosition',scope),null);
 const employeeRelations=models.OpsOperationalPosition.fields.filter(field=>field.kind==='object'&&field.isList&&models[field.type]?.fields.some(child=>child.name==='employeeId'));
 assert.ok(employeeRelations.length>0);
 for(const relation of employeeRelations){
  assert.ok(modelFilter(relation.type,scope));
  const query={include:{[relation.name]:true}};nestedSelections(query,'OpsOperationalPosition',scope);
  assert.deepEqual(query.include[relation.name].where.AND[1],modelFilter(relation.type,scope));
 }
});
