import { withAccountAccess } from '@/lib/accounts/routes';
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authorizeApi } from "@/lib/api-auth";
import { readEmployeeFile } from "@/lib/employee-file-storage";
import { contentDisposition } from "@/lib/operations/employee-uploads";

async function GETHandler(request, { params }) {
  const { error }=await authorizeApi("OPS_EMPLOYEE_SENSITIVE_READ"); if(error) return error;
  const {id,documentId}=await params;
  const doc=await prisma.employeeDocument.findFirst({where:{id:documentId,employeeId:id}});
  if(!doc || doc.status==="REMOVED") return NextResponse.json({success:false,error:"File not found"},{status:404});
  try {
    const data=await readEmployeeFile(doc.storageKey);
    return new NextResponse(data,{headers:{"content-type":doc.mimeType,"content-disposition":contentDisposition(doc.displayName,doc.mimeType,new URL(request.url).searchParams.has("download")),"cache-control":"private, no-store","x-content-type-options":"nosniff"}});
  } catch { return NextResponse.json({success:false,error:"Stored file is unavailable"},{status:404}); }
}
async function DELETEHandler(_request, { params }) {
  const {user,error}=await authorizeApi("OPS_EMPLOYEE_MANAGE"); if(error) return error;
  const {id,documentId}=await params;
  try {
    const doc=await prisma.employeeDocument.findFirst({where:{id:documentId,employeeId:id},include:{employee:{select:{name:true}}}});
    if(!doc) return NextResponse.json({success:false,error:"File not found"},{status:404});
    if(doc.status==="REMOVED") return NextResponse.json({success:true});
    await prisma.$transaction(async tx => {
      await tx.employeeDocument.update({where:{id:doc.id},data:{status:"REMOVED"}});
      await tx.auditLog.create({data:{action:"OPS_EMPLOYEE_DOCUMENT_REMOVED",userId:user.id,summary:`Removed ${doc.documentType} for ${doc.employee.name}`,metadata:JSON.stringify({employeeId:id,documentId})}});
    });
    return NextResponse.json({success:true});
  } catch(removeError) {
    console.error("Employee document removal failed",{documentId,code:removeError.code});
    return NextResponse.json({success:false,error:"The document could not be removed. Please retry."},{status:500});
  }
}

export const GET=withAccountAccess(GETHandler);
export const DELETE=withAccountAccess(DELETEHandler);
