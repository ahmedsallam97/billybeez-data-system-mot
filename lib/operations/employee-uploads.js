const DOCUMENT_TYPES = ["EMPLOYEE_PHOTO", "NATIONAL_ID_FRONT", "NATIONAL_ID_BACK", "CONTRACT", "HIRING_DOCUMENT", "EDUCATION_CERTIFICATE", "CRIMINAL_RECORD", "MEDICAL_CERTIFICATE", "MILITARY_STATUS", "CERTIFICATE", "OTHER"];
const FILE_EXTENSIONS = { "image/jpeg":"jpg", "image/png":"png", "image/webp":"webp", "application/pdf":"pdf" };
const MAX_FILE_BYTES = 8 * 1024 * 1024;
class UploadValidationError extends Error {}
function dateField(value, label) {
  if (!value) return null;
  const text=String(value); const date=new Date(`${text}T00:00:00.000Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0,10)!==text) throw new UploadValidationError(`${label} must be a valid date`);
  return date;
}
function metadata(form, file) {
  const documentType=String(form.get("documentType") || "OTHER");
  if (!DOCUMENT_TYPES.includes(documentType)) throw new UploadValidationError("Choose a supported document type");
  if (!file || typeof file.arrayBuffer!=="function" || !file.size || file.size>MAX_FILE_BYTES || !Object.hasOwn(FILE_EXTENSIONS,file.type)) throw new UploadValidationError("Use a JPG, PNG, WebP, or PDF up to 8 MB");
  if(documentType==="EMPLOYEE_PHOTO" && file.type==="application/pdf") throw new UploadValidationError("Employee photo must be an image");
  const displayName=String(form.get("displayName") || file.name || "Employee file").trim();
  const notes=String(form.get("notes") || "").trim();
  if (!displayName || displayName.length>200 || /[\u0000-\u001f\u007f]/.test(displayName)) throw new UploadValidationError("Display name must be 1–200 characters without control characters");
  if(notes.length>4000) throw new UploadValidationError("Notes must be 4,000 characters or fewer");
  const issueDate=dateField(form.get("issueDate"),"Issue date"); const expiryDate=dateField(form.get("expiryDate"),"Expiry date");
  if(issueDate && expiryDate && expiryDate<issueDate) throw new UploadValidationError("Expiry date cannot be before issue date");
  return {documentType,displayName,issueDate,expiryDate,notes:notes||null};
}
function validateFileContent(buffer, mimeType) {
  const valid = mimeType==="image/png" ? buffer.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))
    : mimeType==="image/jpeg" ? buffer.length>=4&&buffer[0]===255&&buffer[1]===216&&buffer[2]===255
    : mimeType==="image/webp" ? buffer.length>=12&&buffer.toString("ascii",0,4)==="RIFF"&&buffer.toString("ascii",8,12)==="WEBP"
    : mimeType==="application/pdf" ? buffer.toString("ascii",0,5)==="%PDF-" : false;
  if(!valid) throw new UploadValidationError("File contents do not match its JPG, PNG, WebP, or PDF format");
}
function contentDisposition(displayName,mimeType,download=false) {
  const extension=FILE_EXTENSIONS[mimeType] || "bin";
  let name=String(displayName || "Employee file").toWellFormed().replace(/[\u0000-\u001f\u007f/\\]/g,"_").slice(0,200);
  if(!new RegExp(`\\.${extension==="jpg"?"jpe?g":extension}$`,"i").test(name)) name+=`.${extension}`;
  const fallback=name.replace(/[^\x20-\x7e]|["\\]/g,"_");
  const encoded=encodeURIComponent(name).replace(/[!'()*]/g,char=>`%${char.charCodeAt(0).toString(16).toUpperCase()}`);
  return `${download?"attachment":"inline"}; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}
module.exports={DOCUMENT_TYPES,FILE_EXTENSIONS,MAX_FILE_BYTES,UploadValidationError,metadata,validateFileContent,contentDisposition};
