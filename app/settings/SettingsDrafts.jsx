"use client";

import { useUiText } from '@/app/i18n';
import { createContext, useCallback, useContext, useEffect, useId, useRef, useState } from "react";
import ActionButton, { ActionScope } from "../ActionButton";
import { useI18n } from "../i18n";
import styles from "./SettingsDrafts.module.css";
import { settingsHistoryGuard } from "@/lib/client/settings-history-guard";

const DraftsContext = createContext(null);
const snapshot = value => JSON.stringify(value);
const copy = value => structuredClone(value);

export function SettingsDraftBoundary({ children }) {
  return useContext(DraftsContext) ? children : <SettingsDraftProvider>{children}</SettingsDraftProvider>;
}

export function SettingsDraftProvider({ children }) {
  const { isArabic } = useI18n();
  const entries = useRef(new Map());
  const [groups, setGroups] = useState([]);
  const [pending, setPending] = useState(null);
  const dialog = useRef(null);
  const update = useCallback((id, entry) => {
    if (entry) entries.current.set(id, entry); else entries.current.delete(id);
    setGroups([...entries.current.values()].filter(item => item.dirty || item.saving));
  }, []);
  const requestNavigation = useCallback((action, { exclude = [], only } = {}) => {
    const affected = [...entries.current.entries()].filter(([id, item]) =>
      (item.dirty || item.saving) && !exclude.includes(id) && (!only || only.includes(id)));
    if (!affected.length) { action(); return; }
    setPending({ action, affected, focus: document.activeElement });
  }, []);

  useEffect(() => {
    const warn = event => {
      if (![...entries.current.values()].some(item => item.dirty || item.saving)) return;
      event.preventDefault(); event.returnValue = "";
    };
    let bypass = false;
    const link = event => {
      if (bypass || event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      const anchor = event.target.closest?.("a[href]");
      if (!anchor || anchor.hasAttribute("download") || anchor.target && anchor.target !== "_self") return;
      const url = new URL(anchor.href, window.location.href);
      if (url.href === window.location.href || url.pathname === location.pathname && url.search === location.search && url.hash) return;
      const exclude = (anchor.dataset.settingsPersist || '').split(' ').filter(Boolean);
      if (![...entries.current.entries()].some(([id,item]) => !exclude.includes(id) && (item.dirty || item.saving))) return;
      event.preventDefault(); event.stopPropagation();
      requestNavigation(() => { bypass = true; anchor.click(); bypass = false; }, { exclude });
    };
    window.addEventListener("beforeunload", warn);
    document.addEventListener("click", link, true);
    return () => { window.removeEventListener("beforeunload", warn); document.removeEventListener("click", link, true); };
  }, [requestNavigation]);

  // Mark history entries without adding any, so cancelling Back/Forward restores
  // the current destination before Next's router receives the popstate event.
  useEffect(() => {
    const key = "__settingsDraftIndex";
    const originalPush = history.pushState, originalReplace = history.replaceState;
    // Next may use its own saved pushState function. The browser's entry index
    // remains authoritative even when that bypasses our fallback state marker.
    const browserIndex = () => {
      const value = window.navigation?.currentEntry?.index;
      return Number.isInteger(value) && value >= 0 ? value : null;
    };
    let index = browserIndex() ?? Number(history.state?.[key] || 0), restoring = false, allowed = false;
    const push = function (state, ...args) { const next = index + 1; const result = originalPush.call(this, { ...state, [key]: next }, ...args); index = browserIndex() ?? next; return result; };
    const replace = function (state, ...args) { return originalReplace.call(this, { ...state, [key]: index }, ...args); };
    originalReplace.call(history, { ...history.state, [key]: index }, "");
    history.pushState = push; history.replaceState = replace;
    const pop = event => {
      if (restoring) { restoring = false; event.stopImmediatePropagation(); return; }
      const marker = Number.isFinite(event.state?.[key]) && event.state[key] !== index ? event.state[key] : index - 1;
      const next = browserIndex() ?? marker;
      if (allowed || ![...entries.current.values()].some(item => item.dirty || item.saving)) { allowed = false; index = next; return; }
      event.stopImmediatePropagation();
      const delta = next - index;
      if (!delta) return;
      restoring = true; history.go(-delta);
      requestNavigation(() => { allowed = true; history.go(delta); });
    };
    const guard = settingsHistoryGuard();
    guard.active = pop;
    return () => {
      if (guard.active === pop) guard.active = null;
      if (history.pushState === push) history.pushState = originalPush;
      if (history.replaceState === replace) history.replaceState = originalReplace;
    };
  }, [requestNavigation]);

  useEffect(() => {
    if (!pending) return;
    dialog.current?.showModal();
    dialog.current?.querySelector("button")?.focus();
  }, [pending]);
  const stay = () => { const focus = pending?.focus; dialog.current?.close(); setPending(null); focus?.focus?.({ preventScroll: true }); };
  const saving = groups.some(item => item.saving);
  const discard = () => {
    if (saving) return;
    for (const [id, entry] of pending.affected) { entry.discard?.(); entries.current.delete(id); }
    setGroups([...entries.current.values()].filter(item => item.dirty || item.saving));
    const action = pending.action; dialog.current?.close(); setPending(null); action();
  };
  return <DraftsContext.Provider value={{ update, requestNavigation }}>
    {groups.length > 0 && <aside className={styles.summary} dir={isArabic ? "rtl" : "ltr"} data-settings-drafts role="status"><strong>{saving ? (isArabic ? "جارٍ حفظ الإعدادات…" : "Saving settings…") : (isArabic ? "تغييرات غير محفوظة" : "Unsaved changes")}</strong><span>{[...new Set(groups.map(item => item.label))].join(" · ")}</span><small>{isArabic ? "احفظ من مجموعة الإعدادات التي عدّلتها." : "Save from the settings group you edited."}</small></aside>}
    {children}
    {pending && <dialog ref={dialog} className={styles.dialog} dir={isArabic ? "rtl" : "ltr"} aria-labelledby="settings-leave-title" onCancel={event => { event.preventDefault(); stay(); }}>
      <h2 id="settings-leave-title">{isArabic ? "فيه تغييرات لم تُحفظ" : "You have unsaved changes"}</h2>
      <p>{isArabic ? "الاستمرار سيُلغي تعديلاتك في المجموعات التالية:" : "Continuing will discard your edits in these groups:"}</p>
      <ul>{[...new Set(pending.affected.map(([, item]) => item.label))].map(label => <li key={label}>{label}</li>)}</ul>
      {saving && <p role="status">{isArabic ? "انتظر انتهاء الحفظ قبل المغادرة." : "Wait for saving to finish before leaving."}</p>}
      <footer><ActionButton type="button" iconOnly={false} onClick={stay}>{isArabic ? "الرجوع للتعديل" : "Keep editing"}</ActionButton><ActionButton type="button" iconOnly={false} className="secondary" disabled={saving} onClick={discard}>{isArabic ? "تجاهل التغييرات والاستمرار" : "Discard changes and continue"}</ActionButton></footer>
    </dialog>}
  </DraftsContext.Provider>;
}

export function useSettingsNavigation() {
  const context = useContext(DraftsContext);
  return context?.requestNavigation || (action => action());
}

export function useDraftRegistration({ id, label, dirty, saving = false, discard }) {
  const context = useContext(DraftsContext);
  const generated = useId();
  const key = id || generated;
  const discardRef = useRef(discard); discardRef.current = discard;
  useEffect(() => {
    context?.update(key, { label, dirty, saving, discard: () => discardRef.current?.() });
  }, [context?.update, key, label, dirty, saving]);
  useEffect(() => () => context?.update(key, null), [context?.update, key]);
}

export function useSettingDraft(initialValue, label) {
  const [value, setValue] = useState(() => copy(initialValue));
  const [baseline, setBaseline] = useState(() => copy(initialValue));
  const [state, setState] = useState("clean");
  const [error, setError] = useState("");
  const [resetRevision, setResetRevision] = useState(0);
  const initial = snapshot(initialValue);
  const source = useRef(initial);
  const current = useRef(value); current.current = value;
  const baselineRef = useRef(baseline); baselineRef.current = baseline;
  useEffect(() => {
    if (source.current === initial) return;
    source.current = initial;
    // Refreshing another group must never overwrite this group's local edits.
    if (snapshot(current.current) === snapshot(baselineRef.current)) {
      const next = JSON.parse(initial); setValue(next); setBaseline(copy(next));
    }
  }, [initial]);
  const dirty = snapshot(value) !== snapshot(baseline);
  const reset = () => { setValue(copy(baseline)); setState("clean"); setError(""); setResetRevision(revision => revision + 1); };
  useDraftRegistration({ label, dirty, saving: state === "saving", discard: reset });
  const change = next => { setValue(next); setState(currentState => currentState === "saving" ? currentState : "clean"); setError(""); };
  const save = async action => {
    const submitted = copy(current.current); setState("saving"); setError("");
    try {
      if (await action() === false) throw new Error("save failed");
      setBaseline(submitted); setState("saved"); return true;
    } catch (failure) {
      setState("error"); setError(failure.message === "save failed" ? "" : failure.message); return false;
    }
  };
  return [value, change, { dirty, state, error, resetRevision, reset, save }];
}

export function DraftStatus({ draft, label }) {
  const { isArabic } = useI18n();
  const state = draft.state === "saving" || draft.state === "error" ? draft.state : draft.dirty ? "dirty" : draft.state;
  const labels = { clean: ["محدثة", "Up to date"], dirty: ["تغييرات غير محفوظة", "Unsaved changes"], saving: ["جارٍ الحفظ…", "Saving…"], saved: ["تم الحفظ", "Saved"], error: ["لم يتم الحفظ. تعديلاتك موجودة؛ أعد المحاولة.", "Not saved. Your edits are kept; try again."] };
  return <div className={styles.status} data-setting-status={state} role={state === "error" ? "alert" : "status"}><span aria-hidden="true">{state === "saved" || state === "clean" ? "✓" : state === "error" ? "!" : "●"}</span><span>{label && <b>{label} · </b>}{labels[state][isArabic ? 0 : 1]}{draft.error && ` ${draft.error}`}</span>{draft.dirty && state !== "saving" && <ActionButton type="button" icon="refresh" className="secondary" aria-label={isArabic ? `إلغاء تغييرات ${label}` : `Revert ${label} changes`} onClick={draft.reset}>{isArabic ? `إلغاء تغييرات ${label}` : `Revert ${label} changes`}</ActionButton>}</div>;
}

function formSnapshot(form) {
  return snapshot([...form.elements].filter(el => el.name && !["submit", "button"].includes(el.type)).map(el => [el.name, el.type === "checkbox" || el.type === "radio" ? el.checked : el.value]));
}

export function DraftForm({ draftId, draftLabel, children, onSubmit, ...props }) {
  const localize = useUiText();
  const form = useRef(null), baseline = useRef("");
  const [dirty, setDirty] = useState(false), [state, setState] = useState("clean");
  const { isArabic } = useI18n();
  useEffect(() => { baseline.current = formSnapshot(form.current); }, []);
  const reset = () => { form.current.reset(); setDirty(false); setState("clean"); };
  useDraftRegistration({ id: draftId, label: draftLabel, dirty, saving: state === "saving", discard: reset });
  return <ActionScope label={draftLabel}><form {...props} ref={form} onChange={() => { setDirty(formSnapshot(form.current) !== baseline.current); setState("clean"); }} onSubmit={async event => {
    event.preventDefault(); const element = form.current; setState("saving");
    try {
      if (await onSubmit(event) === false) { setState("error"); return; }
      for (const field of element.elements) { if (field.type === "checkbox" || field.type === "radio") field.defaultChecked = field.checked; else if (field.tagName === "SELECT") for (const option of field.options) option.defaultSelected = option.selected; else if (field.name) field.defaultValue = field.value; }
      baseline.current = formSnapshot(element); setDirty(false); setState("saved");
    } catch { setState("error"); }
  }}>{children}<DraftStatus draft={{ dirty, state, reset }} label={draftLabel || (isArabic ? "الإعدادات" : localize("Settings"))} /></form></ActionScope>;
}
