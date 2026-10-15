"use client";
import { useUiText } from '@/app/i18n';
import SafeDialog from "../ui/SafeDialog";
import { OperationalError } from "../ui/OperationalFeedback";
import ActionButton from "@/app/ActionButton";

import { useState, useRef } from "react";
import { readApiResponse } from "@/lib/client/read-api-response";

const today = () => new Date().toISOString().slice(0, 10);

export default function HrisConversionModal({ employee, onClose, onConverted }) {
  const localize = useUiText();
  const [form, setForm] = useState({
    hrisNumber: "",
    effectiveDate: today(),
    contractEnd: "",
    jobTitle: employee.jobTitle || "",
    jobCode: "",
    reason: "Converted from Part-Time to HRIS",
  });
  const initialFormRef = useRef(form);
  const [files, setFiles] = useState({
    contract: null,
    employeePhoto: null,
    nationalIdFront: null,
    nationalIdBack: null,
    educationCertificate: null,
    criminalRecord: null,
    medicalCertificate: null,
    militaryStatus: null,
    hiringDocuments: [],
  });
  const savedContracts = (employee.documents || []).filter(document => document.documentType === 'CONTRACT' && document.status === 'ACTIVE');
  const [savedContractId, setSavedContractId] = useState('');
  const uploadedRef = useRef(new Map());
  const tokensRef = useRef(new Map());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  async function upload(documentType, file, dates = {}) {
    if (!file) return;
    if (uploadedRef.current.has(file)) return uploadedRef.current.get(file);
    if (!tokensRef.current.has(file)) tokensRef.current.set(file, crypto.randomUUID());
    const data = new FormData();
    data.set("employeeId", employee.id);
    data.set("uploadToken", tokensRef.current.get(file));
    data.set("documentType", documentType);
    data.set("displayName", file.name);
    data.set("notes", documentType === "CONTRACT" ? form.reason : "HRIS hiring document");
    if (dates.issueDate) data.set("issueDate", dates.issueDate);
    if (dates.expiryDate) data.set("expiryDate", dates.expiryDate);
    data.set("file", file);
    const response = await fetch(`/api/operations/employees/${employee.id}/documents`, { method: "POST", body: data });
    const result = await readApiResponse(response, `Could not upload ${file.name}`);
    uploadedRef.current.set(file, result.document.id);
    return result.document.id;
  }

  async function submit(event) {
    event.preventDefault();
    if (!/^\d{5}$/.test(form.hrisNumber)) return setError("HRIS number must contain exactly 5 digits.");
    if (!files.contract && !savedContractId) return setError("The signed HRIS contract is required.");
    setBusy(true);
    setError("");
    try {
      const contractDocumentId = savedContractId || await upload("CONTRACT", files.contract, { issueDate: form.effectiveDate, expiryDate: form.contractEnd });
      setSavedContractId(contractDocumentId);
      const response = await fetch(`/api/operations/employees/${employee.id}/360`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "convertToHris", ...form, contractDocumentId }),
      });
      await readApiResponse(response, "Could not convert employee to HRIS");
      const uploads = [
        ["EMPLOYEE_PHOTO", files.employeePhoto],
        ["NATIONAL_ID_FRONT", files.nationalIdFront],
        ["NATIONAL_ID_BACK", files.nationalIdBack],
        ["EDUCATION_CERTIFICATE", files.educationCertificate],
        ["CRIMINAL_RECORD", files.criminalRecord],
        ["MEDICAL_CERTIFICATE", files.medicalCertificate],
        ["MILITARY_STATUS", files.militaryStatus],
        ...files.hiringDocuments.map((file) => ["HIRING_DOCUMENT", file]),
      ].filter(([, file]) => file);
      const results = await Promise.allSettled(uploads.map(([type, file, dates]) => upload(type, file, dates)));
      const failed = results.filter((result) => result.status === "rejected");
      if (failed.length) window.alert(`${localize("The HRIS conversion was saved.")} ${failed.length} ${localize("documents did not upload. Add them from Documents.")}`);
      await onConverted();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  const fileInput = (label, key, accept = "image/jpeg,image/png,image/webp,application/pdf") => <label>{localize(label)}<input type="file" accept={accept} onChange={(event) => setFiles((current) => ({ ...current, [key]: event.target.files?.[0] || null }))} /></label>;

  return <SafeDialog className="hris-conversion-modal" titleId="hris-conversion-title" onClose={onClose} busy={busy} dirty={Boolean(savedContractId) || JSON.stringify(form) !== JSON.stringify(initialFormRef.current) || Object.values(files).some(value => Array.isArray(value) ? value.length : Boolean(value))}>{close => <>
      <div className="modal-head"><div><span className="badge">PT → HRIS</span><h2 id="hris-conversion-title">{localize("Convert employee to HRIS")}</h2><p><b>{employee.name}</b> · {employee.localEmployeeCode || localize("No local code")}</p></div><ActionButton type="button" disabled={busy} onClick={close}>Close</ActionButton></div>
      <OperationalError error={error}/>
      <form onSubmit={submit}><fieldset disabled={busy} className="ui-dialog-fields">
        <fieldset><legend>{localize("HRIS appointment")}</legend><div className="hris-conversion-grid">
          <label>{localize("HRIS number")}<input required inputMode="numeric" pattern="\d{5}" maxLength="5" value={form.hrisNumber} onChange={(event) => set("hrisNumber", event.target.value.replace(/\D/g, ""))} /></label>
          <label>{localize("Effective date")}<input required type="date" value={form.effectiveDate} onChange={(event) => set("effectiveDate", event.target.value)} /></label>
          <label>{localize("Contract end")}<input type="date" min={form.effectiveDate} value={form.contractEnd} onChange={(event) => set("contractEnd", event.target.value)} /></label>
          <label>{localize("Job title")}<input required value={form.jobTitle} onChange={(event) => set("jobTitle", event.target.value)} /></label>
          <label>{localize("Job code")}<input value={form.jobCode} onChange={(event) => set("jobCode", event.target.value)} /></label>
          <label className="hris-conversion-wide">{localize("Conversion reason")}<textarea aria-label={localize("HRIS conversion reason")} required value={form.reason} onChange={(event) => set("reason", event.target.value)} /></label>
        </div></fieldset>
        <fieldset><legend>{localize("Contract and hiring papers")}</legend><div className="hris-conversion-files">
          {(savedContracts.length > 0 || savedContractId) && <label>{localize("Use saved signed contract")}<select aria-label={localize("Use saved signed contract")} value={savedContractId} onChange={event=>{setSavedContractId(event.target.value);setFiles(current=>({...current,contract:null}));}}><option value="">{localize("Upload a new contract")}</option>{savedContracts.map(document=><option key={document.id} value={document.id}>{document.displayName}</option>)}{savedContractId&&!savedContracts.some(document=>document.id===savedContractId)&&<option value={savedContractId}>{localize("Recently saved contract")}</option>}</select><small>{localize("Choose the signed contract for this appointment. Saved documents are kept if conversion fails.")}</small></label>}
          <label className="required-file">{localize("Signed HRIS contract (required)")}<input key={savedContractId || 'new'} required={!savedContractId} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(event) => {setSavedContractId('');setFiles((current) => ({ ...current, contract: event.target.files?.[0] || null }));}} /></label>
          <details className="hris-conversion-wide"><summary>{localize("Additional hiring documents (optional)")}</summary><div className="hris-conversion-files">
          {fileInput("Employee photo", "employeePhoto", "image/jpeg,image/png,image/webp")}
          {fileInput("National ID front", "nationalIdFront")}
          {fileInput("National ID back", "nationalIdBack")}
          {fileInput("Education certificate", "educationCertificate")}
          {fileInput("Criminal record", "criminalRecord")}
          {fileInput("Medical certificate", "medicalCertificate")}
          {fileInput("Military status", "militaryStatus")}
          <label className="hris-conversion-wide">{localize("Other hiring documents")}<input multiple type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(event) => setFiles((current) => ({ ...current, hiringDocuments: [...(event.target.files || [])] }))} /></label>
          </div></details>
        </div></fieldset>
        <div className="hris-conversion-footer"><span>{localize("The current PT profile, history, attendance, and documents stay on the same employee file. The PT code is removed after conversion.")}</span><ActionButton type="submit" disabled={busy || (!files.contract && !savedContractId)}>{busy ? localize("Converting and uploading…") : localize("Convert to HRIS")}</ActionButton></div>
      </fieldset></form>
    </>}
  </SafeDialog>;
}

