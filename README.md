# Billy Beez MOT Operations System

Next.js + Prisma POS/data system for BillyBeez daily operations.

The current active system is the Next.js app. The old Google Apps Script/static HTML files are still kept in the repository as legacy migration references only.

This branch is the stable daily-operation version. Larger upgrades should continue on a separate upgrade branch/worktree so this version can still be run when needed.

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
| Operations | `/operations` | Roster, attendance, schedule, daily setup, Employee 360, and recognition |
| Settings | `/settings` | Operations rules, templates, shifts, roles, and configuration |
| Data | `/data` | Add/edit orders, customer exit |
| Kitchen | `/kitchen` | Preparation, delivery, payment, Geidea |
| Manager | `/manager` | Orders, reports, records, settings, activity |
| Database Studio | `http://127.0.0.1:5555` | Prisma Studio database browser |

`/cashier` now redirects to `/data`.

## Roles

Current roles in the database:

- `ADMIN`
- `MANAGER`
- `CASHIER`
- `KITCHEN`
- `DATA`

`DATA` is the main role for the data interface. `CASHIER` remains available as a separate role for future cashier-specific users.

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

## Features

- Data interface for order creation and editing
- Kitchen interface for preparation, delivery, payment, and Geidea registration
- Manager interface with orders, reports, records, settings, activity, and health checks
- Business day open/close workflow
- Order history and archive/unarchive
- Duplicate bracelet protection for active orders
- Order merge tools for managers
- Transaction records for order lifecycle events
- Alerts configurable from manager settings
- Employee styling configurable from manager settings
- Product/category management
- User management with general and employee-linked accounts
- Kitchen ticket print flow
- Invoice print flow
- Daily reports and export support
- Modern reports dashboard with area chart, donut chart, KPI cards, activity, and top orders
- Report cards configurable from manager settings: icon URL, gradient colors, and text color
- Local product images, no random external image URLs

## Important Workflow Rules

- Payment is blocked until delivery unless workflow settings allow otherwise.
- Geidea registration can auto-archive an order only after the customer has left.
- Orders should not archive before data marks customer exit.
- Active bracelet numbers are protected to avoid duplicate current orders.
- Manager/Admin have broader permissions for editing, archive control, and settings.

## Legacy Files

These files remain for migration/reference:

- `index.html`
- `cashier.html`
- `delivery.html`
- `invoice.html`
- `dashboard.html`
- `orders.html`
- `config.js`
- `code.gs`
- `appsscript.json`

The active app is under:

```text
app/
lib/
prisma/
scripts/
tests/
public/
```

## Notes For Next Level

- `prisma/schema.postgres.prisma` is generated from the authoritative SQLite schema. Rehearse migration on an isolated PostgreSQL database before cutover.
- Multi-instance production should use PostgreSQL and the S3-compatible employee-file provider instead of local SQLite and local protected-file storage.
- Silent printing to a specific remote printer will require a local print agent/service.
- Keep `.env` private and never upload real secrets.
- Do not commit runtime database files, backups, logs, `node_modules`, or `.next`.
