function databaseProvider() {
  const value = String(process.env.DATABASE_PROVIDER || "sqlite").trim().toLowerCase();
  if (!['sqlite', 'postgresql'].includes(value)) throw new Error(`Unsupported DATABASE_PROVIDER: ${value}`);
  return value;
}

module.exports = { databaseProvider };
