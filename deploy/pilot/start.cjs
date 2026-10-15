const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const { spawn } = require('node:child_process');

function validate(env = process.env) {
  if (env.DEPLOYMENT_STAGE !== 'pilot' || env.DATABASE_PROVIDER !== 'sqlite') throw new Error('This entrypoint is only for the approved single-instance SQLite pilot');
  if (env.COOKIE_SECURE !== 'true' || !env.SESSION_SECRET || env.SESSION_SECRET.length < 48 || /replace|generate|example|changeme/i.test(env.SESSION_SECRET)) throw new Error('A fresh random session secret and HTTPS-only cookies are required');
  if (env.DATABASE_URL !== 'file:/data/database/operations.db' || env.EMPLOYEE_FILE_STORAGE_PROVIDER !== 'local' || env.EMPLOYEE_FILE_STORAGE_ROOT !== '/data/employee-files') throw new Error('Pilot persistence paths must point to the mounted data generation');
  const marker = JSON.parse(fs.readFileSync('/data/.operations-pilot-volume', 'utf8'));
  if (marker.stage !== 'pilot') throw new Error('Verified restored pilot volume required; refusing to initialize an empty database');
  fs.accessSync('/data/database/operations.db', fs.constants.R_OK | fs.constants.W_OK);
  fs.accessSync('/data/employee-files', fs.constants.R_OK | fs.constants.W_OK);
  const db = new DatabaseSync('/data/database/operations.db');
  try {
    if (db.prepare('PRAGMA quick_check').get().quick_check !== 'ok' || db.prepare('PRAGMA foreign_key_check').all().length) throw new Error('Pilot database integrity failed');
    for (const file of fs.readdirSync('/app/prisma/sqlite-migrations').filter(file => file.endsWith('.sql'))) {
      const sql = fs.readFileSync(path.join('/app/prisma/sqlite-migrations', file), 'utf8').replaceAll('\r\n', '\n');
      const accepted = [sql, sql.replaceAll('\n', '\r\n')].map(text => crypto.createHash('sha256').update(text).digest('hex'));
      if (!accepted.includes(db.prepare('SELECT checksum FROM _OperationsMigration WHERE name=?').get(file)?.checksum)) throw new Error('Database migration mismatch; review an offline upgrade instead of changing the schema on startup');
    }
    // Pilot copy only. WAL permits concurrent reads; writes still serialize.
    db.exec('PRAGMA journal_mode=WAL;');
  } finally { db.close(); }
}
if (require.main === module) {
  try { validate(); }
  catch (error) { console.error('Pilot startup refused:', error.message); process.exit(1); }
  const server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-H', '0.0.0.0', '-p', '3000'], { stdio: 'inherit', env: process.env });
  server.on('exit', (code, signal) => signal ? process.kill(process.pid, signal) : process.exit(code || 0));
  for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => server.kill(signal));
}
module.exports = { validate };
