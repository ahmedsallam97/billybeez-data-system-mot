# Billy Beez MOT Operations System

Next.js + Prisma Operations Management System for Billy Beez.

This branch is the enabled workplace application, with `/opmanager` as the Operations dashboard. Globally excluded POS/Core and old Apps Script routes, dedicated APIs, components and exclusive tools have been separated from this active code. Their complete code-only source remains recoverable on `archive/full-system-before-separation`. All existing database tables and historical records remain compatible; no database cleanup or destructive migration is part of separation.

Treat `active-workplace-base` as the clean integration base. Develop changes on a separate branch/worktree. Follow [OLD_LAPTOP_APP_INTEGRATION.md](OLD_LAPTOP_APP_INTEGRATION.md) before integrating any recovered application.

## Current Stack

- Next.js 16
- React 19
- Prisma 6
- SQLite for local operation
- PostgreSQL parity schema generated from the authoritative SQLite schema
- bcrypt password hashing
- Signed cookie sessions
- Role based API permissions
- Protected employee files on local storage by default, with an S3-compatible provider available
- Authenticated Playwright browser tests for critical Operations paths

## Main Interfaces

| Interface | URL | Purpose |
| --- | --- | --- |
| Login | `/login` | User login |
| Operations Management | `/opmanager` | ADMIN/MANAGER home and Operations insights |
| Operations | `/operations` | Roster, attendance, schedule, daily setup, Employee 360, and recognition |
| Settings | `/settings` | Operations rules, templates, shifts, roles, and configuration |
Legacy `/manager`, `/front`, `/data`, `/cashier`, `/kitchen`, `/kitchen-cashier`, order invoices and kitchen tickets have no page routes in this branch. Their dedicated POS/Core APIs are absent and direct requests return 404. Existing active Operations redirects, user accounts, permissions and shared APIs remain intact.

Operations clients use `/api/operations/settings`, which allows only explicit Operations keys. `BUSINESS_DAY_PASSWORD` stays in the legacy subsystem and is neither readable nor editable through this endpoint. Shared `/api/settings` continues to redact secret values for legacy compatibility.

## Roles

Current roles in the database:

- `ADMIN`
- `MANAGER`
- `CASHIER`
- `KITCHEN`
- `DATA`

Operations access continues to use the existing account profiles and permission scopes. Legacy role metadata remains for database compatibility; removing old pages does not grant those roles access to Operations workflows.

## Departments

Current employee departments:

- `OPERATION`
- `CASHIER`
- `KITCHEN`

Old `RESTAURANT` values are mapped/migrated to `KITCHEN`.

## Seed Users

Seeding is only for a new disposable database. It no longer contains published default passwords. Before running `npm run db:seed`, set every `SEED_*_PASSWORD` variable listed in `.env.example` to a unique value of at least 12 characters. Never run the seed command during a full restore of the current system.

## Run Locally

Install dependencies:

```bash
npm install
```

Sync the local SQLite database:

```bash
npm run db:push
```

Seed a new disposable database only after supplying the required seed passwords:

```bash
npm run db:seed
```

Build production assets:

```bash
npm run build
```

Run the production server:

```bash
npm run start
```

Open:

```text
http://127.0.0.1:3000/login
```

## Database Studio

Start Prisma Studio:

```bash
npm run db:studio
```

Open:

```text
http://127.0.0.1:5555
```

## Development Mode

For development only:

```bash
npm run dev
```

Production testing should use:

```bash
npm run build
npm run start
```

This avoids the Next.js dev indicator and gives a more accurate speed test.

## Validation

Run UI/static audit:

```bash
npm run lint
```

Run workflow tests:

```bash
npm test
npm run test:e2e
```

Synchronize and validate the PostgreSQL parity schema:

```bash
npm run db:pg:sync-schema
$env:POSTGRES_DATABASE_URL="postgresql://user:password@localhost:5432/isolated_billybeez_validation"
npm run db:pg:validate
npm run db:pg:status
npm run db:pg:migrate
Remove-Item Env:POSTGRES_DATABASE_URL
```

## Backup And Restore

Create a manual database backup:

```bash
npm run db:backup
```

Backups are created in:

```text
backups/
```

Restore a backup:

```bash
npm run db:restore
```

Verify a backup:

```bash
npm run db:verify-backup
```

For a complete machine restore, GitHub alone is not sufficient because `.env`, SQLite databases, protected employee files, and private recovery helpers are deliberately ignored. Follow `BACKUP_INVENTORY.md` and `RESTORE_GUIDE.md` and use the current confidential non-Git restore package documented there.

## GitHub

Current working branch:

```text
ops-migration-local
```

Repository:

```text
https://github.com/ahmedsallam97/billybeez-data-system-mot
```

Latest update scope:

- Daily roster, rotations, attendance, evaluation, trips, birthdays, offers, stock, and schedule workflows
- Employee 360 with protected documents, feedback, guidance, incidents, annual files, and merged PDF attachments
- Settings-driven shifts, roster rules, stock, recognition templates, colors, and messages
- Generated PostgreSQL parity schema and local/S3-compatible employee-file storage
- Unit, UI audit, build, and authenticated browser validation

## Enabled Workplace Workflows

- Operations dashboard, employees and Employee 360.
- Published monthly schedules, attendance, roster, configurable rotation generation and distribution preview.
- Trips, birthdays, offers, stock, leave and time.
- Trip, Birthday and Shift Leader reports, source evidence, approvals and files.
- Daily and monthly evaluations, Recognition, Guest Feedback, Employee of the Month and Hall of Fame.
- Succession, development, manual readiness decisions and performance reports.
- Settings, users, roles, scoped permissions, audit, printing and PDFs.
- Persistent deployment, protected storage, encrypted backup/restore and sanitized pilot tooling.

## Full Source Recovery

The remote branches `ops-migration-local` and `archive/full-system-before-separation` retain the sanitized full source. Recover legacy source into a separate review worktree; do not merge it wholesale into the enabled workplace application. All Prisma schemas and migrations are retained unchanged here.

## Notes For Next Level

- `prisma/postgres/schema.prisma` is generated from the authoritative SQLite schema and `prisma/postgres/migrations/` contains reviewed, versioned PostgreSQL migrations. Rehearse `npm run db:pg:migrate` on an isolated PostgreSQL database before cutover.
- Multi-instance production should use PostgreSQL and the S3-compatible employee-file provider instead of local SQLite and local protected-file storage.
- Silent printing to a specific remote printer will require a local print agent/service.
- Keep `.env` private and never upload real secrets.
- Do not commit runtime database files, backups, logs, `node_modules`, or `.next`.
