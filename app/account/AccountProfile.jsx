"use client";
import { useUiText } from '@/app/i18n';
import {PageHeader} from '../ui/DesktopLayout';
import ActionButton from "@/app/ActionButton";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useI18n } from "../i18n";
import { useAccount, Avatar, accountSaved } from "./AccountContext";
import { readApiResponse } from "@/lib/client/read-api-response";
import styles from "./Accounts.module.css";
import { permissionLabel, scopeLabel } from "@/lib/accounts/labels";
export function PhotoEditor({ user, onSaved }) {
  const localize = useUiText();
  const { isArabic } = useI18n();
  const [file, setFile] = useState(null),
    [preview, setPreview] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    if (!file) {
      setPreview("");
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  async function save(remove) {
    setBusy(true);
    setError("");
    try {
      const body = new FormData();
      if (file) body.set("file", file);
      const result = await fetch(`/api/account/avatar/${user.id}`, {
        method: remove ? "DELETE" : "POST",
        ...(remove ? {} : { body }),
      }).then(readApiResponse);
      setFile(null);
      onSaved(result.user);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className={styles.photo}>
      <div>
        {preview ? (
          <img
            className={styles.photoPreview}
            src={preview}
            alt={isArabic ? "معاينة الصورة" : "Photo preview"}
          />
        ) : (
          <Avatar user={user} size={88} />
        )}
      </div>
      <label>
        {isArabic
          ? "صورة الحساب · JPG / PNG / WebP · حتى 5 MB"
          : "Account photo · JPG / PNG / WebP · up to 5 MB"}
        <input
          aria-label={isArabic ? "صورة الحساب" : "Account photo"}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          disabled={busy}
          onChange={(e) => {
            setError("");
            const f = e.target.files[0];
            if (f && f.size > 5 * 1024 * 1024) {
              setError(isArabic ? "الصورة أكبر من 5 MB" : "Image exceeds 5 MB");
              return;
            }
            setFile(f || null);
          }}
        />
      </label>
      <div className={styles.toolbar}>
        <ActionButton
          type="button"
          disabled={busy || !file}
          onClick={() => save(false)}
        >
          {isArabic ? "حفظ الصورة" : "Save photo"}
        </ActionButton>
        {file && (
          <ActionButton
            type="button"
            className="secondary"
            onClick={() => setFile(null)}
          >
            {isArabic ? "إلغاء" : localize("Cancel")}
          </ActionButton>
        )}
        {user.profile?.avatar && (
          <ActionButton
            type="button"
            className="danger"
            disabled={busy}
            onClick={() => {
              if (confirm(isArabic ? "إزالة الصورة؟" : "Remove profile photo?"))
                save(true);
            }}
          >
            {isArabic ? "إزالة الصورة" : "Remove photo"}
          </ActionButton>
        )}
      </div>
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
export default function AccountProfile({ initialUser }) {
  const localize = useUiText();
  const { user: current, updateUser } = useAccount();
  const user = current || initialUser;
  const { isArabic } = useI18n();
  const router = useRouter(),
    params = useSearchParams();
  const text = (ar, en) => (isArabic ? ar : en);
  const [draft, setDraft] = useState({ name: user.name, ...user.profile }),
    [password, setPassword] = useState({
      currentPassword: "",
      newPassword: "",
    }),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  useEffect(() => setDraft({ name: user.name, ...user.profile }), [user]);
  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const body = Object.fromEntries(
        [
          "name",
          "displayName",
          "jobTitle",
          "email",
          "phone",
          "preferredLanguage",
        ].map((k) => [k, draft[k] || ""]),
      );
      const result = await fetch("/api/account", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).then(readApiResponse);
      updateUser(result.user);
      accountSaved(result.user);
      setNotice(text("تم حفظ الملف الشخصي", "Profile saved"));
      router.refresh();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function change(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await fetch("/api/account/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(password),
      }).then(readApiResponse);
      setPassword({ currentPassword: "", newPassword: "" });
      updateUser(result.user);
      accountSaved(result.user);
      setNotice(
        text(
          "تم تغيير كلمة المرور وإلغاء الجلسات السابقة",
          "Password changed; other sessions revoked",
        ),
      );
      router.refresh();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className={styles.workspace} dir={isArabic ? "rtl" : "ltr"}>
      <PageHeader title={text("ملفي الشخصي","My Profile")} context={`${user.profile?.displayName||user.name} · ${user.roleName}`}/>
      {params.get("denied") && (
        <p role="alert" className="alert warning">
          {text(
            "ليس لديك صلاحية لهذه الصفحة",
            "You do not have permission to access that page",
          )}
        </p>
      )}
      {error && (
        <p role="alert" className="alert danger">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="alert success">
          {notice}
        </p>
      )}
      {user.profile.forcePasswordChange && (
        <p className="alert warning">
          {text(
            "يجب تغيير كلمة المرور قبل استخدام النظام",
            "Change your temporary password before using the application",
          )}
        </p>
      )}
      {!user.profile.forcePasswordChange && (
        <>
          <article className="panel">
            <PhotoEditor
              user={user}
              onSaved={(next) => {
                updateUser(next);
                accountSaved(next);
                router.refresh();
              }}
            />
            <form onSubmit={save} className={styles.form}>
              {[
                ["name", "الاسم الكامل", "Full name"],
                ["displayName", "اسم العرض", "Display name"],
                ["jobTitle", "المسمى الوظيفي", "Job title"],
                ["email", "البريد الإلكتروني", "Email"],
                ["phone", "الهاتف", "Phone"],
              ].map(([key, ar, en]) => (
                <label key={key}>
                  {text(ar, en)}
                  <input
                    aria-label={text(ar, en)}
                    type={key === "email" ? "email" : "text"}
                    required={key === "name"}
                    value={draft[key] || ""}
                    maxLength={
                      key === "jobTitle"
                        ? 120
                        : key === "email" || key === "phone"
                          ? 200
                          : 160
                    }
                    onChange={(e) =>
                      setDraft({ ...draft, [key]: e.target.value })
                    }
                  />
                </label>
              ))}
              <label>
                {text("اللغة المفضلة", "Preferred language")}
                <select
                  aria-label={text("اللغة المفضلة", "Preferred language")}
                  value={draft.preferredLanguage || ""}
                  onChange={(e) =>
                    setDraft({ ...draft, preferredLanguage: e.target.value })
                  }
                >
                  <option value="">
                    {text("استخدام اللغة الحالية", "Use current language")}
                  </option>
                  <option value="ar">{localize("العربية")}</option>
                  <option value="en">English</option>
                </select>
              </label>
              <div className={styles.toolbar}>
                <ActionButton disabled={busy}>
                  {text("حفظ الملف الشخصي", "Save profile")}
                </ActionButton>
                <ActionButton
                  type="button"
                  className="secondary"
                  onClick={() => setDraft({ name: user.name, ...user.profile })}
                >
                  {text("إلغاء", "Cancel")}
                </ActionButton>
              </div>
            </form>
          </article>
          <article className="panel">
            <h2>
              {text(
                "الوصول للحساب · للقراءة فقط",
                "Account access · read-only",
              )}
            </h2>
            <dl className={styles.details}>
              <div>
                <dt>{text("اسم المستخدم", "Username")}</dt>
                <dd>{user.username}</dd>
              </div>
              <div>
                <dt>{text("الدور", "Role")}</dt>
                <dd>{user.roleName}</dd>
              </div>
              <div>
                <dt>{text("الفروع", "Branches")}</dt>
                <dd>
                  {user.profile.allBranches
                    ? text("جميع الفروع", "All branches")
                    : user.profile.branches.join(", ")}
                </dd>
              </div>
              <div>
                <dt>{text("نطاق البيانات", "Data scope")}</dt>
                <dd>{scopeLabel(user.profile.dataScope, isArabic)}</dd>
              </div>
            </dl>
            <details>
              <summary>
                {text("الصلاحيات الفعلية", "Effective permissions")} (
                {Object.keys(user.permissions).length})
              </summary>
              <ul>
                {Object.entries(user.permissions)
                  .filter(([k]) => k.includes("."))
                  .map(([k, v]) => (
                    <li key={k}>
                      {permissionLabel(k, isArabic)} · {scopeLabel(v, isArabic)}
                    </li>
                  ))}
              </ul>
            </details>
          </article>
        </>
      )}
      <article className="panel" id="password">
        <h2>{text("تغيير كلمة المرور", "Change Password")}</h2>
        <form onSubmit={change} className={styles.form}>
          <label>
            {text("كلمة المرور الحالية", "Current password")}
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password.currentPassword}
              onChange={(e) =>
                setPassword({ ...password, currentPassword: e.target.value })
              }
            />
          </label>
          <label>
            {text("كلمة المرور الجديدة", "New password")}
            <input
              type="password"
              autoComplete="new-password"
              required
              minLength={12}
              value={password.newPassword}
              onChange={(e) =>
                setPassword({ ...password, newPassword: e.target.value })
              }
            />
            <small>
              {text(
                "12 حرفًا على الأقل؛ لا يتم عرض كلمات المرور المحفوظة",
                "At least 12 characters; stored passwords are never displayed",
              )}
            </small>
          </label>
          <ActionButton disabled={busy}>
            {text("تغيير كلمة المرور", "Change password")}
          </ActionButton>
        </form>
      </article>
    </div>
  );
}


