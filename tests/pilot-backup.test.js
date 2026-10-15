const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const backup = require('../scripts/pilot-backup');

function fixture(t) {
  const parent = path.resolve(process.env.OPS_E2E_VERIFICATION_ROOT || 'tmp', 'pilot-backup-tests'); fs.mkdirSync(parent, { recursive: true });
  const root = fs.mkdtempSync(path.join(parent, 'case-'));
  const database = path.join(root, 'live.db'), storage = path.join(root, 'files'); fs.mkdirSync(storage);
  const db = new DatabaseSync(database);
  db.exec("PRAGMA journal_mode=WAL; PRAGMA wal_autocheckpoint=0; CREATE TABLE Records(id INTEGER PRIMARY KEY, value TEXT); INSERT INTO Records VALUES(1,'original'); CREATE TABLE EmployeeDocument(storageKey TEXT PRIMARY KEY,sizeBytes INTEGER,status TEXT); INSERT INTO EmployeeDocument VALUES('photo.jpg',3,'ACTIVE');");
  fs.writeFileSync(path.join(storage, 'photo.jpg'), Buffer.from([1,2,3]));
  const key = path.join(root, 'backup.key'); fs.writeFileSync(key, randomBytes(32).toString('hex'));
  t.after(() => { try { db.close(); } catch {} if (!root.startsWith(parent + path.sep)) throw new Error('Unsafe cleanup'); fs.rmSync(root, { recursive: true, force: true }); });
  return { root, database, storage, db, key, target: path.join(root, 'bundle') };
}
test('backup includes live WAL rows, all files, and restores identically without changing source', t => {
  const f = fixture(t), before = backup.inspectDatabase(f.database);
  const manifest = backup.createBundle({ ...f, release: 'test-release' });
  assert.equal(manifest.database.tables.Records.count, 1);
  assert.deepEqual(backup.inspectDatabase(f.database), before);
  const restored = path.join(f.root, 'new-generation'); backup.restoreBundle(f.target, restored);
  assert.deepEqual(backup.verifyBundle(restored), manifest);
  assert.deepEqual(fs.readFileSync(path.join(restored, 'employee-files/photo.jpg')), Buffer.from([1,2,3]));
  assert.equal(JSON.parse(fs.readFileSync(path.join(restored, '.operations-pilot-volume'))).stage, 'pilot');
});
test('encrypted archive roundtrip verifies hashes and refuses wrong key or modified ciphertext', t => {
  const f = fixture(t); backup.createBundle(f);
  const sealed = path.join(f.root, 'backup.opsbackup'); backup.sealBundle(f.target, sealed, f.key);
  assert.equal(fs.readFileSync(sealed).includes(Buffer.from('original')), false);
  backup.unsealBundle(sealed, path.join(f.root, 'unsealed'), f.key);
  assert.deepEqual(backup.verifyBundle(path.join(f.root, 'unsealed')), backup.verifyBundle(f.target));
  const wrongKey = path.join(f.root, 'wrong.key'); fs.writeFileSync(wrongKey, randomBytes(32).toString('hex'));
  assert.throws(() => backup.unsealBundle(sealed, path.join(f.root, 'wrong'), wrongKey));
  assert.equal(fs.existsSync(path.join(f.root, 'wrong')), false);
  const damaged = fs.readFileSync(sealed); damaged[40] ^= 1; fs.writeFileSync(sealed, damaged);
  assert.throws(() => backup.unsealBundle(sealed, path.join(f.root, 'damaged'), f.key));
  assert.equal(fs.existsSync(path.join(f.root, 'damaged')), false);
});
test('restore refuses existing targets and verification rejects missing or corrupt employee files', t => {
  const f = fixture(t); backup.createBundle(f);
  assert.throws(() => backup.restoreBundle(f.target, f.storage), /already exists/);
  assert.deepEqual(fs.readFileSync(path.join(f.storage, 'photo.jpg')), Buffer.from([1,2,3]));
  fs.writeFileSync(path.join(f.target, 'employee-files/photo.jpg'), Buffer.from([4,5,6]));
  assert.throws(() => backup.verifyBundle(f.target), /hash\/size/);
  assert.throws(() => backup.restoreBundle(f.target, path.join(f.root, 'bad')), /hash\/size/);
  assert.equal(fs.existsSync(path.join(f.root, 'bad')), false);
});
test('backup refuses an active document missing from physical storage and unsafe paths', t => {
  const f = fixture(t); fs.unlinkSync(path.join(f.storage, 'photo.jpg'));
  assert.throws(() => backup.createBundle(f), /missing/);
  for (const key of ['../escape','C:/escape','/absolute','a\\b','a/../b']) assert.throws(() => backup.inside(f.root, key), /Unsafe|escapes/);
});
