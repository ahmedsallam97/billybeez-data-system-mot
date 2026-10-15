import { withAccountAccess } from '@/lib/accounts/routes';
import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { prisma } from "@/lib/db";
import { authorizeApi } from "@/lib/api-auth";
import { writeEmployeeFile, deleteEmployeeFile, readEmployeeFile } from "@/lib/employee-file-storage";
import { metadata, validateFileContent, UploadValidationError, FILE_EXTENSIONS } from "@/lib/operations/employee-uploads";

async function POSTHandler(request, { params }) {
  const { user, error } = await authorizeApi("OPS_EMPLOYEE_MANAGE"); if (error) return error;
  const { id } = await params;
  let form;
  try { form = await request.formData(); } catch { return NextResponse.json({success:false,error:"Choose a file and submit valid upload fields"},{status:400}); }
  if (String(form.get("employeeId") || "") !== id) return NextResponse.json({success:false,error:"Upload target does not match the selected employee"},{status:409});
  let storageKey; let written=false; let committed=false;
  try {
    const file=form.get("file"); const values=metadata(form,file);
    const employee=await prisma.employee.findUnique({where:{id},select:{name:true}});
    if(!employee) return NextResponse.json({success:false,error:"Employee not found"},{status:404});
    const buffer=Buffer.from(await file.arrayBuffer()); validateFileContent(buffer,file.type);
    const uploadToken = String(form.get("uploadToken") || "");
    if (uploadToken && !/^[a-f0-9-]{36}$/i.test(uploadToken)) throw new UploadValidationError("Invalid upload retry token");
    storageKey=`${id}/${uploadToken || crypto.randomUUID()}.${FILE_EXTENSIONS[file.type]}`;
    if (uploadToken) {
      const existing = await prisma.employeeDocument.findUnique({where:{storageKey}});
      if (existing) {
        const stored = await readEmployeeFile(storageKey);
        if (existing.employeeId !== id || existing.documentType !== values.documentType || !stored.equals(buffer)) throw new UploadValidationError("This upload retry belongs to a different document. Select the file again.");
        return NextResponse.json({success:true,document:existing,replayed:true});
      }
    }
    await writeEmployeeFile(storageKey,buffer,file.type); written=true;
    const document=await prisma.$transaction(async tx => {
      const created=await tx.employeeDocument.create({data:{employeeId:id,...values,storageKey,mimeType:file.type,sizeBytes:buffer.length,uploadedBy:user.id}});
      if(values.documentType==="EMPLOYEE_PHOTO") await tx.employeeDocument.updateMany({where:{employeeId:id,documentType:values.documentType,status:"ACTIVE",id:{not:created.id}},data:{status:"REPLACED",replacedById:created.id}});
      await tx.auditLog.create({data:{action:"OPS_EMPLOYEE_DOCUMENT_UPLOADED",userId:user.id,summary:`Uploaded ${values.documentType} for ${employee.name}`,metadata:JSON.stringify({employeeId:id,documentId:created.id,documentType:values.documentType})}});
      return created;
    });
    committed=true;
    return NextResponse.json({success:true,document});
  } catch(uploadError) {
    if (uploadError.code === "P2002" && storageKey) {
      const existing = await prisma.employeeDocument.findUnique({where:{storageKey}});
      if (existing) return NextResponse.json({success:true,document:existing,replayed:true});
    }
    if(written&&!committed) {
      try { await deleteEmployeeFile(storageKey); }
      catch(cleanupError) { console.error("Employee upload rollback cleanup failed",{storageKey,code:cleanupError.code}); }
    }
    if(uploadError instanceof UploadValidationError) return NextResponse.json({success:false,error:uploadError.message},{status:400});
    console.error("Employee upload failed",{employeeId:id,code:uploadError.code});
    return NextResponse.json({success:false,error:"The file could not be saved. Your existing documents and photo are unchanged. Please retry."},{status:500});
  }
}

export const POST=withAccountAccess(POSTHandler);
