"use client";
import { createContext, useContext, useEffect, useState } from "react";
import { DASHBOARD_SETTING_KEY, defaultDashboardSettings, parseDashboardSettings } from "@/lib/operations/dashboard-settings";
import { readApiResponse } from "@/lib/client/read-api-response";

const Context = createContext({ config: defaultDashboardSettings(), ready: false, userId: "", updateConfig: () => {} });
export function OperationsUiProvider({ children, user, enabled, initialSettings }) {
  const [config, setConfig] = useState(initialSettings || defaultDashboardSettings);
  const [ready, setReady] = useState(Boolean(initialSettings));
  const [error, setError] = useState("");
  // Router refreshes receive current server settings; the provider survives navigation.
  useEffect(() => { if (initialSettings) { setConfig(initialSettings); setReady(true); } }, [initialSettings]);
  useEffect(() => {
    if (!enabled || initialSettings) return;
    if(!user.permissions?.['settings.view']){setReady(true);return;}
    let active = true;
    fetch(`/api/operations/settings?keys=${DASHBOARD_SETTING_KEY}`, { cache: "no-store" }).then(response => readApiResponse(response))
      .then(data => { if (active) setConfig(parseDashboardSettings(data.settings.find(row => row.key === DASHBOARD_SETTING_KEY)?.value)); })
      .catch(() => { if (active) setError("Dashboard preferences could not be loaded. Default navigation is available; retry in Settings."); })
      .finally(() => { if (active) setReady(true); });
    return () => { active = false; };
  }, [enabled, initialSettings]);
  return <Context.Provider value={{ config, ready, error, userId: user.id, updateConfig: setConfig }}>{children}</Context.Provider>;
}
export function useOperationsUi() { return useContext(Context); }
