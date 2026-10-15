"use client";
import { useUiText } from '@/app/i18n';
import { useRef, useState } from "react";
import {usePermission} from '@/app/account/AccountContext';
import {PermissionButton} from '@/app/account/PermissionControls';
import { readApiResponse } from "@/lib/client/read-api-response";
import { DOCUMENT_TYPES } from "@/lib/operations/employee-uploads";
import { ProfileIcon, StatusPill, profileDate, readable } from "./EmployeeProfileCards";
import styles from "./EmployeeProfile.module.css";

export function DocumentUpload({employee,reload}) {
  const localize = useUiText();
  const canUpload=usePermission('files.upload');
  const input=useRef(null);
  const [file,setFile]=useState(null); const [busy,setBusy]=useState(false); const [error,setError]=useState(""); const [message,setMessage]=useState("");
  const [form,setForm]=useState({documentType:"OTHER",displayName:"",issueDate:"",expiryDate:"",notes:""});
  async function upload(event) {
    event.preventDefault(); if(!file||busy) return;
    const target=employee.id; const data=new FormData(); data.set("file",file); data.set("employeeId",target); Object.entries(form).forEach(([key,value])=>data.set(key,value));
    setBusy(true); setError(""); setMessage("");
    try {
      const response=await fetch(`/api/operations/employees/${target}/documents`,{method:"POST",body:data});
      const payload=await readApiResponse(response,"Upload failed");
      if(payload.document?.employeeId!==target) throw new Error("Upload target verification failed");
      setFile(null); if(input.current) input.current.value="";
      setForm(current=>({...current,displayName:"",issueDate:"",expiryDate:"",notes:""})); setMessage("Document uploaded successfully."); await reload();
    } catch(requestError) {setError(requestError.message||"Upload failed");} finally {setBusy(false);}
  }
  const field=(key,value)=>setForm(current=>({...current,[key]:value}));
  return <form className="employee360-form" data-employee-id={employee.id} onSubmit={upload}>
    <p className="muted">{localize("Upload target:")} <b>{employee.name}</b> · {employee.hrisNumber||employee.localEmployeeCode||employee.id}</p>
    {error&&<div role="alert" className="alert danger">{localize(error)}</div>}{message&&<div role="status" className="alert success">{localize(message)}</div>}
    <label>{localize("Type")}<select aria-label={localize("Document type")} disabled={busy||!canUpload} value={form.documentType} onChange={event=>field("documentType",event.target.value)}>{DOCUMENT_TYPES.map(type=><option value={type} key={type}>{localize(type)}</option>)}</select></label>
    <label>{localize("Display name")}<input disabled={busy||!canUpload} maxLength={200} value={form.displayName} onChange={event=>field("displayName",event.target.value)} /></label>
    <label>{localize("Issue date")}<input type="date" disabled={busy||!canUpload} value={form.issueDate} onChange={event=>field("issueDate",event.target.value)} /></label>
    <label>{localize("Expiry date")}<input type="date" disabled={busy||!canUpload} value={form.expiryDate} onChange={event=>field("expiryDate",event.target.value)} /></label>
    <label>{localize("Notes")}<input disabled={busy||!canUpload} maxLength={4000} value={form.notes} onChange={event=>field("notes",event.target.value)} /></label>
    <label>{localize("Secure local file")}<input ref={input} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" disabled={busy||!canUpload} onChange={event=>{setFile(event.target.files?.[0]||null);setError("");setMessage("");}} /></label>
    <PermissionButton permission="files.upload" type="submit" disabled={!file||busy}>{busy?localize("Uploading…"):`${localize("Upload document for")} ${employee.name}`}</PermissionButton>
  </form>;
}

export function DocumentActions({employee,documents,reload}) {
  const localize = useUiText();
  const canDownload=usePermission('files.download');
  const [busy,setBusy]=useState(""); const [error,setError]=useState("");
  async function remove(doc) {
    if(busy||!window.confirm(`${localize("Remove")} ${doc.displayName}?`)) return;
    setBusy(doc.id); setError("");
    try {await readApiResponse(await fetch(`/api/operations/employees/${employee.id}/documents/${doc.id}`,{method:"DELETE"}),"Removal failed"); await reload();}
    catch(requestError){setError(requestError.message||"Removal failed");}finally{setBusy("");}
  }
  return <>{error&&<div role="alert" className="alert danger">{localize(error)}</div>}<div className={styles.documentGrid}>{documents.length?documents.map(doc=><article className={`${styles.documentCard} employee-doc-actions`} key={doc.id}>
    <header><span className={styles.positionIcon}><ProfileIcon kind="document"/></span><div><b>{doc.displayName}</b><small>{localize(doc.documentType)} · {Math.ceil(doc.sizeBytes/1024)} KB</small></div><StatusPill value={doc.status}/></header>
    <dl><div><dt>{localize("Issue date")}</dt><dd>{profileDate(doc.issueDate)}</dd></div><div><dt>{localize("Expiry")}</dt><dd>{profileDate(doc.expiryDate)}</dd></div><div><dt>{localize("Uploaded")}</dt><dd>{profileDate(doc.uploadedAt)}</dd></div></dl>
    {doc.notes&&<p>{doc.notes}</p>}
    {doc.status==="ACTIVE"&&<footer>
    {canDownload&&<a href={`/api/operations/employees/${employee.id}/documents/${doc.id}`} target="_blank" rel="noreferrer">{localize("View")} {doc.displayName}</a>}
    {canDownload&&<a href={`/api/operations/employees/${employee.id}/documents/${doc.id}?download=1`}>{localize("Download")}</a>}
    <PermissionButton permission="files.archive" type="button" disabled={Boolean(busy)} onClick={()=>remove(doc)}>{busy===doc.id?localize("Removing…"):localize("Remove")}</PermissionButton>
    </footer>}
  </article>):<p className={styles.empty}>{localize("No documents uploaded yet.")}</p>}</div></>;
}
