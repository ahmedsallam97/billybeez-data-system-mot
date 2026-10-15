// Run ONLY after approval on a newly restored PILOT COPY, never on prisma/dev.db.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');
const { DatabaseSync } = require('node:sqlite');
const { isOperationsRole } = require('../../lib/accounts/registry');
const [dataDirectory, privateOutput] = process.argv.slice(2);
if (!dataDirectory || !privateOutput) throw new Error('Usage: node prepare-accounts.cjs <restored-pilot-generation> <NEW-private-credentials-file>');
const root = fs.realpathSync(dataDirectory);
if (JSON.parse(fs.readFileSync(path.join(root, '.operations-pilot-volume'))).stage !== 'pilot' || fs.existsSync(privateOutput)) throw new Error('A pilot restore marker and a new private output file are required');
if (fs.existsSync(path.join(root, '.pilot-accounts-created'))) throw new Error('Pilot accounts already prepared; repeated password rotation refused');
const database = path.join(root, 'database/operations.db');
const accounts = ['ADMIN','MANAGER','MANAGER'].map((role, i) => ({ username: i ? 'pilot-manager-' + i : 'pilot-admin', role, password: crypto.randomBytes(24).toString('base64url') }));
const db = new DatabaseSync(database);
try {
  db.exec('BEGIN IMMEDIATE;');
  db.exec('UPDATE User SET active=0;');
  const now = Date.now();
  const accessRow = db.prepare('SELECT value FROM SystemSetting WHERE key=?').get('ACCOUNT_ACCESS_CONFIG');
  if (!accessRow) throw new Error('Migrate the copied Account Profiles configuration before preparing pilot accounts');
  const access = accessRow ? JSON.parse(accessRow.value) : null;
  if (access && (access.version !== 1 || !Array.isArray(access.roles) || !access.accounts)) throw new Error('Unsupported account access configuration');
  const branchRow = db.prepare('SELECT value FROM SystemSetting WHERE key=?').get('OPS_BRANCH_CONFIG');
  const branch = String(JSON.parse(branchRow?.value || '{}').branchCode || 'MOT').toUpperCase();
  const accountIds = [];
  for (const account of accounts) {
    const id = crypto.randomUUID(); accountIds.push(id);
    const role = access?.roles.find(candidate => candidate.active && isOperationsRole(candidate) && candidate.legacyRole === account.role);
    if (access && !role) throw new Error('An active existing Operations role is required for each pilot account');
    db.prepare('INSERT INTO User (id,name,username,password,role,active,createdAt,updatedAt) VALUES (?,?,?,?,?,1,?,?)').run(id, account.username, account.username, bcrypt.hashSync(account.password, 12), account.role, now, now);
    if (access) access.accounts[id] = {
      displayName: account.username, email: null, phone: '', jobTitle: '', preferredLanguage: null,
      branches: account.role === 'ADMIN' ? [] : [branch], allBranches: account.role === 'ADMIN', roleId: role.id,
      overrides: {}, teamIds: [], dataScope: account.role === 'ADMIN' ? 'ALL' : 'BRANCH', sessionVersion: 0,
      forcePasswordChange: false, archivedAt: null, lastLogin: null, avatar: null,
    };
  }
  if (access) {
    access.revision = Number(access.revision || 0) + 1;
    db.prepare('UPDATE SystemSetting SET value=? WHERE key=?').run(JSON.stringify(access), 'ACCOUNT_ACCESS_CONFIG');
  }
  db.prepare('INSERT INTO AuditLog (id,userId,action,summary,metadata,createdAt) VALUES (?,?,?,?,?,?)').run(crypto.randomUUID(), accountIds[0], 'PILOT_ACCOUNTS_PREPARED', 'Prepared three isolated pilot accounts using existing Operations roles', JSON.stringify({ target: 'pilot-accounts', accountIds, existingAccessConfiguration: Boolean(access) }), now);
  fs.writeFileSync(privateOutput, JSON.stringify(accounts, null, 2), { flag: 'wx', mode: 0o600 });
  db.exec('COMMIT;');
  fs.writeFileSync(path.join(root, '.pilot-accounts-created'), new Date().toISOString(), { flag: 'wx', mode: 0o600 });
} catch (error) { try { db.exec('ROLLBACK;'); } catch {} throw error; }
finally { db.close(); }
console.log('Created three isolated pilot logins. Imported users remain preserved but inactive in this pilot copy. No operational employee/history rows were edited.');
