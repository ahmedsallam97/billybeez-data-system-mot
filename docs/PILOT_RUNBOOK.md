# Sanitized pilot runbook

Use the existing `deploy/pilot` Docker, Compose and Caddy tooling. The pilot must use a new synthetic data generation and private randomly generated accounts. Never import a workplace database, employee uploads, process templates, survey definitions or grading configuration.

## Prepare a synthetic generation

Follow [Sanitized pilot data](../deploy/pilot/SANITIZED_DATA.md). Run `prepare-sanitized-data.cjs` only with a new absolute generation path outside the source checkout. Run `prepare-accounts.cjs` against that generation and save its private credential output outside source control. Clearly mark account display names as test accounts.

`create-secrets.cjs` prepares random local/server secrets. Keep the resulting directory private. Fill the existing environment templates locally, never commit the operative files, keys or credentials. The Compose environment selects the reviewed `RELEASE_REVISION`, approved hostname, certificate email, generation directory and persistent backup directory.

## Local rehearsal

Build with `deploy/pilot/Dockerfile`, then use the existing `compose.yml`. A local override may bind the app and HTTPS gateway only to loopback for rehearsal. Browser certificate exceptions apply only to that local rehearsal. Public access requires a valid trusted HTTPS certificate.

Use the existing `tests/pilot/pilot.config.cjs` with the test-only generation and private access/account files. Verify login, three simultaneous desktop sessions, page permissions, rotation preview, operational reports, evaluation and monthly evidence, Employee of the Month, synthetic file uploads/downloads and PDFs. Test both supported languages and desktop sizes. Save generated test evidence outside Git.

Verify database and file persistence after restart and container recreation. Keep historical workplace records out of the test generation throughout.

## Backup and restore

Reuse `scripts/pilot-backup.js`, `deploy/pilot/backup-job.cjs` and `backup.sh`. The backup captures a consistent SQLite snapshot and the complete persistent file inventory, encrypts the archive and verifies integrity. Restore into a new generation; never overwrite an existing generation in place. Start the restored generation and repeat login, file hashes, workflow and persistence checks.

Public operation requires automatic encrypted backups to a private owner-controlled destination. Install the existing backup service and timer only after configuring its restricted destination credentials. Verify that a completed backup is recoverable and that the app resumes after the maintenance window. Local-only drill mode is for rehearsal, not the public backup policy.

## Public deployment boundary

Deployment requires the owner's approved free provider/region, available free VM, approved MFA session, SSH access, DNS control, certificate contact and private backup destination. Do not accept a paid upgrade or change the approved region. Do not transfer workplace data. No deployment is implied by building the image or completing local tests.

Public completion requires HTTPS from an external desktop, persistent storage, verified encrypted restoration and successful restart/recreation. The performance worker stays opt-in and must not be enabled implicitly.
