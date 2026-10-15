// Pilot backup bundles: consistent SQLite snapshot + every protected employee file.
// No reset, migration, seed, in-place restore, or implicit live database path.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const { DatabaseSync } = require('node:sqlite');

const MAGIC = Buffer.from('BBOPS-BACKUP-1\n');
const MAX_BYTES = 256 * 1024 * 1024; // Deliberate bounded pilot archive, not an unlimited backup engine.
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const json = value => JSON.stringify(value, (_key, item) => typeof item === 'bigint' ? item.toString() : item);
const quote = name => '"' + name.replaceAll('"', '""') + '"';

function inside(root, relative) {
  if (!relative || relative.includes('\\') || relative.includes(':') || relative.startsWith('/') || relative.split('/').some(part => !part || part === '.' || part === '..')) throw new Error('Unsafe bundle path');
  const resolved = path.resolve(root, ...relative.split('/'));
  if (!resolved.startsWith(path.resolve(root) + path.sep)) throw new Error('Path escapes bundle');
  return resolved;
}
function filesUnder(root) {
  const files = [];
  function visit(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) throw new Error('Symlinks are not allowed in pilot storage');
      if (entry.isDirectory()) visit(full);
      else if (entry.isFile()) files.push(path.relative(root, full).split(path.sep).join('/'));
      else throw new Error('Unsupported storage entry');
    }
  }
  visit(root);
  return files.sort();
}
function inspectDatabase(file) {
  if (!fs.statSync(file).isFile()) throw new Error('Existing database file required');
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    db.exec('PRAGMA busy_timeout=5000; BEGIN;');
    const integrity = db.prepare('PRAGMA integrity_check').all();
    const foreignKeys = db.prepare('PRAGMA foreign_key_check').all();
    if (integrity.length !== 1 || Object.values(integrity[0])[0] !== 'ok' || foreignKeys.length) throw new Error('SQLite integrity or foreign key verification failed');
    const schema = db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name").all();
    const tables = {};
    for (const item of schema.filter(item => item.type === 'table')) {
      const statement = db.prepare('SELECT * FROM ' + quote(item.name));
      statement.setReadBigInts(true);
      const rows = statement.all().map(json).sort();
      tables[item.name] = { count: rows.length, sha256: hash(json(rows)) };
    }
    const reportFiles=tables.SystemSetting ? db.prepare("SELECT value FROM SystemSetting WHERE key LIKE 'OPS_REPORT_FILE:%' OR key LIKE 'OPS_SCHEDULE_IMPORT:%'").all().map(row=>JSON.parse(row.value)) : [];
    const documents = tables.EmployeeDocument ? db.prepare("SELECT storageKey,sizeBytes FROM EmployeeDocument WHERE status='ACTIVE' ORDER BY storageKey").all() : [];
    db.exec('COMMIT;');
    const accountRow=tables.SystemSetting ? db.prepare("SELECT value FROM SystemSetting WHERE key='ACCOUNT_ACCESS_CONFIG'").get() : null;
    const avatars=accountRow ? Object.values(JSON.parse(accountRow.value).accounts||{}).map(profile=>profile.avatar).filter(Boolean) : [];
    return { schemaSha256: hash(json(schema)), tables, documents: [...documents,...reportFiles.map(file=>({storageKey:file.storageKey,sizeBytes:file.sizeBytes,sha256:file.sha256})),...avatars], integrity: 'ok', foreignKeyErrors: 0 };
  } finally { db.close(); }
}
function assertNewDirectory(target) {
  if (fs.existsSync(target)) throw new Error('Target already exists; in-place restore/overwrite is refused');
  fs.mkdirSync(target, { recursive: true, mode: 0o700 });
}
function verifyBundle(root) {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
  if (manifest.version !== 1 || !Array.isArray(manifest.files)) throw new Error('Unsupported backup manifest');
  const actualKeys = filesUnder(path.join(root, 'employee-files'));
  const expectedKeys = manifest.files.map(file => file.key).sort();
  if (new Set(expectedKeys).size !== expectedKeys.length || json(actualKeys) !== json(expectedKeys)) throw new Error('Employee file inventory does not match manifest');
  for (const file of manifest.files) {
    const full = inside(path.join(root, 'employee-files'), file.key);
    if (fs.statSync(full).size !== file.bytes || hash(fs.readFileSync(full)) !== file.sha256) throw new Error('Employee file hash/size mismatch');
  }
  const databaseFile = path.join(root, 'database', 'operations.db');
  if (fs.statSync(databaseFile).size !== manifest.database.bytes || hash(fs.readFileSync(databaseFile)) !== manifest.database.sha256) throw new Error('Database hash/size mismatch');
  const inspected = inspectDatabase(databaseFile);
  if (inspected.schemaSha256 !== manifest.database.schemaSha256 || json(inspected.tables) !== json(manifest.database.tables)) throw new Error('Database schema/row verification failed');
  const inventory = new Map(manifest.files.map(file => [file.key, file]));
  for (const document of inspected.documents) {
    const file = inventory.get(document.storageKey);
    if (!file || file.bytes !== document.sizeBytes || (document.sha256 && file.sha256 !== document.sha256)) throw new Error('Active employee document is missing or has the wrong size');
  }
  return manifest;
}
function createBundle({ database, storage, target, release = 'unrecorded' }) {
  database = fs.realpathSync(database); storage = fs.realpathSync(storage); target = path.resolve(target);
  if (target.startsWith(storage + path.sep) || database.startsWith(target + path.sep)) throw new Error('Backup cannot contain its own source');
  assertNewDirectory(target);
  fs.mkdirSync(path.join(target, 'database'), { mode: 0o700 });
  fs.mkdirSync(path.join(target, 'employee-files'), { mode: 0o700 });
  const dbTarget = path.join(target, 'database', 'operations.db');
  const source = new DatabaseSync(database, { readOnly: true });
  try { source.exec('PRAGMA busy_timeout=5000;'); source.prepare('VACUUM INTO ?').run(dbTarget); }
  finally { source.close(); }
  const snapshot = inspectDatabase(dbTarget);
  const files = filesUnder(storage).map(key => {
    const from = inside(storage, key), to = inside(path.join(target, 'employee-files'), key);
    fs.mkdirSync(path.dirname(to), { recursive: true, mode: 0o700 });
    fs.copyFileSync(from, to, fs.constants.COPYFILE_EXCL); fs.chmodSync(to, 0o600);
    return { key, bytes: fs.statSync(to).size, sha256: hash(fs.readFileSync(to)) };
  });
  // Detect writes during capture. The snapshot is never advertised as verified if
  // the operational rows or files moved during the multi-resource copy.
  const after = inspectDatabase(database);
  if (json(after) !== json(snapshot)) throw new Error('Source changed during backup; retry during a quiet window');
  if (json(filesUnder(storage)) !== json(files.map(file => file.key))) throw new Error('Source file inventory changed during backup');
  for (const file of files) if (hash(fs.readFileSync(inside(storage, file.key))) !== file.sha256) throw new Error('Source file changed during backup');
  const manifest = { version: 1, createdAt: new Date().toISOString(), release, database: { bytes: fs.statSync(dbTarget).size, sha256: hash(fs.readFileSync(dbTarget)), schemaSha256: snapshot.schemaSha256, tables: snapshot.tables }, files, integrity: 'ok', foreignKeyErrors: 0 };
  fs.chmodSync(dbTarget, 0o600);
  fs.writeFileSync(path.join(target, 'manifest.json'), JSON.stringify(manifest, null, 2), { flag: 'wx', mode: 0o600 });
  verifyBundle(target);
  return manifest;
}
function restoreBundle(source, target) {
  source = path.resolve(source); target = path.resolve(target);
  const manifest = verifyBundle(source);
  if (target.startsWith(source + path.sep)) throw new Error('Restore target cannot be inside the backup');
  assertNewDirectory(target);
  fs.cpSync(path.join(source, 'database'), path.join(target, 'database'), { recursive: true, errorOnExist: true, force: false });
  fs.cpSync(path.join(source, 'employee-files'), path.join(target, 'employee-files'), { recursive: true, errorOnExist: true, force: false });
  fs.copyFileSync(path.join(source, 'manifest.json'), path.join(target, 'manifest.json'), fs.constants.COPYFILE_EXCL);
  verifyBundle(target);
  fs.writeFileSync(path.join(target, '.operations-pilot-volume'), JSON.stringify({ stage: 'pilot', restoredAt: new Date().toISOString(), manifestSha256: hash(json(manifest)) }), { flag: 'wx', mode: 0o600 });
  return manifest;
}
function readKey(file) {
  const value = fs.readFileSync(file, 'utf8').trim();
  if (!/^[a-f0-9]{64}$/i.test(value)) throw new Error('Backup key must contain exactly 32 random bytes encoded as hex');
  return Buffer.from(value, 'hex');
}
function sealBundle(source, output, keyFile) {
  const manifest = verifyBundle(source);
  const keys = ['manifest.json', 'database/operations.db', ...manifest.files.map(file => 'employee-files/' + file.key)];
  const total = keys.reduce((sum, key) => sum + fs.statSync(inside(source, key)).size, 0);
  if (total > MAX_BYTES) throw new Error('Pilot backup exceeds the 256 MiB limit; configure a reviewed streaming backup before further growth');
  const entries = keys.map(key => ({ key, body: fs.readFileSync(inside(source, key)).toString('base64') }));
  const iv = crypto.randomBytes(12), cipher = crypto.createCipheriv('aes-256-gcm', readKey(keyFile), iv);
  cipher.setAAD(MAGIC);
  const payload = zlib.gzipSync(Buffer.from(json(entries)));
  const encrypted = Buffer.concat([cipher.update(payload), cipher.final()]);
  fs.writeFileSync(output, Buffer.concat([MAGIC, iv, encrypted, cipher.getAuthTag()]), { flag: 'wx', mode: 0o600 });
  return { bytes: fs.statSync(output).size, sha256: hash(fs.readFileSync(output)), files: manifest.files.length };
}
function unsealBundle(source, target, keyFile) {
  if (fs.statSync(source).size > MAX_BYTES * 2) throw new Error('Archive exceeds pilot size limit');
  const input = fs.readFileSync(source), offset = MAGIC.length;
  if (input.length < offset + 28 || !input.subarray(0, offset).equals(MAGIC)) throw new Error('Unsupported encrypted backup format');
  const decipher = crypto.createDecipheriv('aes-256-gcm', readKey(keyFile), input.subarray(offset, offset + 12));
  decipher.setAAD(MAGIC); decipher.setAuthTag(input.subarray(-16));
  // Authentication completes before any archive-controlled file is written.
  const payload = Buffer.concat([decipher.update(input.subarray(offset + 12, -16)), decipher.final()]);
  const entries = JSON.parse(zlib.gunzipSync(payload, { maxOutputLength: MAX_BYTES * 2 }).toString('utf8'));
  if (!Array.isArray(entries) || !entries.length || new Set(entries.map(entry => entry.key)).size !== entries.length) throw new Error('Invalid archive inventory');
  for (const entry of entries) {
    inside(target, entry.key);
    if (entry.key !== 'manifest.json' && entry.key !== 'database/operations.db' && !entry.key.startsWith('employee-files/')) throw new Error('Unexpected archive path');
    if (typeof entry.body !== 'string' || !/^[A-Za-z0-9+/]*={0,2}$/.test(entry.body)) throw new Error('Invalid archive contents');
  }
  assertNewDirectory(target);
  fs.mkdirSync(path.join(target, 'employee-files'), { mode: 0o700 });
  for (const entry of entries) {
    const file = inside(target, entry.key); fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
    fs.writeFileSync(file, Buffer.from(entry.body, 'base64'), { flag: 'wx', mode: 0o600 });
  }
  return verifyBundle(target);
}
function args(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 2) {
    if (!argv[index].startsWith('--') || !argv[index + 1]) throw new Error('Expected --name value arguments');
    options[argv[index].slice(2)] = argv[index + 1];
  }
  return options;
}
if (require.main === module) {
  try {
    const [command, ...rest] = process.argv.slice(2), options = args(rest);
    let result;
    if (command === 'create') result = createBundle(options);
    else if (command === 'verify') result = verifyBundle(options.source);
    else if (command === 'restore') result = restoreBundle(options.source, options.target);
    else if (command === 'seal') result = sealBundle(options.source, options.output, options.key);
    else if (command === 'unseal') result = unsealBundle(options.source, options.target, options.key);
    else throw new Error('Commands: create --database FILE --storage DIR --target NEW_DIR [--release SHA]; verify --source DIR; restore --source DIR --target NEW_DIR; seal --source DIR --output NEW_FILE --key FILE; unseal --source FILE --target NEW_DIR --key FILE');
    console.log(JSON.stringify(result.database ? { integrity: result.integrity, foreignKeyErrors: result.foreignKeyErrors, tables: Object.keys(result.database.tables).length, files: result.files.length, databaseSha256: result.database.sha256, release: result.release } : result, null, 2));
  } catch (error) { console.error('Pilot backup failed:', error.message); process.exitCode = 1; }
}
module.exports = { createBundle, verifyBundle, restoreBundle, sealBundle, unsealBundle, inspectDatabase, filesUnder, inside, hash };
