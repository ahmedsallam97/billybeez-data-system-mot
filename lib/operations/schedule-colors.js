// Upgrade only the shipped muted palette for display; preserve manager-picked colours.
const LEGACY={AM:"#f4dda0",BW:"#b9ddf2",PM:"#abc5e5",Annual:"#b9dfc3",Rep:"#efd992",OFF:"#efc1ce",SL:"#ebbac6",Unpaid:"#f2c392",Mission:"#b9e3ec",Holiday:"#d5afbf",ANP:"#efb8c0",AWP:"#ce8593"};
const COLORS={AM:"#ffe082",BW:"#a9dcfa",PM:"#d5b2f3",Annual:"#a6dfb2",Rep:"#ffe9a3",OFF:"#f5a4ad",SL:"#e0bef1",Unpaid:"#ffc28a",Mission:"#91c5f3",Holiday:"#baeafa",ANP:"#efafb9",AWP:"#db8fa6"};
function scheduleColors(config={}){return Object.fromEntries(Object.entries({...Object.fromEntries(Object.keys(COLORS).map(code=>[code,{label:code}])),...config}).map(([code,meta])=>[code,{...meta,color:!meta?.color||meta.color.toLowerCase()===LEGACY[code]?COLORS[code]||"#eeeeee":meta.color}]));}
function readableText(hex){const rgb=String(hex).replace("#","").match(/.{2}/g)?.map(value=>parseInt(value,16)/255);if(!rgb||rgb.length!==3||rgb.some(value=>!Number.isFinite(value)))return "#241237";const [r,g,b]=rgb.map(value=>value<=.04045?value/12.92:((value+.055)/1.055)**2.4);return .2126*r+.7152*g+.0722*b>.179?"#21132e":"#ffffff";}
function cellColor(value,config){const key=String(value).replace(/ Front$/i,"").replace(/^BW[12]$/,"BW");return config[key==="H"?"Holiday":key==="M"?"Mission":key]?.color||"#f5f3f7";}
module.exports={scheduleColors,cellColor,readableText};
