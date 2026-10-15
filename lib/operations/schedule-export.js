const { PDFDocument,rgb }=require("pdf-lib");
const { loadFonts }=require("./employee-file-pdf");
const { createPdfText }=require("./pdf-text");
const { datesInPeriod }=require("./schedule");
const encoder = new TextEncoder();
const crc32 = (bytes) => { let crc = -1; for (const byte of bytes) { crc ^= byte; for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1)); } return (crc ^ -1) >>> 0; };
const u16 = (value) => Uint8Array.of(value & 255, (value >>> 8) & 255);
const u32 = (value) => Uint8Array.of(value & 255, (value >>> 8) & 255, (value >>> 16) & 255, (value >>> 24) & 255);
const join = (parts) => { const total = parts.reduce((sum, part) => sum + part.length, 0); const out = new Uint8Array(total); let offset = 0; for (const part of parts) { out.set(part, offset); offset += part.length; } return out; };
function zip(files) {
  let offset = 0; const records = []; const central = [];
  for (const [name, text] of files) { const filename = encoder.encode(name); const data = encoder.encode(text); const crc = crc32(data); const local = join([u32(0x04034b50), u16(20), u16(0), u16(0), u16(0), u16(0), u32(crc), u32(data.length), u32(data.length), u16(filename.length), u16(0), filename, data]); records.push(local); central.push(join([u32(0x02014b50), u16(20), u16(20), u16(0), u16(0), u16(0), u16(0), u32(crc), u32(data.length), u32(data.length), u16(filename.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset), filename])); offset += local.length; }
  const body = join(records); const directory = join(central); return join([body, directory, u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length), u32(directory.length), u32(body.length), u16(0)]);
}
const escapeXml = (value) => String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const columnName=index=>{let name="";for(let n=index+1;n;n=Math.floor((n-1)/26))name=String.fromCharCode(65+(n-1)%26)+name;return name;};
const cell = (value,column,row,style=0) => `<c r="${columnName(column)}${row}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`;

const CODE_COLORS={AM:"#f6dd79",BW:"#cfe8ff",PM:"#eadcff",OFF:"#efaaaa",ANNUAL:"#b9dcc0",REP:"#eedb85",SL:"#d6b5e8",UNPAID:"#efbd87",MISSION:"#91c9ed",HOLIDAY:"#cfe8ff",H:"#cfe8ff"};
const color=(hex,fallback="#ffffff")=>{const value=/^#[0-9a-f]{6}$/i.test(hex||"")?hex:fallback;return rgb(parseInt(value.slice(1,3),16)/255,parseInt(value.slice(3,5),16)/255,parseInt(value.slice(5,7),16)/255);};
function scheduleRows(schedule){const rows=new Map();for(const assignment of schedule.assignments){const row=rows.get(assignment.employeeId)||{employee:assignment.employee,values:new Map()};row.values.set(assignment.workDate,assignment.importRawValue||assignment.code);rows.set(assignment.employeeId,row);}return new Map(require("./schedule-order").orderedRows([...rows].map(([id,row])=>({...row,employeeId:id})),schedule.displayOrder||[]).map(row=>[row.employeeId,row]));}
function scheduleDates(schedule){return datesInPeriod({startDate:schedule.periodStart,endDate:schedule.periodEnd});}
function scheduleWorkbook(schedule){const dates=scheduleDates(schedule),rows=scheduleRows(schedule);
  const sheetRows = [["Employee", "Employee ID", "Department", ...dates], ...[...rows.values()].map((row) => [row.employee.name, row.employee.hrisNumber || row.employee.localEmployeeCode || "", row.employee.department || "", ...dates.map((date) => row.values.get(date) || "")])];
  return workbookFromRows(sheetRows);
}
function workbookFromRows(sheetRows){ return workbookFromSheets([{name:"Roster",rows:sheetRows}]); }
function workbookFromSheets(sheets){
  const renderSheet = (sheet) => {
    const layout=sheet.layout;
    const views=layout?`<sheetViews><sheetView workbookViewId="0" showGridLines="0">${layout.freeze?`<pane xSplit="${layout.freeze.columns||0}" ySplit="1" topLeftCell="${columnName(layout.freeze.columns||0)}2" activePane="${layout.freeze.columns?'bottomRight':'bottomLeft'}" state="frozen"/>`:''}</sheetView></sheetViews>`:'';
    const columns=layout?`<cols>${layout.widths.map((width,index)=>`<col min="${index+1}" max="${index+1}" width="${width}" customWidth="1"/>`).join('')}</cols>`:'';
    const data=sheet.rows.map((row,index)=>`<row r="${index+1}"${layout?` ht="${index===0?32:layout.rowHeight||30}" customHeight="1"`:''}>${row.map((value,column)=>cell(value,column,index+1,layout?(index===0?1:layout.inputColumn!=null&&column>=layout.inputColumn?3:layout.referenceColumns?.includes(column)?4:2):0)).join('')}</row>`).join('');
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${views}${columns}<sheetData>${data}</sheetData>${sheet.validation||''}</worksheet>`;
  };
  const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((sheet,i)=>`<sheet name="${escapeXml(sheet.name)}" sheetId="${i+1}" r:id="rId${i+1}"/>`).join("")}</sheets>${sheets.some(sheet=>sheet.name==="Codes")?`<definedNames><definedName name="ScheduleCodes">Codes!$A$2:$A$${sheets.find(sheet=>sheet.name==="Codes").rows.length}</definedName></definedNames>`:""}</workbook>`;
  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${sheets.map((_,i)=>`<Override PartName="/xl/worksheets/sheet${i+1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`;
  const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
  const workbookRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_,i)=>`<Relationship Id="rId${i+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i+1}.xml"/>`).join("")}<Relationship Id="rId${sheets.length+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;
  const styles = '<?xml version="1.0" encoding="UTF-8"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';
  const templateStyles=styles.replace('<fonts count="1">','<fonts count="2">').replace('</fonts>','<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Arial"/></font></fonts>').replace('<fills count="2">','<fills count="5">').replace('</fills>','<fill><patternFill patternType="solid"><fgColor rgb="FF301848"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFFF3C6"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF2EEF6"/><bgColor indexed="64"/></patternFill></fill></fills>').replace('<cellXfs count="1">','<cellXfs count="5">').replace('</cellXfs>','<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyAlignment="1" applyFill="1" applyFont="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="0" fillId="3" borderId="0" xfId="0" applyAlignment="1" applyFill="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="0" fillId="4" borderId="0" xfId="0" applyAlignment="1" applyFill="1"><alignment vertical="center" wrapText="1"/></xf></cellXfs>');
  const output = zip([["xl/styles.xml",templateStyles],["[Content_Types].xml", contentTypes], ["_rels/.rels", rootRels], ["xl/workbook.xml", workbook], ["xl/_rels/workbook.xml.rels", workbookRels], ...sheets.map((sheet,i)=>[`xl/worksheets/sheet${i+1}.xml`,renderSheet(sheet)])]);

 return output;
}
async function schedulePdf(schedule,options={}){
 const pdf=await PDFDocument.create(),text=createPdfText(await loadFonts(pdf));
 const dates=scheduleDates(schedule),rows=[...scheduleRows(schedule).values()],colors={...CODE_COLORS,...options.colors};
 const groups=[["OPERATIONS TEAM",rows.filter(row=>row.employee.department!=="CASHIER")],["FRONT CASHIERS",rows.filter(row=>row.employee.department==="CASHIER")]].filter(([,rows])=>rows.length);
 const width=841.89,height=595.28,margin=26,nameWidth=177,tableWidth=width-2*margin,rowHeight=23;
 let page,y;
 const draw=(value,x,top,size=8,bold=false,tone="#302145",maxWidth=tableWidth,align="left")=>text.draw(page,value,{x,y:height-top,size,bold,color:color(tone),maxWidth,align});
 const rect=(x,top,w,h,fill)=>page.drawRectangle({x,y:height-top-h,width:w,height:h,color:color(fill),borderColor:color("#e7dfea"),borderWidth:.4});
 for(let start=0;start<dates.length;start+=15){
  const columns=dates.slice(start,start+15),dateWidth=(tableWidth-nameWidth)/columns.length;
  function header(){rect(margin,y,tableWidth,32,"#39224d");draw("EMPLOYEE",margin+8,y+20,9,true,"#ffffff");columns.forEach((date,index)=>{const x=margin+nameWidth+(index+.5)*dateWidth;draw(date.slice(5),x,y+13,7,true,"#ffffff",dateWidth-3,"center");draw(["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][new Date(date+"T00:00:00Z").getUTCDay()],x,y+25,6,false,"#f0e9f5",dateWidth-3,"center");});y+=32;}
  function newPage(){page=pdf.addPage([width,height]);rect(0,0,width,6,options.brand?.primary||"#39224d");draw("BILLY BEEZ · MONTHLY SCHEDULE",margin,34,17,true);draw(schedule.operationalYear+"/"+String(schedule.operationalMonth).padStart(2,"0")+" · V"+schedule.version+" · "+schedule.status,margin,53,10);draw(columns[0]+" to "+columns.at(-1)+" · full period "+schedule.periodStart+" to "+schedule.periodEnd,margin,71,8,false,"#776984");y=89;header();}
  newPage();
  for(const [label,items]of groups){
   if(y+21+rowHeight>height-35)newPage();rect(margin,y,tableWidth,21,"#eee7f5");draw(label,margin+8,y+14,8,true);y+=21;
   for(const row of items){if(y+rowHeight>height-35){newPage();rect(margin,y,tableWidth,21,"#eee7f5");draw(label+" · CONTINUED",margin+8,y+14,8,true);y+=21;}
    rect(margin,y,nameWidth,rowHeight,"#fcfafc");draw(row.employee.name,margin+7,y+10,7.8,true,"#302145",nameWidth-14);draw(row.employee.hrisNumber||row.employee.localEmployeeCode||"",margin+7,y+20,6,false,"#776984",nameWidth-14);
    columns.forEach((date,index)=>{const value=row.values.get(date)||"",code=value.toUpperCase().trim(),key=code.startsWith("AM")?"AM":code.startsWith("BW")?"BW":code.startsWith("PM")?"PM":code;const x=margin+nameWidth+index*dateWidth;rect(x,y,dateWidth,rowHeight,colors[key]||"#fcfafc");let size=7.5;while(size>5&&text.width(value,size,true)>dateWidth-4)size-=.25;draw(value,x+dateWidth/2,y+15,size,true,"#302145",dateWidth-4,"center");});y+=rowHeight;
   }
  }
  if(!rows.length)draw("No assignments in this revision",margin+8,y+28,10);
 }
 for(const [index,current]of pdf.getPages().entries()){page=current;draw(options.branchName||options.branchCode||"MOT",margin,height-16,7,false,"#776984",tableWidth-100);draw("Page "+(index+1)+" / "+pdf.getPageCount(),width-margin,height-16,7,false,"#776984",100,"right");}
 return Buffer.from(await pdf.save());
}
module.exports={schedulePdf,scheduleWorkbook,scheduleDates,workbookFromRows,workbookFromSheets,columnName};
