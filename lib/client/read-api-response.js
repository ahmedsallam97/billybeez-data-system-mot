export async function readApiResponse(response, fallbackMessage = "Request failed") {
  const raw = await response.text();
  let payload = null;
  try { payload = raw.trim() ? JSON.parse(raw) : null; } catch { payload = null; }
  if (response.status === 401 && typeof window !== "undefined") {
    const next = `${window.location.pathname}${window.location.search}`;
    window.location.assign(`/login?next=${encodeURIComponent(next)}`);
    throw new Error("Your session expired. Redirecting to login…");
  }
  if (!response.ok) throw new Error(payload?.error || `${fallbackMessage} (${response.status})`);
  if (!payload || typeof payload !== "object") throw new Error(fallbackMessage);
  return payload;
}
