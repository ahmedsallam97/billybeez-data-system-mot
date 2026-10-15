"use client";
import { useUiText } from '@/app/i18n';
import AuditTable from "../ui/AuditTable";
import {EmptyState} from '../ui/DesktopLayout';
import ActionButton from "@/app/ActionButton";
import { useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "../i18n";
import { useAccount, Avatar, accountSaved } from "./AccountContext";
import { PhotoEditor } from "./AccountProfile";
import { readApiResponse } from "@/lib/client/read-api-response";
import { effectivePermissions, dependencies } from "@/lib/accounts/registry";
import { useDraftRegistration } from "../settings/SettingsDrafts";
import {
  moduleLabel,
  actionLabel,
  permissionLabel,
} from "@/lib/accounts/labels";
import styles from "./Accounts.module.css";
const SCOPE_TEXT = {
  OWN: ["سجلاتي فقط", "Own records"],
  TEAM: ["الفريق المعين", "Assigned team"],
  BRANCH: ["الفرع المعين", "Assigned branch"],
  SELECTED: ["الفروع المحددة", "Selected branches"],
  ALL: ["جميع الفروع", "All branches"],
};
export default function AccessManagement({initialTab="users",embedded=false}) {
  const localize = useUiText();
  const { isArabic } = useI18n(),
    { user: actor, updateUser } = useAccount();
  const text = (ar, en) => (isArabic ? ar : en);
  function accessError(message) {
    if (!isArabic) return message;
    const messages = {
      "You cannot deactivate yourself or remove your account-management access":
        "لم يُحفظ التغيير لأنه يزيل وصولك لإدارة الحسابات أو يعطّل حسابك الحالي. احتفظ بصلاحيات تعديل الحسابات والأدوار لنفسك.",
      "At least one active Super Admin with critical full access must remain":
        "لم يُحفظ التغيير: يجب أن يبقى مدير Super Admin نشط لديه صلاحيات إدارة الحسابات والأدوار لجميع الفروع.",
      "Super Admin role cannot be renamed":
        "اسم دور Super Admin محمي ولا يمكن تغييره.",
      "Super Admin role cannot be deactivated":
        "لا يمكن تعطيل دور Super Admin.",
      "Branch access exceeds your scope":
        "لا يمكنك منح وصول إلى فروع خارج نطاق حسابك.",
      "Username is already in use": "اسم المستخدم مستخدم بالفعل.",
      "Change your password before continuing":
        "غيّر كلمة مرور حسابك أولًا، ثم حاول مرة أخرى.",
    };
    if (messages[message]) return messages[message];
    for (const [prefix, explanation] of [
      ["Permission denied: ", "ليس لديك صلاحية"],
      ["You cannot grant ", "لا يمكنك منح صلاحية لا تملكها"],
      [
        "Scope exceeds your access: ",
        "نطاق البيانات يتجاوز وصولك لهذه الصلاحية",
      ],
    ]) {
      if (message.startsWith(prefix))
        return `${explanation}: ${permissionLabel(message.slice(prefix.length), true)}`;
    }
    return message;
  }
  const [data, setData] = useState(null),
    [tab, setTab] = useState(initialTab),
    [query, setQuery] = useState(""),
    [roleFilter, setRoleFilter] = useState(""),
    [branchFilter, setBranchFilter] = useState(""),
    [statusFilter, setStatusFilter] = useState(""),
    [draft, setDraft] = useState(null),
    [roleDraft, setRoleDraft] = useState(null),
    [original, setOriginal] = useState(""),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [photo, setPhoto] = useState(null),
    [photoPreview, setPhotoPreview] = useState(""),
    [permissionSearch, setPermissionSearch] = useState("");
  const can = (key) => Boolean(actor?.permissions?.[key]);
  const permissionEditor = useRef(null);
  const [openedModule, setOpenedModule] = useState("");
  const canEditPermissions =
    tab === "roles"
      ? can(roleDraft?.id ? "roles.edit" : "roles.create")
      : can("users.assign");
  function showPermissionEditor(module = "") {
    const target = module || data?.permissions[0]?.module || "";
    setPermissionSearch("");
    setOpenedModule(target);
    requestAnimationFrame(() => {
      const section = permissionEditor.current?.querySelector(
        `[data-permission-module="${target}"]`,
      );
      if (section) section.open = true;
    });
    permissionEditor.current?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
    permissionEditor.current?.focus({ preventScroll: true });
  }
  const grantScope = (p) =>
    p.scoped ? actor.permissions[p.key] || "BRANCH" : "ALL";
  async function load() {
    const result = await fetch("/api/access", { cache: "no-store" }).then(
      readApiResponse,
    );
    setData(result);
  }
  useEffect(() => {
    load().catch((e) => setError(accessError(e.message)));
  }, []);
  useEffect(() => {
    if (!photo) {
      setPhotoPreview("");
      return;
    }
    const url = URL.createObjectURL(photo);
    setPhotoPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);
  const scopes = data?.scopes || [];
  const scopeLabel = (value) => SCOPE_TEXT[value]?.[isArabic ? 0 : 1] || value;
  const dirty =
    JSON.stringify(tab === "roles" ? roleDraft : draft) !== original &&
    Boolean(tab === "roles" ? roleDraft : draft);
  useDraftRegistration({ label: text("المستخدمون والصلاحيات", "Users and permissions"), dirty, saving: busy && dirty, discard: () => { setDraft(null); setRoleDraft(null); setOriginal(""); setPhoto(null); setError(""); } });
  useEffect(() => {
    if (!dirty) return;
    const warn = (e) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  function switchTab(next) {
    if (
      dirty &&
      !confirm(
        text("تجاهل التغييرات غير المحفوظة؟", "Discard unsaved changes?"),
      )
    )
      return;
    setTab(next);
    setDraft(null);
    setRoleDraft(null);
    setOriginal("");
    setError("");
    setPermissionSearch("");
    setOpenedModule("");
  }
  function editUser(user) {
    if (dirty && !confirm(text("تجاهل التغييرات؟", "Discard changes?"))) return;
    const next = user
      ? {
          id: user.id,
          name: user.name,
          username: user.username,
          active: user.active,
          employeeId: user.employeeId || "",
          ...user.profile,
          temporaryPassword: "",
        }
      : {
          name: "",
          username: "",
          displayName: "",
          email: "",
          phone: "",
          jobTitle: "",
          preferredLanguage: "ar",
          employeeId: "",
          roleId:
            data.roles.find((r) => r.name === "Operation Supervisor")?.id ||
            data.roles[0]?.id,
          overrides: {},
          branches: actor.profile.branches.length
            ? [actor.profile.branches[0]]
            : [data.branches[0] || "MOT"],
          allBranches: false,
          dataScope: "BRANCH",
          teamIds: [],
          active: true,
          forcePasswordChange: true,
          temporaryPassword: "",
        };
    setDraft(next);
    setPhoto(null);
    setOriginal(JSON.stringify(next));
    setNotice("");
  }
  function editRole(role) {
    if (dirty && !confirm(text("تجاهل التغييرات؟", "Discard changes?"))) return;
    const next = role
      ? structuredClone(role)
      : { name: "", active: true, permissions: {}, defaults: {} };
    setRoleDraft(next);
    setOriginal(JSON.stringify(next));
  }
  const effective = useMemo(
    () =>
      draft
        ? effectivePermissions(
            data?.roles.find((r) => r.id === draft.roleId),
            draft,
          )
        : roleDraft?.permissions || {},
    [draft, roleDraft, data],
  );
  const warnings = dependencies(effective);
  const modules = useMemo(
    () =>
      Object.groupBy(
        (data?.permissions || []).filter((p) =>
          `${p.module} ${p.action} ${p.key} ${permissionLabel(p.key, true)} ${permissionLabel(p.key, false)}`
            .toLowerCase()
            .includes(permissionSearch.toLowerCase()),
        ),
        (p) => p.module,
      ),
    [data, permissionSearch],
  );
  function setGrant(key, value) {
    if (tab === "roles") {
      const permissions = { ...roleDraft.permissions };
      if (value === null) delete permissions[key];
      else permissions[key] = value;
      setRoleDraft({ ...roleDraft, permissions });
    } else {
      const overrides = { ...draft.overrides };
      if (value === "INHERIT") delete overrides[key];
      else overrides[key] = value;
      setDraft({ ...draft, overrides });
    }
  }
  function moduleAll(module, grant) {
    const list = (data.permissions || []).filter((p) => p.module === module);
    if (tab === "roles") {
      const permissions = { ...roleDraft.permissions };
      for (const p of list) {
        if (grant && can(p.key)) permissions[p.key] = grantScope(p);
        else delete permissions[p.key];
      }
      setRoleDraft({ ...roleDraft, permissions });
    } else {
      const overrides = { ...draft.overrides };
      for (const p of list)
        overrides[p.key] = grant ? (p.scoped ? draft.dataScope : "ALL") : null;
      setDraft({ ...draft, overrides });
    }
  }
  function bulkRole(grant, action) {
    if (!roleDraft) return;
    if (
      !confirm(
        text(
          "تأكيد تغيير الصلاحيات المحددة؟",
          "Confirm changing the selected permissions?",
        ),
      )
    )
      return;
    const permissions = { ...roleDraft.permissions };
    for (const p of data.permissions.filter(
      (p) => !action || p.action === action,
    )) {
      if (grant && can(p.key)) permissions[p.key] = grantScope(p);
      else delete permissions[p.key];
    }
    setRoleDraft({ ...roleDraft, permissions });
  }
  async function persist(body) {
    setBusy(true);
    setError("");
    setNotice("");
    let savedUser;
    try {
      const result = await fetch("/api/access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).then(readApiResponse);
      savedUser = result.user;
      if (result.user?.id === actor.id) {
        updateUser(result.user);
        accountSaved(result.user);
      }
      if (result.user && photo) {
        const form = new FormData();
        form.set("file", photo);
        await fetch(`/api/account/avatar/${result.user.id}`, {
          method: "POST",
          body: form,
        }).then(readApiResponse);
        setPhoto(null);
      }
      await load();
      setDraft(null);
      setRoleDraft(null);
      setOriginal("");
      setNotice(
        text(
          "تم الحفظ؛ الصلاحيات الجديدة تطبق على الطلب التالي",
          "Saved; new permissions apply on the next request",
        ),
      );
    } catch (e) {
      setError(accessError(e.message));
      if (savedUser && photo) {
        await load();
        const next = {
          id: savedUser.id,
          name: savedUser.name,
          username: savedUser.username,
          active: savedUser.active,
          employeeId: savedUser.employeeId || "",
          ...savedUser.profile,
          temporaryPassword: "",
        };
        setDraft(next);
        setOriginal(JSON.stringify(next));
        setPhoto(null);
        setNotice(
          text(
            "تم حفظ الحساب. يمكنك إعادة رفع الصورة من تعديل الحساب.",
            "Account saved. Retry the photo from Edit account.",
          ),
        );
      }
    } finally {
      setBusy(false);
    }
  }
  function save(e) {
    e.preventDefault();
    if (
      !confirm(
        text(
          "راجعت ملخص الصلاحيات وأريد الحفظ",
          "I reviewed the effective permission summary. Save changes?",
        ),
      )
    )
      return;
    if (tab === "roles")
      persist({ ...roleDraft, kind: "role", confirmDestructive: true });
    else persist({ ...draft, kind: "user", confirmDestructive: true });
  }
  const users = (data?.users || []).filter(
    (u) =>
      `${u.name} ${u.username} ${u.profile.displayName || ""}`
        .toLowerCase()
        .includes(query.toLowerCase()) &&
      (!roleFilter || u.profile.roleId === roleFilter) &&
      (!branchFilter ||
        u.profile.allBranches ||
        u.profile.branches.includes(branchFilter)) &&
      (!statusFilter ||
        (statusFilter === "archived"
          ? u.profile.archivedAt
          : statusFilter === "active"
            ? u.active && !u.profile.archivedAt
            : !u.active && !u.profile.archivedAt)),
  );
  function matrix() {
    return (
      <div
        className={styles.matrix}
        ref={permissionEditor}
        tabIndex={-1}
        data-permission-editor
      >
        <p className={styles.help}>
          {text(
            "اختر القسم، ثم فعّل أو أوقف الإجراء المطلوب. النطاق يحدد السجلات التي يستطيع الحساب الوصول إليها. التغييرات لا تُطبق إلا بعد الحفظ.",
            "Open a module, then allow or deny its actions. Scope determines which records the account can access. Changes apply only after saving.",
          )}
        </p>
        {!canEditPermissions && (
          <p role="status" className="alert warning">
            {text(
              "هذه الصلاحيات للقراءة فقط: حسابك لا يملك صلاحية تعديلها. اطلب التعديل من مسؤول لديه صلاحية إدارة الحسابات أو الأدوار.",
              "Read-only: your account cannot change these permissions. Ask an authorized account or role administrator.",
            )}
          </p>
        )}
        <label>
          {text("بحث عن وحدة أو صلاحية", "Search modules or permissions")}
          <input
            aria-label={text(
              "بحث عن وحدة أو صلاحية",
              "Search modules or permissions",
            )}
            value={permissionSearch}
            onChange={(e) => setPermissionSearch(e.target.value)}
          />
        </label>
        {Object.entries(modules).length === 0 && (
          <p>
            {text("لا توجد صلاحيات تطابق البحث", "No matching permissions")}
          </p>
        )}
        <fieldset
          className={styles.permissionFields}
          disabled={!canEditPermissions || busy}
        >
          {Object.entries(modules).map(([module, items]) => (
            <details
              className={styles.module}
              data-permission-module={module}
              key={`${tab}-${draft?.id || roleDraft?.id || "new"}-${module}-${openedModule}-${Boolean(permissionSearch)}`}
              open={Boolean(permissionSearch) || openedModule === module}
            >
              <summary>
                {moduleLabel(module, isArabic)} ·{" "}
                {items.filter((p) => effective[p.key]).length}/{items.length}{" "}
                {text("مسموح", "allowed")}
              </summary>
              <div className={styles.toolbar}>
                <ActionButton type="button" onClick={() => moduleAll(module, true)}>
                  {text("منح الوحدة كاملة", "Grant module")}
                </ActionButton>
                <ActionButton
                  type="button"
                  className="secondary"
                  onClick={() => {
                    if (
                      confirm(
                        text(
                          "إلغاء صلاحيات الوحدة؟",
                          "Revoke module permissions?",
                        ),
                      )
                    )
                      moduleAll(module, false);
                  }}
                >
                  {text("إلغاء الوحدة", "Revoke module")}
                </ActionButton>
              </div>
              <div className={styles.grants}>
                {items.map((p) => {
                  const inherited = data.roles.find(
                    (r) => r.id === draft?.roleId,
                  )?.permissions[p.key];
                  const override = draft?.overrides?.[p.key];
                  const ownsOverride =
                    draft && Object.hasOwn(draft.overrides, p.key);
                  return (
                    <div key={p.key} className={styles.grant}>
                      <label>
                        <input
                          type="checkbox"
                          aria-label={permissionLabel(p.key, isArabic)}
                          checked={Boolean(effective[p.key])}
                          onChange={(e) =>
                            setGrant(
                              p.key,
                              e.target.checked
                                ? p.scoped
                                  ? draft?.dataScope || "BRANCH"
                                  : "ALL"
                                : null,
                            )
                          }
                        />
                        <span>{actionLabel(p.action, isArabic)}</span>
                      </label>
                      {tab === "roles" && p.scoped ? (
                        <select
                          aria-label={`${permissionLabel(p.key, isArabic)} — ${text("نطاق البيانات", "Data scope")}`}
                          disabled={!effective[p.key]}
                          value={effective[p.key] || "ALL"}
                          onChange={(e) => setGrant(p.key, e.target.value)}
                        >
                          {(p.scoped ? scopes : ["ALL"]).map((s) => (
                            <option key={s} value={s}>
                              {scopeLabel(s)}
                            </option>
                          ))}
                        </select>
                      ) : tab === "roles" ? (
                        <small>
                          {effective[p.key]
                            ? text("مسموح", "Allowed")
                            : text("غير مسموح", "Denied")}
                        </small>
                      ) : (
                        <>
                          <small>
                            {ownsOverride
                              ? override === null
                                ? text("مرفوض للحساب", "Account denial")
                                : text("مضاف للحساب", "Account override")
                              : inherited
                                ? text("موروث من الدور", "Inherited from role")
                                : text("غير ممنوح", "Not granted")}
                          </small>
                          <select
                            aria-label={`${permissionLabel(p.key, isArabic)} — ${text("مصدر الصلاحية", "Permission source")}`}
                            value={
                              ownsOverride
                                ? override === null
                                  ? "DENY"
                                  : override
                                : "INHERIT"
                            }
                            onChange={(e) =>
                              setGrant(
                                p.key,
                                e.target.value === "DENY"
                                  ? null
                                  : e.target.value,
                              )
                            }
                          >
                            <option value="INHERIT">
                              {text(
                                "استخدام صلاحية الدور",
                                "Use role permission",
                              )}
                            </option>
                            <option value="DENY">
                              {text("منع لهذا الحساب", "Deny for this account")}
                            </option>
                            {(p.scoped ? scopes : ["ALL"]).map((s) => (
                              <option key={s} value={s}>
                                {p.scoped
                                  ? scopeLabel(s)
                                  : text(
                                      "سماح إضافي لهذا الحساب",
                                      "Allow for this account",
                                    )}
                              </option>
                            ))}
                          </select>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </details>
          ))}
        </fieldset>
      </div>
    );
  }
  const summary = (
    <section className={styles.summary}>
      <h3>
        {text(
          "ملخص الصلاحيات الفعلية قبل الحفظ",
          "Effective permissions before saving",
        )}{" "}
        · {Object.keys(effective).filter((k) => k.includes(".")).length}
      </h3>
      <p className={styles.help}>
        {text(
          "هذا ملخص للقراءة فقط. استخدم زر تعديل الصلاحيات لتغيير الاختيارات، ثم احفظ من نهاية النموذج.",
          "This is a read-only summary. Use Edit permissions to change the selections, then save at the end of the form.",
        )}
      </p>
      {canEditPermissions && (
        <ActionButton
          type="button"
          className="secondary"
          onClick={() => showPermissionEditor()}
        >
          {text("تعديل الصلاحيات", "Edit permissions")}
        </ActionButton>
      )}
      {draft && (
        <p>
          {draft.allBranches
            ? text("جميع الفروع", "All branches")
            : draft.branches.join(", ")}{" "}
          · {scopeLabel(draft.dataScope)} · {draft.teamIds.length}{" "}
          {text("موظفون معينون", "assigned employees")}
        </p>
      )}
      {warnings.length > 0 && (
        <div role="alert" className="alert warning">
          {warnings.map((w) => (
            <p key={w}>
              {(() => {
                const [key, required] = w.split(" also requires ");
                return text(
                  `${permissionLabel(key, true)} يحتاج أيضًا إلى ${permissionLabel(required, true)}`,
                  `${permissionLabel(key, false)} also requires ${permissionLabel(required, false)}`,
                );
              })()}
            </p>
          ))}
        </div>
      )}
      <details>
        <summary>
          {text(
            "عرض الصلاحيات المسموحة والمرفوضة",
            "Show allowed and denied permissions",
          )}
        </summary>
        <div className={styles.summaryModules}>
          {Object.entries(
            Object.groupBy(data?.permissions || [], (p) => p.module),
          ).map(([module, items]) => (
            <section key={module} className={styles.summaryModule}>
              <div className={styles.toolbar}>
                <h4>{moduleLabel(module, isArabic)}</h4>
                {canEditPermissions && (
                  <ActionButton
                    type="button"
                    className="secondary"
                    onClick={() => showPermissionEditor(module)}
                  >
                    {text("تعديل", "Edit")}
                  </ActionButton>
                )}
              </div>
              <ul>
                {items.map((p) => (
                  <li key={p.key} data-allowed={Boolean(effective[p.key])}>
                    <strong>{actionLabel(p.action, isArabic)}</strong>
                    <span>
                      {effective[p.key]
                        ? text("مسموح", "Allowed")
                        : text("غير مسموح", "Denied")}
                      {effective[p.key] && p.scoped
                        ? ` · ${scopeLabel(effective[p.key])}`
                        : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </details>
    </section>
  );
  return (
    <div className={styles.workspace} dir={isArabic ? "rtl" : "ltr"}>
      {!embedded&&<header><h2>{text("المستخدمون وإدارة الوصول","Users & Access Management")}</h2></header>}
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
      {!embedded&&<div
        role="tablist"
        aria-label={text("إدارة الحسابات", "Account management")}
        className={styles.tabs}
      >
        {[
          ["users", "المستخدمون", "Users", "users.view"],
          ["roles", "الأدوار والصلاحيات", "Roles & Permissions", "roles.view"],
          [
            "activity",
            "سجل نشاط الحسابات",
            "Account activity",
            "users.activity",
          ],
        ]
          .filter(([, , , p]) => can(p))
          .map(([key, ar, en]) => (
            <ActionButton
              role="tab"
              aria-selected={tab === key}
              key={key}
              onClick={() => switchTab(key)}
            >
              {text(ar, en)}
            </ActionButton>
          ))}
      </div>}
      {!data && <p>{text("جار التحميل", "Loading…")}</p>}
      {data && tab === "users" && (
        <>
          <div className={styles.filters}>
            <label>
              {text("البحث بالاسم أو اسم المستخدم", "Search name or username")}
              <input value={query} onChange={(e) => setQuery(e.target.value)} />
            </label>
            <label>
              {text("الدور", "Role")}
              <select
                aria-label={text("الدور", "Role")}
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
              >
                <option value="">{text("كل الأدوار", "All roles")}</option>
                {data.roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {text("الفرع", "Branch")}
              <select
                aria-label={text("الفرع", "Branch")}
                value={branchFilter}
                onChange={(e) => setBranchFilter(e.target.value)}
              >
                <option value="">{text("كل الفروع", "All branches")}</option>
                {data.branches.map((b) => (
                  <option key={b}>{b}</option>
                ))}
              </select>
            </label>
            <label>
              {text("الحالة", "Status")}
              <select
                aria-label={text("الحالة", "Status")}
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="">{text("كل الحالات", "All statuses")}</option>
                <option value="active">{localize("Active")}</option>
                <option value="inactive">{localize("Inactive")}</option>
                <option value="archived">{localize("Archived")}</option>
              </select>
            </label>
          </div>
          {can("users.create") && (
            <div>
              <ActionButton onClick={() => editUser(null)}>
                {text("إنشاء حساب", "Create Account")}
              </ActionButton>
            </div>
          )}
          <div className={styles.table}>
            <table>
              <thead>
                <tr>
                  {[
                    ["الاسم / اسم المستخدم", "Name / Username"],
                    ["المسمى الوظيفي", "Job title"],
                    ["الدور", "Role"],
                    ["الفروع", "Branches"],
                    ["الحالة", "Status"],
                    ["آخر تسجيل دخول", "Last login"],
                    ["الإجراءات", "Actions"],
                  ].map(([ar, en]) => (
                    <th key={en}>{text(ar, en)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <div className={styles.identity}>
                        <Avatar user={u} />
                        <span>
                          <strong>{u.profile.displayName || u.name}</strong>
                          <br />
                          {u.username}
                        </span>
                      </div>
                    </td>
                    <td>{u.profile.jobTitle || "—"}</td>
                    <td>{u.roleName}</td>
                    <td>
                      {u.profile.allBranches
                        ? text("الكل", "All")
                        : u.profile.branches.join(", ")}
                    </td>
                    <td>
                      <span className={styles.status} data-inactive={!u.active}>
                        {u.profile.archivedAt
                          ? text("مؤرشف", "Archived")
                          : u.active
                            ? text("نشط", "Active")
                            : text("غير نشط", "Inactive")}
                      </span>
                    </td>
                    <td>
                      {u.profile.lastLogin
                        ? new Date(u.profile.lastLogin).toLocaleString(
                            isArabic ? "ar-EG" : "en-GB",
                          )
                        : "—"}
                    </td>
                    <td>
                      <div className={styles.actions}>
                        {can("users.edit") && (
                          <ActionButton onClick={() => editUser(u)}>
                            {text("تعديل", "Edit")}
                          </ActionButton>
                        )}
                        {can("users.revokeSessions") && (
                          <ActionButton
                            className="secondary"
                            disabled={busy}
                            onClick={() => {
                              if (
                                confirm(
                                  text(
                                    "إلغاء جميع جلسات الحساب؟",
                                    "Revoke all account sessions?",
                                  ),
                                )
                              )
                                persist({ kind: "revoke", id: u.id });
                            }}
                          >
                            {text("إلغاء الجلسات", "Revoke sessions")}
                          </ActionButton>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {draft && (
            <form className={styles.section} onSubmit={save}>
              <h3>
                {draft.id
                  ? text("تعديل الحساب", "Edit account")
                  : text("إنشاء حساب", "Create Account")}
              </h3>
              {draft.id ? (
                <PhotoEditor
                  user={data.users.find((u) => u.id === draft.id)}
                  onSaved={async (next) => {
                    if (next.id === actor.id) {
                      updateUser(next);
                      accountSaved(next);
                    }
                    await load();
                  }}
                />
              ) : (
                <label>
                  {text("صورة الحساب", "Account photo")}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={(e) => setPhoto(e.target.files[0] || null)}
                  />
                  {photoPreview && (
                    <img
                      className={styles.photoPreview}
                      src={photoPreview}
                      alt="Photo preview"
                    />
                  )}
                </label>
              )}
              <div className={styles.form}>
                {[
                  ["name", "الاسم الكامل", "Full name"],
                  ["displayName", "اسم العرض", "Display name"],
                  ["username", "اسم المستخدم", "Username"],
                  ["jobTitle", "المسمى الوظيفي", "Job title"],
                  ["email", "البريد الإلكتروني", "Email"],
                  ["phone", "الهاتف", "Phone"],
                ].map(([key, ar, en]) => (
                  <label key={key}>
                    {text(ar, en)}
                    <input
                      aria-label={text(ar, en)}
                      type={key === "email" ? "email" : "text"}
                      required={["name", "username"].includes(key)}
                      value={draft[key] || ""}
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
                    <option value="">—</option>
                    <option value="ar">{localize("العربية")}</option>
                    <option value="en">English</option>
                  </select>
                </label>
                <label>
                  {text("ربط موظف موجود", "Link existing employee")}
                  <select
                    aria-label={text(
                      "ربط موظف موجود",
                      "Link existing employee",
                    )}
                    value={draft.employeeId || ""}
                    onChange={(e) =>
                      setDraft({ ...draft, employeeId: e.target.value })
                    }
                  >
                    <option value="">
                      {text("حساب عام", "General account")}
                    </option>
                    {data.employees.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.name} · {e.id}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  {text("الدور / قالب الصلاحيات", "Role / permission template")}
                  <select
                    aria-label={text(
                      "الدور / قالب الصلاحيات",
                      "Role / permission template",
                    )}
                    value={draft.roleId || ""}
                    disabled={!can("users.assign")}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        roleId: e.target.value,
                        overrides: {},
                      })
                    }
                  >
                    {data.roles
                      .filter((r) => r.active || r.id === draft.roleId)
                      .map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                        </option>
                      ))}
                  </select>
                </label>
                <label>
                  {text("نطاق البيانات", "Data scope")}
                  <select
                    aria-label={text("نطاق البيانات", "Data scope")}
                    value={draft.dataScope}
                    disabled={!can("users.assign")}
                    onChange={(e) =>
                      setDraft({ ...draft, dataScope: e.target.value })
                    }
                  >
                    {scopes.map((s) => (
                      <option key={s} value={s}>
                        {scopeLabel(s)}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  {text("كلمة مرور مؤقتة جديدة", "New temporary password")}
                  <input
                    type="password"
                    autoComplete="new-password"
                    minLength={12}
                    required={!draft.id}
                    disabled={draft.id && !can("users.resetPassword")}
                    value={draft.temporaryPassword || ""}
                    onChange={(e) =>
                      setDraft({ ...draft, temporaryPassword: e.target.value })
                    }
                  />
                </label>
              </div>
              <div className={styles.grants}>
                <label>
                  <input
                    type="checkbox"
                    checked={draft.active}
                    onChange={(e) =>
                      setDraft({ ...draft, active: e.target.checked })
                    }
                  />
                  {text("حساب نشط", "Active account")}
                </label>
                <label>
                  <input
                    type="checkbox"
                    disabled={!can("users.resetPassword")}
                    checked={draft.forcePasswordChange}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        forcePasswordChange: e.target.checked,
                      })
                    }
                  />
                  {text(
                    "تغيير كلمة المرور عند تسجيل الدخول",
                    "Require password change at login",
                  )}
                </label>
                <label>
                  <input
                    type="checkbox"
                    disabled={!can("users.assign")}
                    checked={draft.allBranches}
                    onChange={(e) =>
                      setDraft({ ...draft, allBranches: e.target.checked })
                    }
                  />
                  {text("الوصول لجميع الفروع", "All-branch access")}
                </label>
              </div>
              <fieldset disabled={!can("users.assign")}>
                <legend>{text("الفروع المعينة", "Assigned branches")}</legend>
                <div className={styles.grants}>
                  {data.branches.map((b) => (
                    <label key={b}>
                      <input
                        type="checkbox"
                        checked={draft.branches.includes(b)}
                        onChange={(e) =>
                          setDraft({
                            ...draft,
                            branches: e.target.checked
                              ? [...draft.branches, b]
                              : draft.branches.filter((v) => v !== b),
                          })
                        }
                      />
                      {b}
                    </label>
                  ))}
                </div>
              </fieldset>
              {draft.dataScope === "TEAM" && (
                <label>
                  {text("الموظفون المعينون للفريق", "Assigned team employees")}
                  <select
                    aria-label={text(
                      "الموظفون المعينون للفريق",
                      "Assigned team employees",
                    )}
                    multiple
                    size={6}
                    value={draft.teamIds}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        teamIds: [...e.target.selectedOptions].map(
                          (o) => o.value,
                        ),
                      })
                    }
                  >
                    {data.employees.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <section className={styles.permissionSection}>
                <h3>
                  {text(
                    "تعديلات صلاحيات الحساب الفردية",
                    "Individual account permission overrides",
                  )}
                </h3>
                <p className={styles.help}>
                  {text(
                    "الدور يحدد الصلاحيات الأساسية. التعديل هنا يخص هذا الحساب فقط، ولا يغير صلاحيات بقية الحسابات التي تستخدم نفس الدور.",
                    "The role supplies the default permissions. Changes here affect this account only, not other accounts using that role.",
                  )}
                </p>
                {draft.id === actor.id && (
                  <p className="alert warning">
                    {text(
                      "أنت تعدل حسابك الحالي. يمكنك تعديل الصلاحيات، لكن لا يمكنك إزالة وصولك لإدارة الحسابات أو ترك النظام بدون مدير كامل الصلاحيات.",
                      "You are editing your current account. You can change permissions, but cannot remove your account-management access or leave the system without a full-access administrator.",
                    )}
                  </p>
                )}
                {can("users.assign") && (
                  <>
                    <ActionButton
                      type="button"
                      className="secondary"
                      onClick={() => {
                        if (
                          confirm(
                            text(
                              "إعادة الحساب لصلاحيات الدور؟",
                              "Reset account to role defaults?",
                            ),
                          )
                        )
                          setDraft({
                            ...draft,
                            overrides: {},
                            resetToDefaults: true,
                          });
                      }}
                    >
                      {text("إعادة لصلاحيات الدور", "Reset to role defaults")}
                    </ActionButton>
                  </>
                )}
                {matrix()}
              </section>
              {summary}
              <div className={styles.toolbar}>
                <ActionButton disabled={busy}>
                  {text("مراجعة وحفظ الحساب", "Review and save account")}
                </ActionButton>
                <ActionButton
                  type="button"
                  className="secondary"
                  onClick={() => {
                    setDraft(null);
                    setOriginal("");
                  }}
                >
                  {text("إلغاء", "Cancel")}
                </ActionButton>
                {draft.id && can("users.archive") && (
                  <ActionButton
                    type="button"
                    className="danger"
                    disabled={busy}
                    onClick={() => {
                      if (
                        confirm(
                          text(
                            "أرشفة الحساب مع الاحتفاظ بسجلاته؟",
                            "Archive this account and preserve its historical records?",
                          ),
                        )
                      )
                        persist({ ...draft, kind: "user", archive: true });
                    }}
                  >
                    {text("أرشفة الحساب", "Archive account")}
                  </ActionButton>
                )}
                {draft.archivedAt && can("users.restore") && (
                  <ActionButton
                    type="button"
                    className="secondary"
                    onClick={() =>
                      persist({
                        ...draft,
                        kind: "user",
                        restore: true,
                        active: true,
                      })
                    }
                  >
                    {text("استعادة الحساب", "Restore account")}
                  </ActionButton>
                )}
              </div>
            </form>
          )}
        </>
      )}
      {data && tab === "roles" && (
        <>
          <div className={styles.toolbar}>
            <label>
              {text("اختر الدور", "Select role")}
              <select
                aria-label={localize("Select role")}
                value={roleDraft?.id || ""}
                onChange={(e) =>
                  editRole(data.roles.find((r) => r.id === e.target.value))
                }
              >
                <option value="">{text("اختر الدور", "Select role")}</option>
                {data.roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                    {r.active ? "" : " · inactive"}
                  </option>
                ))}
              </select>
            </label>
            {can("roles.create") && (
              <ActionButton onClick={() => editRole(null)}>
                {text("إنشاء دور", "Create role")}
              </ActionButton>
            )}
            {roleDraft && can("roles.create") && (
              <ActionButton
                className="secondary"
                onClick={() => {
                  const next = {
                    ...structuredClone(roleDraft),
                    id: undefined,
                    name: roleDraft.name + " copy",
                    protected: false,
                  };
                  setRoleDraft(next);
                  setOriginal("");
                }}
              >
                {text("نسخ الدور", "Duplicate role")}
              </ActionButton>
            )}
          </div>
          {!roleDraft&&<EmptyState title={text("اختر الدور لمراجعة صلاحياته","Choose a role to review its permissions")}><p>{text("اختر من القائمة، أو أنشئ دورًا جديدًا. التعديلات تطبّق على الحسابات التي تستخدم الدور.","Select a role above, or create a new one. Changes apply to accounts using that role.")}</p></EmptyState>}
          {roleDraft && (
            <form onSubmit={save} className={styles.section}>
              <p className={styles.help}>
                {text(
                  "التعديل هنا يطبق على كل الحسابات التي تستخدم هذا الدور. لتغيير حساب واحد فقط، استخدم تبويب المستخدمين ثم تعديل الحساب.",
                  "Changes here affect every account using this role. To change one account only, open Users and edit that account.",
                )}
              </p>
              {roleDraft.protected && (
                <p className="alert warning">
                  {text(
                    "اسم Super Admin وحالته محميان. يمكن تعديل صلاحياته مع الحفاظ على مدير نشط واحد على الأقل لديه صلاحيات إدارة الحسابات والأدوار لجميع الفروع.",
                    "The Super Admin name and active status are protected. Its permissions can be edited while preserving at least one active administrator with account and role management across all branches.",
                  )}
                </p>
              )}
              <div className={styles.form}>
                <label>
                  {text("اسم الدور", "Role name")}
                  <input
                    aria-label={localize("Role name")}
                    required
                    value={roleDraft.name}
                    readOnly={roleDraft.protected}
                    onChange={(e) =>
                      setRoleDraft({ ...roleDraft, name: e.target.value })
                    }
                  />
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={roleDraft.active}
                    disabled={roleDraft.protected}
                    onChange={(e) =>
                      setRoleDraft({ ...roleDraft, active: e.target.checked })
                    }
                  />
                  {text("دور نشط", "Active role")}
                </label>
                <label>
                  {text("نسخ صلاحيات دور آخر", "Copy permissions from role")}
                  <select
                    aria-label={text(
                      "نسخ صلاحيات دور آخر",
                      "Copy permissions from role",
                    )}
                    value=""
                    onChange={(e) => {
                      const role = data.roles.find(
                        (r) => r.id === e.target.value,
                      );
                      if (
                        role &&
                        confirm(
                          text(
                            "استبدال صلاحيات المسودة؟",
                            "Replace draft permissions?",
                          ),
                        )
                      )
                        setRoleDraft({
                          ...roleDraft,
                          permissions: { ...role.permissions },
                        });
                    }}
                  >
                    <option value="">—</option>
                    {data.roles.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className={styles.toolbar}>
                <ActionButton type="button" onClick={() => bulkRole(true)}>
                  {text("منح الكل", "Grant all")}
                </ActionButton>
                <ActionButton
                  type="button"
                  className="danger"
                  onClick={() => bulkRole(false)}
                >
                  {text("إلغاء الكل", "Revoke all")}
                </ActionButton>
                <ActionButton
                  type="button"
                  className="secondary"
                  onClick={() => {
                    if (
                      confirm(
                        text(
                          "استعادة صلاحيات الدور الأولية؟",
                          "Reset role to initial defaults?",
                        ),
                      )
                    )
                      setRoleDraft({
                        ...roleDraft,
                        permissions: { ...roleDraft.defaults },
                        resetToDefaults: true,
                      });
                  }}
                >
                  {text("استعادة الافتراضي", "Reset defaults")}
                </ActionButton>
                <label>
                  {text("منح عمود إجراء", "Grant action column")}
                  <select
                    aria-label={text("منح عمود إجراء", "Grant action column")}
                    value=""
                    onChange={(e) => {
                      if (e.target.value) bulkRole(true, e.target.value);
                    }}
                  >
                    <option value="">—</option>
                    {[...new Set(data.permissions.map((p) => p.action))].map(
                      (a) => (
                        <option key={a} value={a}>
                          {actionLabel(a, isArabic)}
                        </option>
                      ),
                    )}
                  </select>
                </label>
              </div>
              {matrix()}
              {summary}
              <div className={styles.toolbar}>
                <ActionButton
                  disabled={
                    busy ||
                    !(roleDraft.id ? can("roles.edit") : can("roles.create"))
                  }
                >
                  {text("مراجعة وحفظ الدور", "Review and save role")}
                </ActionButton>
                <ActionButton
                  type="button"
                  className="secondary"
                  onClick={() => {
                    setRoleDraft(null);
                    setOriginal("");
                  }}
                >
                  {text("إلغاء", "Cancel")}
                </ActionButton>
              </div>
            </form>
          )}
        </>
      )}
      {data && tab === "activity" && <AuditTable entries={data.logs} people={data.employees} resources={data.users}/> }
    </div>
  );
}


