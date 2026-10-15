// Tajawal's shaper handles Arabic joining. Separate script runs keep Latin
// identifiers and numerals readable instead of reversing them with Arabic.
const ARABIC=/[\u0600-\u06ff\u0750-\u077f\u08a0-\u08ff]/;
const clean=value=>String(value??"—").replace(/[\u0000-\u001f\u007f]/g," ");
function createPdfText(fonts){
 const font=bold=>bold?fonts.latinBold:fonts.latinRegular;
 const runs=value=>clean(value).match(/[\u0600-\u065f\u066a-\u06ef\u06fa-\u06ff\u0750-\u077f\u08a0-\u08ff]+|[^\u0600-\u065f\u066a-\u06ef\u06fa-\u06ff\u0750-\u077f\u08a0-\u08ff\s]+|\s+/g)||["—"];
 const runWidth=(value,size,bold)=>/^\s+$/.test(value)?value.length*size*.28:font(bold).widthOfTextAtSize(value,size);
 const width=(value,size=9,bold=false)=>runs(value).reduce((sum,run)=>sum+runWidth(run,size,bold),0);
 const fit=(value,maxWidth,size=9,bold=false)=>{let shown=clean(value);if(width(shown,size,bold)<=maxWidth)return shown;while(shown.length&&width(shown+"…",size,bold)>maxWidth)shown=shown.slice(0,-1);return shown+"…";};
 function draw(page,value,{x,y,size=9,bold=false,color,align="left",maxWidth=Infinity}){
  const shown=fit(value,maxWidth,size,bold),total=width(shown,size,bold),parts=runs(shown);if(ARABIC.test(shown))parts.reverse();let at=x-(align==="right"?total:align==="center"?total/2:0);
  for(const part of parts){if(!/^\s+$/.test(part))page.drawText(part,{x:at,y,size,font:font(bold),color});at+=runWidth(part,size,bold);}
 }
 return {width,fit,draw};
}
module.exports={createPdfText};
