"use client";
import SafeDialog from "../ui/SafeDialog";
import { useState } from "react";
import { useI18n } from "../i18n";
import { readApiResponse } from "@/lib/client/read-api-response";

export default function EmployeeRemovalDialog({
  employee,
  restore = false,
  onClose,
  onSaved,
}) {
  const { isArabic } = useI18n();
  const text = (ar, en) => (isArabic ? ar : en);
  const [password, setPassword] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await fetch(`/api/operations/employees/${employee.id}`, {
        method: restore ? "PATCH" : "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          password,
          ...(restore ? { action: "restoreEmployee" } : {}),
        }),
      }).then(readApiResponse);
      setPassword("");
      onSaved(result);
    } catch (failure) {
      const messages = {
        "Current password is incorrect": "كلمة مرور حسابك غير صحيحة",
        "Current password is required": "أدخل كلمة مرور حسابك الحالي",
        "Too many password attempts. Try again later.":
          "محاولات كثيرة لكلمة المرور. حاول مرة أخرى بعد قليل.",
        "Employee access denied": "ليس لديك صلاحية لهذا الموظف أو فرعه",
        "Employee is already archived": "الموظف مؤرشف بالفعل",
        "Employee is not archived": "الموظف غير مؤرشف",
        "Employee not found": "الموظف غير موجود",
      };
      setPassword("");
      setError(
        isArabic
          ? messages[failure.message] ||
              "تعذر إتمام الإجراء. حدّث الصفحة وتحقق من صلاحياتك."
          : failure.message,
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <SafeDialog className="employee-removal-dialog" titleId="employee-removal-title" onClose={onClose} dirty={Boolean(password)} busy={busy}>{close => <>
      <form onSubmit={submit}>
        <div className="modal-head">
          <h2 id="employee-removal-title">
            {restore
              ? text("استعادة الموظف", "Restore employee")
              : text("حذف الموظف", "Delete employee")}
          </h2>
          <button
            type="button"
            className="secondary"
            disabled={busy}
            onClick={close}
          >
            {text("إغلاق", "Close")}
          </button>
        </div>
        <p>
          <strong>{employee.name}</strong> ·{" "}
          {employee.hrisNumber || employee.localEmployeeCode || "—"}
        </p>
        <p>
          {restore
            ? text(
                "سيعود الموظف إلى القائمة بحالته السابقة قبل الأرشفة.",
                "The employee returns to the directory with their status from before archival.",
              )
            : text(
                "بدون سجلات مرتبطة: حذف نهائي. إذا كان له حضور أو جدول أو تقييمات أو مستندات أو حساب مرتبط: أرشفة وإخفاء من القائمة مع الحفاظ على السجلات والملفات. يمكنك استعادته من فلتر «المؤرشفون».",
                "Without related records: permanent deletion. With attendance, schedules, evaluations, documents or a linked account: archive and hide from the directory, preserving records and files. Restore from the Archived filter.",
              )}
        </p>
        <label>
          {text("كلمة مرور حسابك الحالي", "Your current account password")}
          <input
            type="password"
            autoComplete="current-password"
            required
            autoFocus
            maxLength={200}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            disabled={busy}
          />
        </label>
        <p className="muted">
          {text(
            "كلمة المرور للتأكيد فقط؛ لا تُحفظ في السجل. حساب الدخول المرتبط لا يُحذف بهذا الإجراء.",
            "The password is only used for confirmation and is never logged. This action does not delete a linked login account.",
          )}
        </p>
        {error && (
          <p role="alert" className="alert danger">
            {error}
          </p>
        )}
        <div className="actions">
          <button
            className={restore ? "" : "danger"}
            disabled={busy || !password}
          >
            {busy
              ? text("جارٍ التنفيذ…", "Working…")
              : restore
                ? text("تأكيد الاستعادة", "Confirm restoration")
                : text("تأكيد الحذف", "Confirm deletion")}
          </button>
          <button
            type="button"
            className="secondary"
            disabled={busy}
            onClick={close}
          >
            {text("إلغاء", "Cancel")}
          </button>
        </div>
      </form>
    </>}</SafeDialog>
  );
}
