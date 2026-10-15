const fs = require("node:fs");
const path = require("node:path");
const { PDFDocument, rgb } = require("pdf-lib");
const { employeeProfileSummary } = require("./employee-profile-summary");
const { sectionsForFile } = require("./employee360");
const { createPdfText } = require("./pdf-text");
const { formatPerformanceScore } = require("./score-format");

const W=595.28,H=841.89,M=34,CW=W-M*2;
const color=hex=>rgb(parseInt(hex.slice(1,3),16)/255,parseInt(hex.slice(3,5),16)/255,parseInt(hex.slice(5,7),16)/255);
const C={ink:color("#302145"),muted:color("#796e89"),line:color("#e5dfeb"),tint:color("#f4f0f8"),purple:color("#61408b"),gold:color("#e7bb40"),green:color("#168763")};
const clean=value=>String(value??"—").replace(/[\u0000-\u001f\u007f]/g," ");
const day=value=>value?new Date(value).toISOString().slice(0,10):"—";
const human=value=>({DEFAULT_FULL:"Awaiting review",DEFAULT_ZERO:"Awaiting review",PART_TIME:"Part time",NOT_APPLICABLE:"Not employed",HRIS:"HRIS"}[value]||clean(value).replaceAll("_"," ").toLowerCase().replace(/^./,c=>c.toUpperCase()));
const ar=/[\u0600-\u06ff\u0750-\u077f\u08a0-\u08ff]/;

async function buildEmployeeProfileReport({employee,year,endDate,language="en",mode="STANDARD",customSections=[],includeAttachments=false,readAttachment,loadFonts,appendAttachment}) {
  const pdf=await PDFDocument.create(),fonts=await loadFonts(pdf),rtl=language==="ar";
  const typography = createPdfText(fonts);
  const t=(en,arabic)=>rtl?arabic:en;
  const measure=typography.width;
  const selected=new Set(sectionsForFile(mode,customSections)); const includes=section=>selected.has(section);
  const summary=employeeProfileSummary(employee,endDate,year);
  let page;
  let logo=null;
  try { logo=await pdf.embedPng(fs.readFileSync(path.join(process.cwd(),"public","bb-logo-fast.png"))); } catch {}
  function text(value,x,top,width,size=9,bold=false,tone=C.ink) {
    typography.draw(page,value,{x:rtl?x+width:x,y:H-top-size,size,bold,color:tone,align:rtl?"right":"left",maxWidth:width});
  }
  function line(x,top,width,tone=C.line){page.drawLine({start:{x,y:H-top},end:{x:x+width,y:H-top},thickness:.6,color:tone});}
  function box(x,top,width,height,fill=rgb(1,1,1)){page.drawRectangle({x,y:H-top-height,width,height,color:fill,borderColor:C.line,borderWidth:.6});}
  function heading(label,x,top,width=CW){text(label,x,top,width,11,true);line(x,top+20,width);}
  function rows(data,columns,x,top,width,maxRows=6) {
    const visible=data.slice(0,maxRows),rh=22,widths=columns.map(item=>item[1]*width);
    box(x,top,width,24,C.tint);let at=x;columns.forEach(([label],i)=>{text(label,at+7,top+6,widths[i]-14,8,true);at+=widths[i];});
    if(!visible.length){text(t("No records available","لا توجد سجلات"),x+8,top+34,width-16,9,false,C.muted);return top+62;}
    visible.forEach((row,index)=>{let at=x;columns.forEach(([, ,value],i)=>{text(value(row),at+7,top+29+index*rh,widths[i]-14,8);at+=widths[i];});line(x,top+24+(index+1)*rh,width);});
    const next=top+24+visible.length*rh;
    if(data.length>visible.length)text(t(`${visible.length} of ${data.length} records shown · details remain in the employee file`,`${visible.length} من ${data.length} سجلات · التفاصيل متاحة في ملف الموظف`),x+5,next+5,width-10,7,false,C.muted);
    return next+22;
  }
  async function newPage(subtitle) {
    page=pdf.addPage([W,H]);page.drawRectangle({x:M,y:H-28,width:42,height:4,color:C.gold});
    text("BILLY BEEZ",M,38,CW,11,true,C.purple);text(t("EMPLOYEE PROFILE","ملف الموظف"),rtl?M+125:M,58,CW-125,19,true);
    text(subtitle,M,85,CW,8,false,C.muted);
    if(logo){const size=logo.scaleToFit(100,30);page.drawImage(logo,{x:rtl?M:W-M-size.width,y:H-62,width:size.width,height:size.height});}
    text(t(`Generated ${new Date().toISOString().slice(0,10)}`,`صدر في ${new Date().toISOString().slice(0,10)}`),rtl?M:W-M-110,70,110,7,false,C.muted);
  }
  if (includes("Overview")) {
  await newPage(t(`Management profile · ${year}-01-01 to ${endDate}`,`تقرير الموظف · ${year}-01-01 إلى ${endDate}`));
  box(M,109,CW,118,C.tint);
  const px=rtl?W-M-92:M+12;
  const photo=employee.photo||(employee.documents||[]).find(item=>item.status==="ACTIVE"&&item.documentType==="EMPLOYEE_PHOTO");
  let photoImage=null;
  if(photo&&readAttachment)try{const data=await readAttachment(photo);const png=await require("sharp")(data).rotate().resize(300,360,{fit:"cover"}).png().toBuffer();photoImage=await pdf.embedPng(png);}catch{}
  if(photoImage)page.drawImage(photoImage,{x:px,y:H-213,width:78,height:92});
  else{box(px,121,78,92,color("#e7dff0"));text(employee.name?.split(/\s+/).slice(0,2).map(word=>word[0]).join("")||"—",px+8,152,62,22,true,C.purple);}
  const ix=rtl?M+14:M+105,iw=CW-121;
  text(employee.name,ix,123,iw,16,true);text(`${employee.hrisNumber||employee.localEmployeeCode||"—"} · ${human(employee.employmentStatus)}`,ix,147,iw,9,false,C.purple);
  text(`${employee.jobTitle||"—"} · ${human(employee.employmentType)}`,ix,166,iw,10);
  text(t(`Hire date: ${day(employee.hireDate)}   |   ${employee.department||"—"}   |   ${employee.branch||"—"}`,`التعيين: ${day(employee.hireDate)}   |   ${employee.department||"—"}   |   ${employee.branch||"—"}`),ix,192,iw,8,false,C.muted);
  const metricWidth=(CW-24)/3;
  const metrics=includes("Overview")?[[t("ATTENDANCE RATE","نسبة الحضور"),summary.attendanceRate===null?"—":`${summary.attendanceRate}%`,t(`${summary.expected} expected workdays`,`${summary.expected} يوم عمل متوقع`)],[t("PERFORMANCE","الأداء"),formatPerformanceScore(summary.performanceScore,summary.performanceUnit,language),t(`${summary.appraisals.length} approved appraisals`,`${summary.appraisals.length} تقييم شهري معتمد`)],[t("QUALIFICATIONS","المؤهلات"),`${summary.qualifications.filter(item=>item.status==="QUALIFIED").length} / ${summary.qualifications.length}`,t("Recorded current status","الحالة المسجلة الحالية")]]:[];
  metrics.forEach(([label,value,note],i)=>{const x=M+i*(metricWidth+12);box(x,241,metricWidth,79);text(label,x+10,251,metricWidth-20,8,true,C.muted);text(value,x+10,267,metricWidth-20,19,true,C.purple);text(note,x+10,300,metricWidth-20,7,false,C.muted);});
  let top=340;
  if(includes("Employment")||includes("Overview")){heading(t("Employment history","السجل الوظيفي"),M,top);top=rows(summary.employment,[[t("From","من"),.19,item=>day(item.effectiveFrom)],[t("To","إلى"),.19,item=>item.effectiveTo?day(item.effectiveTo):t("Ongoing","مستمر")],[t("Position","الوظيفة"),.4,item=>item.positionName],[t("Change","التغيير"),.22,item=>human(item.changeReason)]],M,top+28,CW,3)+12;}
  const half=(CW-16)/2;
  if(includes("Overview")||includes("Schedule & Attendance")){
    heading(t("Attendance summary","ملخص الحضور"),M,top,half);
    rows([[t("Attended","حضور"),summary.present],[t("Late","تأخير"),summary.late],[t("Absent","غياب"),summary.absences],[t("Early leave","انصراف مبكر"),summary.earlyLeave]],[[t("Status","الحالة"),.73,row=>row[0]],[t("Days","الأيام"),.27,row=>row[1]]],M,top+27,half,4);
    heading(t("Leaves & balances","الإجازات والأرصدة"),M+half+16,top,half);
    rows(summary.leaves,[[t("Leave","الإجازة"),.73,row=>human(row.leaveType)],[t("Days","الأيام"),.27,row=>row.balance]],M+half+16,top+27,half,4);top+=160;
  }
  if(includes("Overview")||includes("Timeline")){heading(t("Recent activity","النشاط الأخير"),M,top);rows(summary.recent,[[t("Date","التاريخ"),.2,row=>day(row.date)],[t("Activity","النشاط"),.3,row=>human(row.type)],[t("Summary","الملخص"),.5,row=>`${human(row.title)} · ${human(row.detail)}`]],M,top+28,CW,3);}
  await newPage(t("Development, schedule and supporting records","التطوير والجدول والسجلات الداعمة"));
  text(`${employee.name} · ${employee.hrisNumber||employee.localEmployeeCode||"—"}`,M,104,CW,11,true,C.purple);top=135;
  if(includes("Overview")||includes("Training & Qualifications")){
    heading(t("Operational qualifications","المؤهلات التشغيلية"),M,top);
    const qwidth=(CW-18)/3;
    const qualifications=summary.qualifications.slice(0,15);
    qualifications.forEach((item,i)=>{const x=M+(i%3)*(qwidth+9),y=top+29+Math.floor(i/3)*39;box(x,y,qwidth,32);text(item.label,x+7,y+4,qwidth-14,8,true);text(human(item.status),x+7,y+17,qwidth-14,7,false,item.status==="QUALIFIED"?C.green:C.muted);});
    if(!qualifications.length)text(t("No operational positions configured","لا توجد مواقع تشغيلية مسجلة"),M,top+32,CW,9,false,C.muted);
    top+=40+Math.max(1,Math.ceil(qualifications.length/3))*39;
    if(summary.qualifications.length>15){text(t(`Showing 15 of ${summary.qualifications.length} positions`, `عرض 15 من ${summary.qualifications.length} موقع`),M,top-5,CW,7,false,C.muted);top+=12;}
  }
  if(includes("Training & Qualifications")){heading(t("Training records","سجلات التدريب"),M,top);top=rows(summary.trainings,[[t("Training","التدريب"),.48,row=>row.name],[t("Completed","الإنجاز"),.24,row=>day(row.completedDate)],[t("Status","الحالة"),.28,row=>human(row.status)]],M,top+28,CW,3)+10;}
  if(includes("Schedule & Attendance")||includes("Overview")){heading(t("Upcoming published schedule","الجدول المنشور القادم"),M,top);top=rows(summary.upcoming,[[t("Date","التاريخ"),.28,row=>row.workDate],[t("Shift / status","الشيفت والحالة"),.42,row=>row.importRawValue||human(row.code)],[t("Version","النسخة"),.3,row=>`V${row.schedule?.version||"—"}`]],M,top+28,CW,5)+9;}
  if(includes("Recognition")||includes("Overview")){if(top>675)await newPage(t("Recognition and records","التقدير والسجلات")),top=115;heading(t("Recognition","التقدير"),M,top);top=rows(summary.recognition,[[t("Period","الفترة"),.3,row=>`${row.year}/${row.month}`],[t("Award","الجائزة"),.7,()=>t("Employee of the Month · locked result","موظف الشهر · نتيجة مقفلة")]],M,top+28,CW,2)+8;}
  }
  const activeDocuments=(employee.documents||[]).filter(item=>item.status==="ACTIVE");
  // Restricted modes append detailed records instead of squeezing them into the summary.
  async function detailTable(title,data,columns){
    const empty = !data.length;
    if (empty && mode !== "CUSTOM") return;
    let y=0;
    const header=async()=>{await newPage(title);text(employee.name,M,106,CW,11,true);box(M,130,CW,24,C.tint);let x=M;for(const [label,ratio]of columns){text(label,x+7,137,CW*ratio-14,8,true);x+=CW*ratio;}y=158;};
    const wrap=(value,width)=>{const words=clean(value).split(/\s+/),lines=[];let current="";for(const word of words){const candidate=current?`${current} ${word}`:word;if(measure(candidate,8)<=width){current=candidate;continue;}if(current)lines.push(current);current="";let part="";for(const char of word){if(measure(part+char,8)>width){lines.push(part);part="";}part+=char;}current=part;}if(current)lines.push(current);return lines.length?lines:["—"];};
    await header();
    if (empty) text(t("No records available for this reporting period", "لا توجد سجلات خلال فترة التقرير"), M+7, y+8, CW-14, 9, false, C.muted);
    for(const record of data){const cells=columns.map(([,ratio,value])=>wrap(value(record),CW*ratio-14));const count=Math.max(...cells.map(cell=>cell.length));let offset=0;while(offset<count){if(y+23>H-50)await header();const available=Math.min(count-offset,Math.floor((H-55-y)/12));let x=M;cells.forEach((cell,index)=>{cell.slice(offset,offset+available).forEach((value,lineIndex)=>text(value,x+7,y+lineIndex*12,CW*columns[index][1]-14,8));x+=CW*columns[index][1];});y+=available*12+12;line(M,y-4,CW);offset+=available;}}
  }
  if(includes("Personal"))await detailTable(t("Restricted personal details","البيانات الشخصية المقيدة"),[[t("Date of birth","تاريخ الميلاد"),day(employee.dateOfBirth)],[t("Phone","الهاتف"),employee.phone],[t("Address","العنوان"),employee.address],[t("National ID","الرقم القومي"),employee.nationalId],[t("Emergency contact","جهة اتصال الطوارئ"),employee.emergencyName],[t("Emergency phone","هاتف الطوارئ"),employee.emergencyPhone],[t("Relationship","صلة القرابة"),employee.emergencyRelation],[t("Notes","ملاحظات"),employee.personalNotes]],[[t("Field","البند"),.3,row=>row[0]],[t("Value","القيمة"),.7,row=>row[1]||"—"]]);
  if(includes("Documents")||includes("Files"))await detailTable(t("Protected documents","المستندات المحمية"),activeDocuments,[[t("Document","المستند"),.47,row=>row.displayName],[t("Type","النوع"),.3,row=>human(row.documentType)],[t("Expiry","الانتهاء"),.23,row=>day(row.expiryDate)]]);
  if(includes("Incidents"))await detailTable(t("Incident register","سجل الحوادث"),employee.incidents||[],[[t("Date","التاريخ"),.2,row=>day(row.incidentDate)],[t("Incident","الحادث"),.55,row=>`${row.title} · ${row.description||""}`],[t("Status","الحالة"),.25,row=>human(row.status)]]);
  if(includes("Guidance & Penalties"))await detailTable(t("Guidance and follow-up","التوجيه والمتابعة"),employee.guidanceRecords||[],[[t("Date","التاريخ"),.2,row=>day(row.recordDate)],[t("Record","السجل"),.55,row=>`${row.title} · ${row.details||""}`],[t("Status","الحالة"),.25,row=>human(row.status)]]);
  if(includes("Guest Feedback"))await detailTable(t("Guest feedback","آراء الضيوف"),employee.guestFeedback||[],[[t("Date","التاريخ"),.2,row=>day(row.feedbackDate)],[t("Feedback","الرأي"),.8,row=>row.comment]]);
  if(includes("Performance"))await detailTable(t("Approved monthly appraisals","التقييمات الشهرية المعتمدة"),summary.appraisals,[[t("Period","الفترة"),.25,row=>`${row.year}/${row.month}`],[t("Score","النتيجة"),.4,row=>formatPerformanceScore(row.totalScore,"points",language)],[t("Version","النسخة"),.35,row=>`V${row.version||1} · ${human(row.status)}`]]);
  // A custom report goes directly to its requested sections. Detail appendices
  // retain complete records when management summaries show only a few rows.
  const custom = mode === "CUSTOM";
  if(includes("Employment") && (custom || summary.employment.length > 3)) await detailTable(t("Employment history", "السجل الوظيفي"), summary.employment, [[t("From / to", "من / إلى"),.25,row=>day(row.effectiveFrom)+" - "+(row.effectiveTo?day(row.effectiveTo):t("Ongoing","مستمر"))],[t("Position / change", "الوظيفة / التغيير"),.75,row=>[row.positionName,row.changeReason].filter(Boolean).join(" · ")]]);
  if(includes("Leaves & Balances")) await detailTable(t("Leaves and balances", "الإجازات والأرصدة"), summary.leaves, [[t("Leave type", "نوع الإجازة"),.65,row=>human(row.leaveType)],[t("Days", "الأيام"),.35,row=>row.balance]]);
  if(includes("Training & Qualifications")) {
    await detailTable(t("Training records", "سجلات التدريب"), summary.trainings, [[t("Training", "التدريب"),.55,row=>row.name],[t("Completion / status", "الإنجاز / الحالة"),.45,row=>day(row.completedDate)+" · "+human(row.status)]]);
    await detailTable(t("Operational qualifications", "المؤهلات التشغيلية"), summary.qualifications, [[t("Position", "الموقع"),.5,row=>row.label],[t("Status", "الحالة"),.5,row=>human(row.status)]]);
  }
  if(custom && includes("Schedule & Attendance")) {
    await detailTable(t("Published schedule", "الجدول المنشور"), (employee.scheduleAssignments||[]).filter(row=>row.workDate<=endDate), [[t("Date", "التاريخ"),.3,row=>row.workDate],[t("Shift / status", "الشيفت / الحالة"),.7,row=>row.importRawValue||human(row.code)]]);
    await detailTable(t("Attendance records", "سجلات الحضور"), employee.attendanceRecords||[], [[t("Date", "التاريخ"),.3,row=>row.attendanceDay?.workDate],[t("Status", "الحالة"),.7,row=>human(row.status)]]);
  }
  if(includes("Timeline")) await detailTable(t("Employee timeline", "السجل الزمني للموظف"), employee.timeline||[], [[t("Date", "التاريخ"),.2,row=>day(row.date)],[t("Activity", "النشاط"),.8,row=>[human(row.type),human(row.title),row.detail].filter(Boolean).join(" · ")]]);
  if(includes("Recognition") && (custom || summary.recognition.length > 2)) await detailTable(t("Recognition", "التقدير"), summary.recognition, [[t("Period", "الفترة"),.3,row=>row.year+"/"+row.month],[t("Award", "الجائزة"),.7,()=>t("Employee of the Month · locked result", "موظف الشهر · نتيجة مقفلة")]]);
  const reportPages = pdf.getPageCount();
  let appended=0;const failed=[];
  if(includeAttachments&&(includes("Documents")||includes("Files")))for(const document of activeDocuments){try{appended+=await appendAttachment(pdf,document,await readAttachment(document));}catch{failed.push(document.displayName);}}
  if(failed.length)await detailTable(t("Attachments not embedded","مرفقات لم يتم دمجها"),failed,[[t("File — unavailable or unsupported","ملف غير متاح أو غير مدعوم"),1,row=>row]]);
  for(const [index,item] of pdf.getPages().entries()){page=item;if(index>=reportPages||item.getWidth()!==W||item.getHeight()!==H)continue;line(M,H-35,CW);text(t("Billy Beez · Confidential employee profile","بيلي بيز · ملف موظف سري"),M,H-27,CW-90,7,false,C.muted);text(`${index+1} / ${reportPages}`,W-M-50,H-27,50,7,false,C.muted);}
  pdf.setTitle(`${t("Complete Employee File","ملف الموظف الكامل")} - ${employee.name}`);pdf.setSubject(`${year}-01-01 - ${endDate}; ${appended} attachment page(s) embedded`);pdf.setCreator("Billy Beez Operations");pdf.setLanguage(rtl?"ar-EG":"en-GB");return Buffer.from(await pdf.save());
}
module.exports={buildEmployeeProfileReport};
