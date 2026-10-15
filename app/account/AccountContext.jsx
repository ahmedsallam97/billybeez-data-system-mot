"use client";
import { createContext, useContext, useEffect, useState } from "react";
const Context = createContext({ user: null, updateUser: () => {} });
export function AccountProvider({ user: initialUser, children }) {
  const [user, setUser] = useState(initialUser);
  useEffect(() => setUser(initialUser), [initialUser]);
  useEffect(() => {
    const save = async (event) => {
      if (initialUser.profile?.forcePasswordChange) return;
      try {
        const response = await fetch("/api/account", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ preferredLanguage: event.detail }),
        });
        if (response.ok) {
          const result = await response.json();
          setUser(result.user);
        }
      } catch {}
    };
    window.addEventListener("account-language-changed", save);
    return () => window.removeEventListener("account-language-changed", save);
  }, [initialUser.id]);
  useEffect(() => {
    const update = (event) => {
      if (event.detail?.id === initialUser.id) setUser(event.detail);
    };
    window.addEventListener("account-updated", update);
    return () => window.removeEventListener("account-updated", update);
  }, [initialUser.id]);
  return (
    <Context.Provider value={{ user, updateUser: setUser }}>
      {children}
    </Context.Provider>
  );
}
export function useAccount() {
  return useContext(Context);
}
export function usePermission(key) {
  const { user } = useAccount();
  return Boolean(user?.permissions?.[key]);
}
export function accountSaved(user) {
  window.dispatchEvent(new CustomEvent("account-updated", { detail: user }));
}
export function initials(name) {
  return (
    String(name || "")
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase() || "?"
  );
}
export function Avatar({ user, size = 40 }) {
  const name = user.profile?.displayName || user.name;
  return (
    <span className="account-avatar" style={{ width: size, height: size }}>
      {user.profile?.avatar ? (
        <img src={user.profile.avatar.url} alt={name} />
      ) : (
        <span aria-hidden="true">{initials(name)}</span>
      )}
    </span>
  );
}
