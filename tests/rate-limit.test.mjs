import assert from "node:assert/strict";
import { test } from "node:test";
import rateLimitModule from "../lib/rate-limit.js";

const { rateLimit, resetRateLimit } = rateLimitModule;

test("rateLimit blocks after the configured limit", () => {
  resetRateLimit();

  const options = { key: "login:test", limit: 2, windowMs: 1000, now: 100 };

  assert.equal(rateLimit(options).allowed, true);
  assert.equal(rateLimit(options).allowed, true);
  assert.equal(rateLimit(options).allowed, false);
});

test("rateLimit resets after the time window", () => {
  resetRateLimit();

  assert.equal(rateLimit({ key: "login:test", limit: 1, windowMs: 1000, now: 100 }).allowed, true);
  assert.equal(rateLimit({ key: "login:test", limit: 1, windowMs: 1000, now: 200 }).allowed, false);
  assert.equal(rateLimit({ key: "login:test", limit: 1, windowMs: 1000, now: 1200 }).allowed, true);
});
