const { createHash } = require("node:crypto");
const buckets = globalThis.__loginBuckets || (globalThis.__loginBuckets = new Map());
const WINDOW = 15 * 60 * 1000;
function consumeLoginAttempt(username, now = Date.now()) {
  for (const [key, row] of buckets) if (row.until <= now) buckets.delete(key);
  // Never retain user-supplied names or trust spoofable forwarded IP headers.
  const key = createHash("sha256").update(String(username).trim().toLowerCase()).digest("hex");
  const row = buckets.get(key) || { count: 0, until: now + WINDOW };
  if (buckets.size >= 10000 && !buckets.has(key)) return { allowed: false, retryAfter: 60 };
  row.count += 1; buckets.set(key, row);
  return { allowed: row.count <= 10, retryAfter: Math.max(1, Math.ceil((row.until - now) / 1000)) };
}
module.exports = { consumeLoginAttempt };
