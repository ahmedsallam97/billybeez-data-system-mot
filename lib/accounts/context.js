const { AsyncLocalStorage } = require("node:async_hooks");
const context =
  globalThis.__accountAccessContext ||
  (globalThis.__accountAccessContext = new AsyncLocalStorage());
module.exports = { context };
