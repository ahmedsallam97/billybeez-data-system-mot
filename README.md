# BillyBeez Data System MOT

Next.js + Prisma POS/data system for BillyBeez daily operations.

The current active system is the Next.js app. The old Google Apps Script/static HTML files are still kept in the repository as legacy migration references only.

## Current Stack

- Next.js 16
- React 19
- Prisma 6
- SQLite for local operation
- PostgreSQL schema prepared for the next production level
- bcrypt password hashing
- Signed cookie sessions
- Role based API permissions
- Local product images inside `public/products`

## Main Interfaces

| Interface | URL | Purpose |
| --- | --- | --- |
| Login | `http://127.0.0.1:3000/login` | User login |
| Data | `http://127.0.0.1:3000/data` | Add/edit orders, customer exit |
| Kitchen | `http://127.0.0.1:3000/kitchen` | Preparation, delivery, payment, Geidea |
| Manager | `http://127.0.0.1:3000/manager` | Orders, reports, records, settings, activity |
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

| Role | Username | Password |
| --- | --- | --- |
| Admin | `admin` | `admin123` |
| Manager | `manager` | `manager123` |
| Data | `data` | `data112411` |
| Cashier | `cashier` | `cashier112411` |
| Kitchen | `kitchen` | `kitchen123` |

Passwords are hashed in the Prisma database.

## Run Locally

Install dependencies:

```bash
npm install
```

Sync the local SQLite database:

```bash
npm run db:push
```

Seed users, employees, products, and settings:

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
```

Validate PostgreSQL schema:

```bash
$env:POSTGRES_DATABASE_URL="postgresql://user:pass@localhost:5432/billybeez"
npm run db:pg:validate
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

For USB transfer, create a ZIP that excludes:

- `node_modules`
- `.next`
- `.git`
- `tmp`
- `backups`

and include the latest database backup as:

```text
prisma/dev.db
```

Latest USB backup created during this update:

```text
C:\Users\asall\Documents\Codex\2026-06-17\https-chatgpt-com-c-6a2f0385-ba30\work\billybeez-data-system-mot\backups\billybeez-website-usb-backup-20260711-022250.zip
```

## GitHub

Current working branch:

```text
ui-redesign-work-20260701-044749
```

Repository:

```text
https://github.com/ahmedsallam97/billybeez-data-system-mot
```

Latest update scope:

- Modern manager reports dashboard
- Month-to-date default reports calendar
- Payment donut chart with amount/count/percentage cards
- Configurable report KPI card colors and icon URLs from manager settings

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

- PostgreSQL migration is prepared through `prisma/schema.postgres.prisma`.
- Production should use PostgreSQL instead of SQLite.
- Silent printing to a specific remote printer will require a local print agent/service.
- Keep `.env` private and never upload real secrets.
- Do not commit runtime database files, backups, logs, `node_modules`, or `.next`.
