const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const { DatabaseSync } = require('node:sqlite');
const bcrypt = require('bcryptjs');

test('pilot accounts reuse existing access roles, preserve profiles and refuse repeat preparation', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'operations-pilot-account-test-'));
  t.after(() => { assert.ok(root.startsWith(os.tmpdir() + path.sep)); fs.rmSync(root, { recursive: true, force: true }); });
  fs.mkdirSync(path.join(root, 'database'));
  fs.writeFileSync(path.join(root, '.operations-pilot-volume'), JSON.stringify({stage:'pilot'}));
  const db = new DatabaseSync(path.join(root, 'database/operations.db'));
  db.exec('CREATE TABLE User(id TEXT PRIMARY KEY,name TEXT,username TEXT UNIQUE,password TEXT,role TEXT,active INTEGER,createdAt INTEGER,updatedAt INTEGER);CREATE TABLE SystemSetting(key TEXT PRIMARY KEY,value TEXT);CREATE TABLE AuditLog(id TEXT PRIMARY KEY,userId TEXT,action TEXT,summary TEXT,metadata TEXT,createdAt INTEGER);');
  db.prepare('INSERT INTO User VALUES(?,?,?,?,?,?,?,?)').run('old','Original','original','unchanged-hash','ADMIN',1,1,1);
  const originalProfile={roleId:'existing-owner',displayName:'Preserved owner',branches:[],allBranches:true,overrides:{},sessionVersion:4};
  const config={version:1,permissionVersion:2,revision:8,roles:[{id:'existing-owner',legacyRole:'ADMIN',active:true},{id:'existing-manager',legacyRole:'MANAGER',active:true}],accounts:{old:originalProfile}};
  db.prepare('INSERT INTO SystemSetting VALUES(?,?)').run('ACCOUNT_ACCESS_CONFIG',JSON.stringify(config));
  db.prepare('INSERT INTO SystemSetting VALUES(?,?)').run('OPS_BRANCH_CONFIG',JSON.stringify({branchCode:'TEST'}));
  const credentials=path.join(root,'accounts.json');
  const run=()=>spawnSync(process.execPath,[path.resolve('deploy/pilot/prepare-accounts.cjs'),root,credentials],{encoding:'utf8'});
  assert.equal(run().status,0);
  const accounts=JSON.parse(fs.readFileSync(credentials));assert.equal(accounts.length,3);
  const after=JSON.parse(db.prepare('SELECT value FROM SystemSetting WHERE key=?').get('ACCOUNT_ACCESS_CONFIG').value);
  assert.deepEqual(after.accounts.old,originalProfile);assert.equal(after.revision,9);assert.deepEqual(after.roles,config.roles);
  const original=db.prepare('SELECT * FROM User WHERE id=?').get('old');assert.equal(original.password,'unchanged-hash');assert.equal(original.active,0);
  for(const account of accounts){const user=db.prepare('SELECT * FROM User WHERE username=?').get(account.username);assert.ok(bcrypt.compareSync(account.password,user.password));assert.equal(user.active,1);const profile=after.accounts[user.id];assert.equal(profile.roleId,account.role==='ADMIN'?'existing-owner':'existing-manager');assert.deepEqual(profile.branches,account.role==='ADMIN'?[]:['TEST']);assert.equal(profile.forcePasswordChange,false);}
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM AuditLog WHERE action=?').get('PILOT_ACCOUNTS_PREPARED').count,1);
  assert.notEqual(run().status,0);assert.equal(db.prepare('SELECT COUNT(*) AS count FROM User').get().count,4);
  db.close();
});

test('pilot preparation without migrated account access fails without changing existing users', t => {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'operations-pilot-account-guard-'));
  t.after(()=>{assert.ok(root.startsWith(os.tmpdir()+path.sep));fs.rmSync(root,{recursive:true,force:true});});
  fs.mkdirSync(path.join(root,'database'));fs.writeFileSync(path.join(root,'.operations-pilot-volume'),JSON.stringify({stage:'pilot'}));
  const db=new DatabaseSync(path.join(root,'database/operations.db'));
  db.exec('CREATE TABLE User(id TEXT PRIMARY KEY,active INTEGER);CREATE TABLE SystemSetting(key TEXT PRIMARY KEY,value TEXT);INSERT INTO User VALUES(\'original\',1);');
  const output=path.join(root,'accounts.json');const result=spawnSync(process.execPath,[path.resolve('deploy/pilot/prepare-accounts.cjs'),root,output],{encoding:'utf8'});
  assert.notEqual(result.status,0);assert.match(result.stderr,/Migrate the copied Account Profiles/);assert.equal(db.prepare('SELECT active FROM User').get().active,1);assert.equal(fs.existsSync(output),false);db.close();
});
