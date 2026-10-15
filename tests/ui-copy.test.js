const test=require('node:test'),assert=require('node:assert/strict');
const {UI_COPY,translateUiCopy}=require('../lib/ui-copy');
test('interface translations follow the selected language and preserve unknown data',()=>{
  for(const [en,ar]of Object.entries(UI_COPY)){
    assert.equal(translateUiCopy(en,'en'),en);
    assert.equal(translateUiCopy(en,'ar'),ar);
    assert.match(ar,/[\u0600-\u06ff]/);
  }
  for(const data of ['TEST Employee 1','MOT-PT-003','Locker-Park','AM','BW','PM','2026-10-11','Custom report title'])assert.equal(translateUiCopy(data,'ar'),data);
  assert.equal(translateUiCopy(undefined,'ar'),undefined);
  const reactChildren={type:'span',props:{children:'Employee'}};
  assert.equal(translateUiCopy(reactChildren,'ar'),reactChildren);
});
test('UI enum labels can be localized without rewriting stored identifiers',()=>{
  const records=['QUALIFIED','IN_PROGRESS','OPEN','CLOSED'];
  const options=records.map(value=>({value,label:translateUiCopy(value,'ar')}));
  assert.deepEqual(options.map(o=>o.value),records);
  assert.deepEqual(options.map(o=>o.label),['مؤهل','قيد التنفيذ','مفتوح','مغلق']);
});
