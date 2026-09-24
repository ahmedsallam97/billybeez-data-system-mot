# Billy Beez Local Restore Inventory

## Backup set

- Created: 2026-09-24
- Repository: `D:\Projects\billybeez-data-system-mot`
- Git branch: `ops-migration-local`
- External package: `D:\Projects\billybeez-system-backups\BillyBeez-MOT-restore-2026-09-24T10-16-44Z.zip`
- Fresh verified database backup: `D:\Projects\billybeez-data-system-mot\backups\manual-2026-09-24T10-16-44-618Z.db`

The external package is intentionally outside the repository and must never be committed or uploaded to GitHub. It contains credentials, operational history, employee information, and restricted employee evidence. Treat it as confidential.

Final archive size is approximately 18.2 MB (53 files; approximately 117.6 MB before ZIP compression). The exact archive byte size is reported after the final ZIP is built. The archive was extracted to an isolated verification folder, all 52 manifest checksums passed, required environment-variable names were present, and the extracted database passed integrity and foreign-key checks.

## Required restore sources

| Exact source path | Purpose | Sensitive | Included in package | Restore destination after cloning |
| --- | --- | --- | --- | --- |
| `D:\Projects\billybeez-data-system-mot\prisma\dev.db` | Active SQLite database used by the application | Yes: users, employee, POS, and operational data | Yes | `<repo>\prisma\dev.db` |
| `D:\Projects\billybeez-data-system-mot\backups\*.db` | Historical and fresh SQLite recovery points | Yes: complete database snapshots | Yes, all database files present at package time | `<repo>\backups\` |
| `D:\Projects\billybeez-data-system-mot\storage\employee-files\` | Protected employee photo/document binary storage | Yes: employee photos/documents | Yes: all 12 files in 11 employee folders | `<repo>\storage\employee-files\` |
| `D:\Projects\billybeez-data-system-mot\.env` | Local database URL, cookie configuration, and session secret | Yes: contains a secret value | Yes | `<repo>\.env` |
| `D:\Projects\billybeez-data-system-mot\check-admin.js` | Local administrator diagnostic helper | Yes: may contain a local credential | Yes | `<repo>\check-admin.js` |
| `D:\Projects\billybeez-data-system-mot\reset-admin.js` | Local administrator reset helper | Yes: may contain a local credential | Yes | `<repo>\reset-admin.js` |
| `D:\Projects\billybeez-data-system-mot\scripts\migrate-bb-oms.js` | One-time local reconciliation helper and private employee mappings | Yes: employee identifiers and source path | Yes | `<repo>\scripts\migrate-bb-oms.js` |
| `D:\Projects\billybeez-data-system-mot\artifacts\employee360-closure\` | Employee 360 runtime verification screenshots | Yes: employee information is visible | Yes | `<repo>\artifacts\employee360-closure\` |
| `D:\Projects\billybeez-data-system-mot\output\pdf\employee360-complete-file-full-restricted.pdf` | Restricted Complete Employee File verification PDF | Yes: restricted employee information | Yes | `<repo>\output\pdf\employee360-complete-file-full-restricted.pdf` |
| `D:\Projects\billybeez-data-system-mot\BACKUP_INVENTORY.md` | Backup classification and restore mapping | No secret values | Yes, and tracked in Git | `<repo>\BACKUP_INVENTORY.md` |
| `D:\Projects\billybeez-data-system-mot\RESTORE_GUIDE.md` | New-machine restoration procedure | No secret values | Yes, and tracked in Git | `<repo>\RESTORE_GUIDE.md` |
| `D:\Projects\billybeez-data-system-mot\.env.example` | Safe environment-variable template | No secret values | Supplied by Git; copied into package documentation for reference | `<repo>\.env.example` |

## SQLite files included

All SQLite files present in the active database and backup locations at package time are included:

- `prisma\dev.db`
- `backups\before-cashier-separation-2026-09-15T20-50-20-859Z.db`
- `backups\before-english-employee-names-2026-09-15T14-34-49-640Z.db`
- `backups\manual-2026-09-11T11-43-32-992Z.db`
- `backups\manual-2026-09-11T20-09-03-644Z.db`
- `backups\manual-2026-09-14T02-24-42-035Z.db`
- `backups\manual-2026-09-15T01-56-13-340Z.db`
- `backups\manual-2026-09-16T23-06-39-677Z.db`
- `backups\manual-2026-09-17T06-06-33-968Z.db`
- `backups\manual-2026-09-17T21-05-15-982Z.db`
- `backups\pre-leave-time-20260913-020722.db`
- `backups\manual-2026-09-18T08-31-31-249Z.db`
- `backups\manual-2026-09-18T08-45-22-765Z.db`
- `backups\manual-2026-09-23T07-26-05-392Z.db`
- `backups\manual-2026-09-23T20-58-32-170Z.db`
- `backups\manual-2026-09-24T08-52-16-668Z.db`
- `backups\manual-2026-09-24T10-01-28-111Z.db`
- `backups\manual-2026-09-24T10-16-44-618Z.db` (fresh verified backup and package database source)

## Verification baseline

The active database, fresh backup, and the database extracted from the final archive produced the same SHA-256 checksum at verification time. Each was opened independently through Prisma and returned:

- SQLite `integrity_check`: `ok`
- foreign-key errors: `0`
- application tables: `74`
- employees: `16`
- active protected employee documents/photos in the database: `10`
- active employees: `13`
- inactive employees: `3`
- active HRIS employees: `8`
- active Part-Time employees: `5`

The package contains `manifest\SHA256SUMS.txt` and `manifest\PACKAGE_CONTENTS.txt`. Use them to verify extracted files before restoration.

## Package layout

```text
BillyBeez-MOT-restore-2026-09-24T10-16-44Z/
  RESTORE_FIRST.txt
  documentation/
    BACKUP_INVENTORY.md
    RESTORE_GUIDE.md
    CODEX_HANDOFF.md
    .env.example
  repo-overlay/
    .env
    prisma/dev.db
    backups/*.db
    storage/employee-files/
    check-admin.js
    reset-admin.js
    scripts/migrate-bb-oms.js
    artifacts/employee360-closure/*
    output/pdf/*
  manifest/
    SHA256SUMS.txt
    PACKAGE_CONTENTS.txt
```

`repo-overlay` mirrors restore destinations relative to the repository root. Review `RESTORE_GUIDE.md` before copying it over a clone.

## Deliberately not included

| Exact source path or category | Reason |
| --- | --- |
| `D:\Projects\billybeez-data-system-mot\.codex-dev-3008.log` | Development console log; not required to restore behavior and may contain transient operational output |
| `D:\Projects\billybeez-data-system-mot\.codex-dev-3008-error.log` | Development error log; not required to restore behavior and may contain transient sensitive output |
| `D:\Projects\billybeez-data-system-mot\node_modules\` | Reproducible from `package-lock.json` using `npm install` |
| `D:\Projects\billybeez-data-system-mot\.next\` | Reproducible build/cache output using `npm run build` or `npm run dev` |
| `D:\Projects\billybeez-data-system-mot\tmp\` | Empty/transient workspace; no restoration value |
| Windows browser caches and Codex application state | Not application source or Billy Beez operational state |

No known non-Git file required for functional restoration is omitted. Logs are intentionally omitted because they are diagnostic history, not system state.

## Security handling

- Keep the archive on encrypted storage or another access-controlled backup destination.
- Do not email it, upload it to GitHub, or place it in a public cloud folder.
- The local package path is protected with a Windows ACL for the current Windows account and SYSTEM. This is access control, not archive encryption.
- If the archive is copied elsewhere, reapply destination permissions and encryption.
- Rotate the restored `SESSION_SECRET` and any local helper credentials after validating a disaster-recovery copy, unless preserving active sessions is explicitly required.
- Delete temporary extracted copies after validation.
