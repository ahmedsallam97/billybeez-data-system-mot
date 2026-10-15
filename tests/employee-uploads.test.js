const test=require("node:test");
const assert=require("node:assert/strict");
const {metadata,validateFileContent,contentDisposition}=require("../lib/operations/employee-uploads");
test("upload validation rejects impossible dates, reversed expiry and spoofed image content",()=>{
  const file={name:"sample.png",size:20,type:"image/png",arrayBuffer(){}};
  const form=values=>new Map(Object.entries(values));
  assert.throws(()=>metadata(form({issueDate:"2026-02-30"}),file),/valid date/);
  assert.throws(()=>metadata(form({issueDate:"2026-05-01",expiryDate:"2026-04-30"}),file),/before issue/);
  assert.throws(()=>metadata(form({documentType:"UNKNOWN"}),file),/supported document/);
  assert.throws(()=>metadata(form({displayName:"bad\r\nname"}),file),/control characters/);
  assert.throws(()=>validateFileContent(Buffer.from("<svg></svg>"),"image/png"),/do not match/);
  assert.equal(metadata(form({displayName:"عقد الموظف",issueDate:"2026-01-01"}),file).displayName,"عقد الموظف");
});
test("protected filenames preserve Arabic safely and use the actual file extension",()=>{
  const name='عقد الموظف "نسخة".pdf';
  const header=contentDisposition(name,"application/pdf",true);
  assert.match(header,/^attachment; filename="[\x20-\x7e]+"; filename\*=UTF-8''/);
  assert.equal(decodeURIComponent(header.split("filename*=UTF-8''")[1]),name);
  assert.match(contentDisposition("photo","image/jpeg"),/photo\.jpg/);
  assert.doesNotMatch(contentDisposition("bad\r\n/file","image/png"),/[\r\n]/);
});
