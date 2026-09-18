# Billy Beez Full Restore Guide for Windows

This procedure restores the current Billy Beez system from two sources:

1. GitHub branch `ops-migration-local` for application code and schema.
2. The confidential local restore archive for the SQLite database, `.env`, protected storage, local helpers, and private verification evidence.

The restore archive is expected at:

`D:\Projects\billybeez-system-backups\BillyBeez-MOT-restore-2026-09-18T08-45-22Z.zip`

Never upload the restore archive to GitHub. It contains credentials and employee/operational information.

## Prerequisites

Install on the new Windows machine:

- Git
- a supported current Node.js release with npm
- PowerShell 7 or Windows PowerShell
- enough disk space for the repository, dependencies, build output, database, and extracted archive
- access to `https://github.com/ahmedsallam97/billybeez-data-system-mot.git`
- secure access to the external restore archive

Use an NTFS location controlled by the intended application administrator. Enable BitLocker or equivalent disk encryption where available.

## 1. Clone the application

Open PowerShell in the intended parent directory:

```powershell
git clone https://github.com/ahmedsallam97/billybeez-data-system-mot.git
Set-Location .\billybeez-data-system-mot
git fetch origin
git checkout ops-migration-local
git pull --ff-only origin ops-migration-local
git status --short --branch
```

Confirm that the active branch is `ops-migration-local` and the working tree is clean.

## 2. Install dependencies

```powershell
npm install
```

Do not run the seed script. The restore archive contains the real current database.

## 3. Extract and verify the restore archive

Choose a temporary access-controlled directory outside the repository:

```powershell
$Archive = 'D:\Projects\billybeez-system-backups\BillyBeez-MOT-restore-2026-09-18T08-45-22Z.zip'
$Extracted = 'D:\SecureRestore\BillyBeez-MOT-restore-2026-09-18T08-45-22Z'
New-Item -ItemType Directory -Force -Path $Extracted | Out-Null
Expand-Archive -LiteralPath $Archive -DestinationPath $Extracted -Force
```

Open `RESTORE_FIRST.txt` inside the extracted package. Confirm these required entries exist:

```powershell
$Package = Join-Path $Extracted 'BillyBeez-MOT-restore-2026-09-18T08-45-22Z'
Test-Path (Join-Path $Package 'repo-overlay\.env')
Test-Path (Join-Path $Package 'repo-overlay\prisma\dev.db')
Test-Path (Join-Path $Package 'manifest\SHA256SUMS.txt')
```

Each command must return `True`.

Verify SHA-256 checksums without printing file contents:

```powershell
$Manifest = Join-Path $Package 'manifest\SHA256SUMS.txt'
$Failures = @()
Get-Content -LiteralPath $Manifest | ForEach-Object {
  if ($_ -match '^([0-9a-f]{64})  (.+)$') {
    $Expected = $Matches[1]
    $Relative = $Matches[2].Replace('/', '\')
    $File = Join-Path $Package $Relative
    if (!(Test-Path -LiteralPath $File) -or (Get-FileHash -Algorithm SHA256 -LiteralPath $File).Hash.ToLowerInvariant() -ne $Expected) {
      $Failures += $Relative
    }
  }
}
if ($Failures.Count) { throw "Backup checksum failure: $($Failures -join ', ')" }
'All package checksums passed.'
```

Stop if any checksum fails.

## 4. Restore the database and local files

Set repository and package paths:

```powershell
$Repo = (Get-Location).Path
$Overlay = Join-Path $Package 'repo-overlay'
```

If any database already exists in the new clone, preserve it before replacement:

```powershell
if (Test-Path (Join-Path $Repo 'prisma\dev.db')) {
  New-Item -ItemType Directory -Force -Path (Join-Path $Repo 'backups') | Out-Null
  Copy-Item -LiteralPath (Join-Path $Repo 'prisma\dev.db') -Destination (Join-Path $Repo "backups\pre-full-restore-$((Get-Date).ToString('yyyyMMdd-HHmmss')).db")
}
```

Restore the active database and historical backup set:

```powershell
New-Item -ItemType Directory -Force -Path (Join-Path $Repo 'prisma') | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $Repo 'backups') | Out-Null
Copy-Item -LiteralPath (Join-Path $Overlay 'prisma\dev.db') -Destination (Join-Path $Repo 'prisma\dev.db') -Force
Copy-Item -Path (Join-Path $Overlay 'backups\*.db') -Destination (Join-Path $Repo 'backups') -Force
```

Restore protected employee file storage:

```powershell
New-Item -ItemType Directory -Force -Path (Join-Path $Repo 'storage\employee-files') | Out-Null
if (Test-Path (Join-Path $Overlay 'storage\employee-files')) {
  Copy-Item -Path (Join-Path $Overlay 'storage\employee-files\*') -Destination (Join-Path $Repo 'storage\employee-files') -Recurse -Force -ErrorAction SilentlyContinue
}
```

The storage folder was empty when this package was created. Recreating it is still required so future protected uploads have the correct destination.

Restore `.env` without displaying it:

```powershell
Copy-Item -LiteralPath (Join-Path $Overlay '.env') -Destination (Join-Path $Repo '.env') -Force
```

Restore the local-only helpers and private migration reference:

```powershell
Copy-Item -LiteralPath (Join-Path $Overlay 'check-admin.js') -Destination (Join-Path $Repo 'check-admin.js') -Force
Copy-Item -LiteralPath (Join-Path $Overlay 'reset-admin.js') -Destination (Join-Path $Repo 'reset-admin.js') -Force
New-Item -ItemType Directory -Force -Path (Join-Path $Repo 'scripts') | Out-Null
Copy-Item -LiteralPath (Join-Path $Overlay 'scripts\migrate-bb-oms.js') -Destination (Join-Path $Repo 'scripts\migrate-bb-oms.js') -Force
```

These helper scripts contain sensitive local information. They remain ignored by Git. Do not run the migration helper as normal setup; it is retained only as a private historical/recovery reference.

Restore employee verification evidence if it is required on the new machine:

```powershell
New-Item -ItemType Directory -Force -Path (Join-Path $Repo 'artifacts') | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $Repo 'output') | Out-Null
Copy-Item -Path (Join-Path $Overlay 'artifacts\*') -Destination (Join-Path $Repo 'artifacts') -Recurse -Force
Copy-Item -Path (Join-Path $Overlay 'output\*') -Destination (Join-Path $Repo 'output') -Recurse -Force
```

## 5. Validate environment configuration

Do not print `.env` in a shared terminal or chat. Check only that required keys exist:

```powershell
$RequiredKeys = @('DATABASE_URL', 'SESSION_SECRET', 'AUTH_COOKIE_NAME')
$DefinedKeys = Get-Content -LiteralPath .env | Where-Object { $_ -match '^\s*[A-Za-z_][A-Za-z0-9_]*\s*=' } | ForEach-Object { ($_ -split '=', 2)[0].Trim() }
$Missing = $RequiredKeys | Where-Object { $_ -notin $DefinedKeys }
if ($Missing) { throw "Missing environment keys: $($Missing -join ', ')" }
'Required environment keys are present.'
```

For the restored package, `DATABASE_URL` should resolve to the SQLite database under `prisma\dev.db`. Do not replace the restored secret with the placeholder from `.env.example`.

For a long-lived copy on a new machine, generate a new strong `SESSION_SECRET` after the first successful validation unless existing browser sessions must remain valid. Changing it logs out existing sessions but does not alter database data.

## 6. Generate Prisma Client without changing the database

```powershell
npx prisma generate
npx prisma validate
```

Do not run `npm run db:push` during a normal full restore. The archived database already contains the required schema and data. Do not run `npm run db:seed`.

## 7. Verify the restored database

Verify the archived recovery point header:

```powershell
npm run db:verify-backup -- .\backups\manual-2026-09-18T08-45-22-765Z.db
```

Run the application tests and build:

```powershell
npm test
npm run lint
npm run build
```

Open the restored database in read-only mode and run SQLite integrity and count checks:

```powershell
@'
const path = require('path');
const { PrismaClient } = require('@prisma/client');
const file = path.resolve('prisma/dev.db').replace(/\\/g, '/');
const db = new PrismaClient({ datasources: { db: { url: `file:${file}` } } });
(async () => {
  const integrity = await db.$queryRawUnsafe('PRAGMA integrity_check');
  const foreignKeys = await db.$queryRawUnsafe('PRAGMA foreign_key_check');
  const counts = await db.$queryRawUnsafe('SELECT active, employmentType, COUNT(*) AS count FROM Employee GROUP BY active, employmentType ORDER BY active, employmentType');
  console.log({
    integrity: Object.values(integrity[0] || {})[0],
    foreignKeyErrors: foreignKeys.length,
    employeeCounts: counts.map((row) => ({ active: Boolean(row.active), employmentType: row.employmentType, count: Number(row.count) })),
  });
})().finally(() => db.$disconnect());
'@ | node
```

This command prints only aggregate counts and integrity results. It does not print employee names or secret values.

Expected baseline at package creation:

- 52 tests passing;
- UI audit passing;
- production build passing;
- SQLite integrity `ok`;
- 16 employees total;
- 13 active employees;
- 3 inactive employees;
- 8 active HRIS employees;
- 5 active Part-Time employees.

If these counts differ immediately after restoration, stop and confirm that the correct `dev.db` and `.env` were restored.

## 8. Start the application

```powershell
npm run dev
```

Open:

`http://127.0.0.1:3008`

Do not expose the development server directly to the public internet.

## 9. Functional validation

Use an authorized local account and verify:

1. Login succeeds and routes to the correct role home.
2. Employee list reports 16 total and 13 active.
3. Employee 360 opens Overview, Personal, Employment, Documents, Schedule & Attendance, Leaves, Performance, Training & Qualifications, Recognition, Timeline, and Files.
4. Existing schedule history and the published monthly roster load.
5. Daily roster, attendance defaults, rotations, and daily evaluations load without API errors.
6. Recognition and Complete Employee File print previews render.
7. Protected document routes require authentication and do not expose a public static URL.
8. Settings load role, roster, position, phrase, and inventory configuration.
9. Existing POS orders/products and business-day controls load.

At package creation, employee storage contained no actual photo/document binary files. Database document metadata may exist from reversible workflow testing, but no required stored binary was present. An unavailable historical binary should be reported honestly rather than replaced with fabricated content.

## 10. Secure the restored machine

- Restrict NTFS access to `.env`, `prisma\dev.db`, `backups\`, `storage\`, `artifacts\`, `output\`, and local helper scripts.
- Enable disk encryption.
- Keep production backups in a second approved location.
- Delete the temporary extracted package after validation.
- Do not commit ignored files.
- Rotate any development-only administrator credential before wider use.
- Never run seed/reset helpers against the restored operational database without an explicit, verified recovery plan.

## 11. Rollback if validation fails

Stop the server. Preserve the failed restored database for diagnosis, then replace `prisma\dev.db` with `backups\manual-2026-09-18T08-45-22-765Z.db`. Repeat database verification before restarting.

If package checksums fail, do not restore from the damaged archive. Return to the original machine and create a new backup package from the verified active database.
