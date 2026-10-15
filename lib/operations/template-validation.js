const object = (value, label) => { if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(label + " must be an object"); return value; };
const text = (value, label, max = 1000) => { if (typeof value !== "string" || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) throw new Error(label + " must be text up to " + max + " characters"); };
const color = (value, label) => { if (!/^#[0-9a-f]{6}$/i.test(value)) throw new Error(label + " must be a six-digit hex color"); };
const choice = (value, values, label) => { if (!values.includes(value)) throw new Error("Invalid " + label); };
const number = (value, min, max, label, integer = false) => { if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) throw new Error(label + " must be between " + min + " and " + max); };
function logo(value) { text(value,"Logo URL",2000); if(value.startsWith("/")&&!value.startsWith("//")&&!value.includes("\\"))return; try{ const url=new URL(value); if(["https:","http:"].includes(url.protocol)&&!url.username&&!url.password)return; }catch{} throw new Error("Logo URL must be a local path or HTTP(S) URL"); }
function record(value, label, validate) { for(const [key,item] of Object.entries(object(value,label)))validate(item,label+"."+key); }
function order(value, choices, label) { if(!Array.isArray(value)||!value.length||new Set(value).size!==value.length||value.some(item=>!choices.includes(item)))throw new Error(label+" must contain distinct known sections"); }
function validateDailyTemplate(value) {
  object(value,"Daily template");
  for(const [key,item] of Object.entries(value)){
    if(key==="logoUrl")logo(item);
    else if(["primary","accent","text","amColor","bwColor","pmColor"].includes(key))color(item,key);
    else if(["labels","cardContent"].includes(key))record(item,key,text);
    else if(["roleColors","cardColors"].includes(key))record(item,key,color);
    else if(["visibleCards","visibleSections"].includes(key))record(item,key,(item,label)=>{if(typeof item!=="boolean")throw new Error(label+" must be a boolean");});
    else if(key==="cardOrder")order(item,["trips","birthdays","offers","bracelets"],key);
    else if(key==="sectionOrder")order(item,["roster","leaves","notes","footer","offers"],key);
    else if(key==="weekdayLocale"){text(item,key,40);try{new Intl.DateTimeFormat(item);}catch{throw new Error("Invalid date locale");}}
    else if(["title","subtitle","footerMotto","branchName","currency","operationalNotes"].includes(key))text(item,key,key==="operationalNotes"?4000:500);
  }
  return value;
}
function validateRecognition(value) {
  object(value,"Recognition artwork");
  if(value.theme!==undefined)choice(value.theme,["CLASSIC","ROYAL","CELEBRATION"],"artwork theme");
  for(const kind of ["global","monthly","hall"]){
    if(value[kind]===undefined)continue;
    for(const [key,item] of Object.entries(object(value[kind],kind))){
      const label=kind+"."+key;
      if(key==="logoUrl")logo(item);
      else if(["primary","secondary","accent","background","text","nameColor","oddMonthColor","evenMonthColor"].includes(key))color(item,label);
      else if(key==="template")choice(item,["T01","T02","T03","T04","T05"],label);
      else if(key==="photoFit")choice(item,["cover","contain"],label);
      else if(key==="photoPosition")choice(item,["center","top","bottom","left","right"],label);
      else if(key==="nameFontSize")number(item,kind==="hall"?8:16,kind==="hall"?20:58,label);
      else if(key==="nameFontWeight")number(item,400,950,label);
      else if(key==="nameLetterSpacing")number(item,-3,10,label);
      else if(key==="nameMaxLines")number(item,1,3,label,true);
      else if(key==="monthLabels"){if(!Array.isArray(item)||item.length!==12)throw new Error("Month labels must contain exactly 12 names");item.forEach(item=>text(item,label,40));}
      else if(key==="values"){if(!Array.isArray(item)||item.length>8)throw new Error("Footer values must contain at most 8 items");item.forEach(item=>record(item,label,(entry,name)=>text(entry,name,160)));}
      else if(key==="nameBackground"){text(item,label,300);if(!/^#[0-9a-f]{6}$/i.test(item)&&!/^linear-gradient\([-#0-9a-zA-Z.% ,]+\)$/.test(item))throw new Error("Name background must be a hex color or linear gradient");}
      else text(item,label,1200);
    }
  }
  if(value.employeeNameOverrides!==undefined)record(value.employeeNameOverrides,"Employee display name",(item,label)=>text(item,label,160));
  if(value.employeePhotoFrames!==undefined)record(value.employeePhotoFrames,"Employee photo framing",(frame,label)=>{
    object(frame,label);
    for(const key of Object.keys(frame))if(!["x","y","zoom","fit"].includes(key))throw new Error("Unknown photo framing option");
    number(frame.x,0,100,label+" horizontal position");
    number(frame.y,0,100,label+" vertical position");
    number(frame.zoom,.5,3,label+" zoom");
    choice(frame.fit,["cover","contain"],label+" fit");
  });
  return value;
}
module.exports={validateDailyTemplate,validateRecognition};
