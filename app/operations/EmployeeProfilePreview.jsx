"use client";
import { useUiText } from '@/app/i18n';
import SafeDialog from "../ui/SafeDialog";
import ActionButton from "@/app/ActionButton";
import { useEffect, useRef, useState } from "react";
import {usePermission} from '@/app/account/AccountContext';
import {PermissionButton} from '@/app/account/PermissionControls';
import styles from "./EmployeeProfile.module.css";

export default function EmployeeProfilePreview({employee,year,endDate,language,mode,sections,onClose}) {
  const localize = useUiText();
  const canPdf=usePermission('employees.pdf');
  const frame=useRef(null);const dialog=useRef(null);const [url,setUrl]=useState("");const [error,setError]=useState("");
  const query=new URLSearchParams({year,endDate,language,mode,sections:sections.join(","),attachments:"0",inline:"1"});
  const endpoint=`/api/operations/employees/${employee.id}/complete-file?${query}`;
  useEffect(()=>{
    const controller=new AbortController();let objectUrl="";setError("");setUrl("");
    fetch(endpoint,{signal:controller.signal}).then(async response=>{
      if(!response.ok){const data=await response.json().catch(()=>({}));throw new Error(data.error||"Profile PDF could not be generated.");}
      const blob=await response.blob();if(controller.signal.aborted)return;
      objectUrl=URL.createObjectURL(blob);setUrl(objectUrl);
    }).catch(error=>{if(error.name!=="AbortError")setError(error.message);});
    return()=>{controller.abort();if(objectUrl)URL.revokeObjectURL(objectUrl);};
  },[endpoint]);
  const attachments=new URLSearchParams(query);attachments.set("attachments","1");attachments.delete("inline");
  const filename=`employee-${employee.hrisNumber||employee.localEmployeeCode||employee.id}-${year}.pdf`;
  return <SafeDialog className={styles.profilePreview} titleId="employee-profile-preview-title" onClose={onClose}>{close => <><header><div><b id="employee-profile-preview-title">{localize("Employee profile print preview")}</b><small>{employee.name} · {year}-01-01 → {endDate}</small></div><div>{url&&<>{canPdf&&<a className="button-link" href={url} download={filename}>{localize("Download profile PDF")}</a>}<PermissionButton permission="employees.print" type="button" onClick={()=>{frame.current?.contentWindow?.focus();frame.current?.contentWindow?.print();}}>Print preview</PermissionButton></>}{canPdf&&["FULL_RESTRICTED","CUSTOM"].includes(mode)&&sections.some(section=>["Documents","Files"].includes(section))&&<a className="button-link" href={`/api/operations/employees/${employee.id}/complete-file?${attachments}`}>{localize("Download PDF + attachments")}</a>}<ActionButton type="button" className="secondary" onClick={close}>Close preview</ActionButton></div></header>{error?<p role="alert" className="alert danger">{localize(error)}</p>:url?<iframe ref={frame} src={url} title={localize("Employee profile PDF")}/>:<p role="status">{localize("Preparing the protected profile report…")}</p>}</>}</SafeDialog>;
}

