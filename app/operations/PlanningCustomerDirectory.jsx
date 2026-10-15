"use client";
import { useUiText } from '@/app/i18n';
import {FormSection} from "../ui/DesktopLayout";
import ActionButton from "@/app/ActionButton";
import {PermissionButton} from '@/app/account/PermissionControls';

import { useState } from "react";
import styles from "./PlanningCustomerDirectory.module.css";

const DIRECTORY_CONFIG = {
  academy: {
    actions: { save: "savePartner", remove: "deletePartner" },
    idKey: "partnerId",
    labels: {
      title: ["الأكاديميات والمدارس", "Academies and schools"],
      description: ["احفظ بيانات المدارس والأكاديميات لاستخدامها في الرحلات الجديدة.", "Save school and academy contacts for reuse in new trips."],
      newRecord: ["أكاديمية جديدة", "New academy"],
      editRecord: ["تعديل الأكاديمية", "Edit academy"],
      primary: ["الأكاديمية", "Academy"],
      contact: ["المشرف", "Supervisor"],
      phone: ["الهاتف", "Phone"],
      notes: ["ملاحظات", "Notes"],
      save: ["حفظ الأكاديمية", "Save academy"],
      saved: ["تم حفظ الأكاديمية", "Academy saved"],
      deleted: ["تم حذف الأكاديمية", "Academy deleted"],
      deletePrompt: ["حذف هذه الأكاديمية؟ ستظل بيانات الرحلات القديمة محفوظة.", "Delete this academy? Existing trip details will remain saved."],
    },
    fields: [
      { name: "name", key: "name", label: ["اسم الأكاديمية", "Academy name"], required: true },
      { name: "supervisorName", key: "supervisorName", label: ["اسم المشرف", "Supervisor"] },
      { name: "supervisorPhone", key: "supervisorPhone", label: ["رقم المشرف", "Phone"], type: "tel" },
      { name: "notes", key: "notes", label: ["ملاحظات", "Notes"], textarea: true },
    ],
    cells: item => [item.name, item.supervisorName || "—", item.supervisorPhone || "—", item.notes || "—"],
  },
  birthday: {
    actions: { save: "saveCustomer", remove: "deleteCustomer" },
    idKey: "customerId",
    labels: {
      title: ["عملاء أعياد الميلاد", "Birthday customers"],
      description: ["احفظ بيانات العميل والطفل لاستخدامها في حجوزات أعياد الميلاد الجديدة.", "Save customer and child details for reuse in new birthday bookings."],
      newRecord: ["عميل جديد", "New customer"],
      editRecord: ["تعديل العميل", "Edit customer"],
      primary: ["العميل", "Customer"],
      contact: ["الطفل", "Child"],
      phone: ["الهاتف", "Phone"],
      notes: ["ملاحظات", "Notes"],
      save: ["حفظ العميل", "Save customer"],
      saved: ["تم حفظ العميل", "Customer saved"],
      deleted: ["تم حذف العميل", "Customer deleted"],
      deletePrompt: ["حذف هذا العميل؟ ستظل بيانات الحجوزات القديمة محفوظة.", "Delete this customer? Existing booking details will remain saved."],
    },
    fields: [
      { name: "customerName", key: "customerName", label: ["اسم العميل", "Customer name"], required: true },
      { name: "phone", key: "phone", label: ["رقم الهاتف", "Phone"], required: true, type: "tel" },
      { name: "childName", key: "childName", label: ["اسم الطفل", "Child name"] },
      { name: "notes", key: "notes", label: ["ملاحظات", "Notes"], textarea: true },
    ],
    cells: item => [item.customerName, item.childName || "—", item.phone, item.notes || "—"],
  },
};

function translated(pair, isArabic) {
  return pair[isArabic ? 0 : 1];
}

export default function PlanningCustomerDirectory({ kind, items = [], branch = "MOT", isArabic = false, disabled = false, request, onChanged, onNotice }) {
  const localize = useUiText();
  const config = DIRECTORY_CONFIG[kind];
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState(false);
  if (!config) return null;

  const label = key => translated(config.labels[key], isArabic);
  const finish = async message => {
    await onChanged?.();
    onNotice?.("success", message);
  };

  async function save(event) {
    event.preventDefault();
    const form = event.currentTarget;
    setBusy(true);
    try {
      const values = Object.fromEntries(new FormData(form).entries());
      await request("/api/operations/config", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: config.actions.save, branch: editing?.branch || branch, ...(editing ? { [config.idKey]: editing.id } : {}), ...values }),
      });
      setEditing(null);
      form.reset();
      await finish(label("saved"));
    } catch (error) {
      onNotice?.("danger", error.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(item) {
    if (!window.confirm(label("deletePrompt"))) return;
    setBusy(true);
    try {
      await request("/api/operations/config", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: config.actions.remove, branch: item.branch || branch, [config.idKey]: item.id }),
      });
      if (editing?.id === item.id) setEditing(null);
      await finish(label("deleted"));
    } catch (error) {
      onNotice?.("danger", error.message);
    } finally {
      setBusy(false);
    }
  }

  const locked = disabled || busy;
  return <section className={`panel ${styles.directory}`} aria-labelledby={`${kind}-directory-title`}>
    <header className={styles.header}>
      <div><span>{isArabic ? "بيانات قابلة لإعادة الاستخدام" : "REUSABLE CONTACTS"}</span><h2 id={`${kind}-directory-title`}>{label("title")}</h2><p>{label("description")}</p></div>
      <b>{items.length}</b>
    </header>

    <div className={styles.tableWrap} role="region" tabIndex={0} aria-label={label("title")}>
      <table>
        <thead><tr><th>{label("primary")}</th><th>{label("contact")}</th><th>{label("phone")}</th><th>{label("notes")}</th><th>{isArabic ? "الإجراءات" : localize("Actions")}</th></tr></thead>
        <tbody>{items.length ? items.map(item => <tr key={item.id}>
          {config.cells(item).map((value, index) => <td key={index}>{value}</td>)}
          <td><div className={styles.actions}><PermissionButton permission={`${kind==='academy'?'trips':'birthdays'}.edit`} type="button" className="secondary" disabled={locked} onClick={() => setEditing(item)}>{isArabic ? "تعديل" : localize("Edit")}</PermissionButton><PermissionButton permission={`${kind==='academy'?'trips':'birthdays'}.archive`} type="button" className="danger" disabled={locked} onClick={() => remove(item)}>{isArabic ? "حذف" : localize("Delete")}</PermissionButton></div></td>
        </tr>) : <tr><td className={styles.empty} colSpan={5}>{isArabic ? "لا توجد بيانات محفوظة بعد." : "No saved records yet."}</td></tr>}</tbody>
      </table>
    </div>

    <FormSection title={editing?label("editRecord"):label("newRecord")} open={Boolean(editing)}><form key={editing?.id || `new-${kind}`} className={styles.form} onSubmit={save}>

      <fieldset disabled={locked}>
        {config.fields.map(field => <label className={field.textarea ? styles.notes : ""} key={field.name}><span>{translated(field.label, isArabic)}</span>{field.textarea ? <textarea name={field.name} defaultValue={editing?.[field.key] || ""} /> : <input name={field.name} type={field.type || "text"} required={field.required} defaultValue={editing?.[field.key] || ""} />}</label>)}
      </fieldset>
      <div className={styles.formActions}><PermissionButton permission={`${kind==='academy'?'trips':'birthdays'}.${editing?'edit':'create'}`} type="submit" disabled={locked}>{busy ? (isArabic ? "جارٍ الحفظ…" : "Saving…") : label("save")}</PermissionButton>{editing && <ActionButton type="button" className="secondary" disabled={locked} onClick={() => setEditing(null)}>{isArabic ? "إلغاء" : localize("Cancel")}</ActionButton>}</div>
    </form></FormSection>
  </section>;
}

