// Keep this dispatcher ahead of the App Router's window listener across page
// mounts. Removing and re-adding it would let the router unmount a dirty editor
// before the editor can handle a Back/Forward event.
const key = Symbol.for("billy.settings.historyGuard");

export function settingsHistoryGuard() {
  if (!window[key]) {
    const guard = { active: null };
    window.addEventListener("popstate", event => guard.active?.(event), true);
    window[key] = guard;
  }
  return window[key];
}
