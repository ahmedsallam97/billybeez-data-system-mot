const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { randomUUID } = require('node:crypto');
const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { createBundle, sealBundle, unsealBundle, restoreBundle, hash } = require('../../scripts/pilot-backup');

let stage = 'configuration';
async function main() {
  const localDrill = process.env.PILOT_BACKUP_LOCAL_DRILL === 'true';
  const endpoint = process.env.BACKUP_S3_ENDPOINT;
  if (!localDrill && (!endpoint?.startsWith('https://') || !process.env.BACKUP_S3_BUCKET || !process.env.BACKUP_S3_ACCESS_KEY_ID || !process.env.BACKUP_S3_SECRET_ACCESS_KEY)) throw new Error('An authenticated private HTTPS object-store target is required');
  if (JSON.parse(fs.readFileSync('/data/.operations-pilot-volume')).stage !== 'pilot') throw new Error('Verified pilot volume required');
  const parent = os.tmpdir(), scratch = fs.mkdtempSync(path.join(parent, 'operations-backup-'));
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const name = 'operations-' + stamp + '-' + randomUUID() + '.opsbackup';
  const archive = path.join('/backups', name);
  try {
    stage = 'snapshot';
    const bundle = path.join(scratch, 'bundle');
    const manifest = createBundle({ database: '/data/database/operations.db', storage: '/data/employee-files', target: bundle, release: process.env.RELEASE_REVISION });
    stage = 'encryption';
    const sealed = sealBundle(bundle, archive, '/run/secrets/backup.key');
    if (sealed.bytes > 10 * 1024 * 1024) throw new Error('Archive exceeded the reviewed free-tier backup size budget; local encrypted copy retained');
    stage = 'restore-rehearsal';
    const decoded = path.join(scratch, 'decoded');
    unsealBundle(archive, decoded, '/run/secrets/backup.key');
    restoreBundle(decoded, path.join(scratch, 'restored'));
    let remoteKey = null;
    if (!localDrill) {
      stage = 'off-host-roundtrip';
      const client = new S3Client({ endpoint, region: process.env.BACKUP_S3_REGION, forcePathStyle: true, requestChecksumCalculation: 'WHEN_REQUIRED', responseChecksumValidation: 'WHEN_REQUIRED', credentials: { accessKeyId: process.env.BACKUP_S3_ACCESS_KEY_ID, secretAccessKey: process.env.BACKUP_S3_SECRET_ACCESS_KEY } });
      const prefix = process.env.BACKUP_S3_PREFIX || 'operations-pilot';
      if (!/^[a-zA-Z0-9/_-]+$/.test(prefix) || prefix.includes('..')) throw new Error('Invalid backup prefix');
      remoteKey = prefix + '/' + name;
      await client.send(new PutObjectCommand({ Bucket: process.env.BACKUP_S3_BUCKET, Key: remoteKey, Body: fs.readFileSync(archive), ContentType: 'application/octet-stream', Metadata: { sha256: sealed.sha256 } }));
      const response = await client.send(new GetObjectCommand({ Bucket: process.env.BACKUP_S3_BUCKET, Key: remoteKey }));
      if (hash(Buffer.from(await response.Body.transformToByteArray())) !== sealed.sha256) throw new Error('Downloaded remote backup failed checksum verification');
    }
    stage = 'record-success';
    const result = { completedAt: new Date().toISOString(), release: manifest.release, archive: name, sha256: sealed.sha256, bytes: sealed.bytes, fileCount: manifest.files.length, databaseIntegrity: 'ok', restoreRehearsal: 'passed', offHostRoundTrip: !localDrill, remoteKey };
    const status = path.join('/backups', localDrill ? 'last-drill.json' : 'last-success.json');
    fs.writeFileSync(status + '.tmp', JSON.stringify(result, null, 2), { mode: 0o600 }); fs.renameSync(status + '.tmp', status);
    console.log(JSON.stringify(result, null, 2));
    // Prune only this job's encrypted snapshots, only AFTER a verified remote
    // backup. Initial/manual backups and failed-job artifacts are never pruned.
    if (!localDrill) for (const file of fs.readdirSync('/backups')) {
      if (!/^operations-[0-9T-]+Z-[a-f0-9-]+\.opsbackup$/.test(file)) continue;
      const full = path.join('/backups', file);
      if (fs.statSync(full).mtimeMs < Date.now() - 35 * 86400000) fs.unlinkSync(full);
    }
  } finally {
    const resolved = path.resolve(scratch), allowed = path.resolve(parent) + path.sep;
    if (!resolved.startsWith(allowed) || !path.basename(resolved).startsWith('operations-backup-')) throw new Error('Unsafe temporary backup cleanup path');
    fs.rmSync(resolved, { recursive: true, force: true });
  }
}
main().catch(error => {
  console.error('Pilot backup job failed at', stage, ':', error.code || error.name);
  // Local filesystem/SQLite diagnostics contain no credentials. Do not log SDK
  // response bodies or request configuration from the remote upload stage.
  if (stage !== 'off-host-roundtrip') console.error(error.message);
  process.exitCode = 1;
});
