"use client";

import { useState } from "react";
import { readApiResponse } from "@/lib/client/read-api-response";

const today = () => new Date().toISOString().slice(0, 10);

export default function HrisConversionModal({ employee, onClose, onConverted }) {
  const [form, setForm] = useState({
    hrisNumber: "",
    effectiveDate: today(),
    contractEnd: "",
    jobTitle: employee.jobTitle || "",
    jobCode: "",
    reason: "Converted from Part-Time to HRIS",
  });
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  async function upload(documentType, file, dates = {}) {
    if (!file) return;
    const data = new FormData();
    data.set("employeeId", employee.id);
    data.set("documentType", documentType);
    data.set("displayName", file.name);
    data.set("notes", documentType === "CONTRACT" ? form.reason : "HRIS hiring document");
    if (dates.issueDate) data.set("issueDate", dates.issueDate);
    if (dates.expiryDate) data.set("expiryDate", dates.expiryDate);
    data.set("file", file);
    const response = await fetch(`/api/operations/employees/${employee.id}/documents`, { method: "POST", body: data });
    await readApiResponse(response, `Could not upload ${file.name}`);
  }

  async function submit(event) {
    event.preventDefault();
    if (!/^\d{5}$/.test(form.hrisNumber)) return setError("HRIS number must contain exactly 5 digits.");
    if (!files.contract) return setError("The signed HRIS contract is required.");
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/operations/employees/${employee.id}/360`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "convertToHris", ...form }),
      });
      await readApiResponse(response, "Could not convert employee to HRIS");
      const uploads = [
        ["CONTRACT", files.contract, { issueDate: form.effectiveDate, expiryDate: form.contractEnd }],
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
      if (failed.length) window.alert(`The HRIS conversion was saved, but ${failed.length} document(s) did not upload. Add them from Documents.`);
      await onConverted();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  const fileInput = (label, key, accept = "image/jpeg,image/png,image/webp,application/pdf") => <label>{label}<input type="file" accept={accept} onChange={(event) => setFiles((current) => ({ ...current, [key]: event.target.files?.[0] || null }))} /></label>;

  return <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
    <section className="detail-modal hris-conversion-modal" role="dialog" aria-modal="true" aria-labelledby="hris-conversion-title" onMouseDown={(event) => event.stopPropagation()}>
      <div className="modal-head"><div><span className="badge">PT → HRIS</span><h2 id="hris-conversion-title">Convert employee to HRIS</h2><p><b>{employee.name}</b> · {employee.localEmployeeCode || "No local code"}</p></div><button type="button" onClick={onClose}>Close</button></div>
      {error && <div className="alert danger">{error}</div>}
      <form onSubmit={submit}>
        <fieldset><legend>HRIS appointment</legend><div className="hris-conversion-grid">
          <label>HRIS number<input required inputMode="numeric" pattern="\d{5}" maxLength="5" value={form.hrisNumber} onChange={(event) => set("hrisNumber", event.target.value.replace(/\D/g, ""))} /></label>
          <label>Effective date<input required type="date" value={form.effectiveDate} onChange={(event) => set("effectiveDate", event.target.value)} /></label>
          <label>Contract end<input type="date" min={form.effectiveDate} value={form.contractEnd} onChange={(event) => set("contractEnd", event.target.value)} /></label>
          <label>Job title<input required value={form.jobTitle} onChange={(event) => set("jobTitle", event.target.value)} /></label>
          <label>Job code<input value={form.jobCode} onChange={(event) => set("jobCode", event.target.value)} /></label>
          <label className="hris-conversion-wide">Conversion reason<textarea aria-label="HRIS conversion reason" required value={form.reason} onChange={(event) => set("reason", event.target.value)} /></label>
        </div></fieldset>
        <fieldset><legend>Contract and hiring papers</legend><div className="hris-conversion-files">
          <label className="required-file">Signed HRIS contract (required)<input required type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(event) => setFiles((current) => ({ ...current, contract: event.target.files?.[0] || null }))} /></label>
          {fileInput("Employee photo", "employeePhoto", "image/jpeg,image/png,image/webp")}
          {fileInput("National ID front", "nationalIdFront")}
          {fileInput("National ID back", "nationalIdBack")}
          {fileInput("Education certificate", "educationCertificate")}
          {fileInput("Criminal record", "criminalRecord")}
          {fileInput("Medical certificate", "medicalCertificate")}
          {fileInput("Military status", "militaryStatus")}
          <label className="hris-conversion-wide">Other hiring documents<input multiple type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(event) => setFiles((current) => ({ ...current, hiringDocuments: [...(event.target.files || [])] }))} /></label>
        </div></fieldset>
        <div className="hris-conversion-footer"><span>The current PT profile, history, attendance, and documents stay on the same employee file. The PT code is removed after conversion.</span><button type="submit" disabled={busy || !files.contract}>{busy ? "Converting and uploading…" : "Convert to HRIS"}</button></div>
      </form>
    </section>
  </div>;
}
