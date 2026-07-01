const buckets = new Map();

function clientIp(request) {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip") || "local";
}

function rateLimit({ key, limit = 8, windowMs = 10 * 60 * 1000, now = Date.now() }) {
  const current = buckets.get(key);

  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1, resetAt: now + windowMs };
  }

  current.count += 1;
  buckets.set(key, current);

  return {
    allowed: current.count <= limit,
    remaining: Math.max(0, limit - current.count),
    resetAt: current.resetAt,
  };
}

function resetRateLimit(key) {
  if (key) buckets.delete(key);
  else buckets.clear();
}

function loginRateLimitKey(request, username) {
  return `login:${clientIp(request)}:${String(username || "").trim().toLowerCase()}`;
}

module.exports = {
  clientIp,
  loginRateLimitKey,
  rateLimit,
  resetRateLimit,
};
