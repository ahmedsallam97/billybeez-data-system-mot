# Codex Project Handoff

## Read this first

This file is the continuity document for a new developer or Codex session with no access to the conversation that produced the current branch. Read it before changing code or data.

The active branch is `ops-migration-local`. It is published to `origin/ops-migration-local`. The current implementation commit is `dba9123` (`feat: finish inventory reservations and roster exports`). The branch was created from `origin/next-level-upgrade` at `a34f409`.

The local SQLite database, employee files, backups, generated screenshots, generated PDFs, local migration helpers, logs, and environment files are deliberately not in Git. Git contains application code and schema only. Never infer that cloning this branch recreates the current local operational data.

## Project purpose

This repository is the Billy Beez MOT branch operations and POS system. It combines:

- point-of-sale and order workflows;
- staff, role, and permission management;
- Employee 360 profiles and annual employee files;
- monthly scheduling, daily attendance, rotations, and evaluation;
- leave, overtime, appraisal, recognition, and succession foundations;
- daily operational information such as trips, birthdays, offers, notices, and wristband stock;
- management settings, health checks, audit history, and operational insights.

The active application is the Next.js application under `app/`. Root-level static HTML, Apps Script, and early JavaScript files are legacy migration references and are not the active runtime.

## Current state

As of 2026-09-24:

- the code is on `ops-migration-local` and is pushed to GitHub;
- `npm test` passes all 60 tests;
- `npm run build` succeeds and builds 49 pages/routes;
- `npm run lint` (the repository UI audit) passes;
- the development server is configured for `http://127.0.0.1:3008`;
- the current local SQLite database passes integrity checking;
- the local employee population remains 16 total, 13 active, and 3 inactive;
- the 13 active operational employees consist of 8 HRIS and 5 Part-Time records;
- inactive employees were preserved and were not deleted, merged, or normalized away;
- Employee 360 and the current Live Daily Operations workflows are implemented and runtime-smoke-tested;
- the roster automatically creates a rules-based rotation when a published day has no plan;
- cashier fallback, Team Leader exclusion, per-shift eight-hour headings, merged role bands, and non-overlapping rotation assignment are active;
- trips and birthdays support create/edit/delete, reusable contacts, meal counts, stock-driven bracelet color/material display, and reservation/release of bracelet quantities;
- schedule import/export includes both Operations and Cashier departments, with direct downloadable PDF, XLSX, browser print, and distinct cancel/delete draft actions;
- `/settings` contains both the Operations settings/insights center and the previous management settings experience;
- Guest Feedback, Guidance/Penalties, and Incidents remain intentional placeholders;
- no pull request was created as part of this handoff.

The current local database also contains 23 schedules and 9,087 schedule assignments. These figures describe the local database and are not seed data committed to Git.

## Important recent commits

- `dba9123` — `feat: finish inventory reservations and roster exports`
  - reserves bracelet inventory for trip/birthday headcount, adjusts reservations on edit, and releases them on cancellation;
  - assigns eligible bracelet stock to future pending events when stock is entered after the event;
  - adds a direct downloadable monthly-schedule PDF and includes Cashier rows and department data in XLSX export;
  - removes duplicate active local `WF Weekend` offers while retaining one configured recurring offer;
  - validated by 60 tests, UI audit, production build, Prisma validation, authenticated export checks, and rendered PDF inspection.
- `2072b98` — `feat: complete operations roster and planning workflows`
  - adds automatic primary/backup cashier fallback without hardcoded employee identifiers;
  - completes rules-driven rotation generation, manual-lock preservation, position priority/staffing settings, and cashier coverage;
  - adds trip/birthday edit/delete, stock bracelet materials, sock colors, schedule Print/PDF, and management settings consolidation;
  - adds direct file sharing where the browser supports Web Share, with safe clipboard/download fallback for WhatsApp;
  - validated by 59 tests, UI audit, production build, and live browser smoke testing at that commit.
- `412c7cf` — `feat: simplify operations planning and stock`
  - establishes the current operations sidebar, separate planning workspaces, schedule colors, daily defaults, and roster presentation.
- `40954ba` — `feat: complete Employee 360 and operations workflows`
  - consolidates the safe Employee 360, Operations, schema, API, UI, tests, and documentation changes;
  - excludes generated employee screenshots/PDFs and a local migration helper containing employee identifiers;
  - adds protection for local storage, backups, logs, environment files, generated artifacts, and local admin helpers.
- `a34f409` — `Complete upgraded POS workflows and manager dashboards`
  - base commit on `origin/next-level-upgrade`.

Run `git log --oneline --decorate -10` for the latest exact history. This handoff document is committed separately after the implementation commit.

## Branch and remote structure

- Active branch: `ops-migration-local`
- Tracking branch: `origin/ops-migration-local`
- Base branch: `next-level-upgrade`
- Base remote branch: `origin/next-level-upgrade`
- Remote: `https://github.com/ahmedsallam97/billybeez-data-system-mot.git`

The earlier local implementation history was consolidated before its first push so generated files and personal employee mapping data would not remain in reachable Git history. Do not reintroduce those files from local backups or reflogs.

## Architecture and main technologies

- Next.js 16 App Router
- React 19
- Prisma 6
- SQLite for the current local operational database
- bcrypt password hashing
- HMAC-signed, HTTP-only authentication cookies
- server-side permission checks through a configurable role matrix
- local protected file storage for the current employee photo/document implementation
- Node's built-in test runner
- custom repository UI audit in `scripts/ui-audit.js`

The application uses server routes under `app/api/`, Prisma through `lib/db`, and shared business rules under `lib/`. Most Operations-specific domain logic is under `lib/operations/`.

## Main folders

- `app/` — active Next.js pages, layouts, components, and API routes.
- `app/api/operations/` — Operations, Employee 360, roster, attendance, evaluation, leave, performance, recognition, schedule, and health APIs.
- `app/operations/` — Operations shell and workspaces, Employee 360, Daily Operations, annual employee file, recognition, and previews.
- `app/settings/` — Operations management/settings center.
- `lib/` — authentication, authorization, audit, settings, Prisma access, shared POS logic, and role definitions.
- `lib/operations/` — schedule, roster, live daily operations, employee aggregation, attendance, leave, overtime, recognition, succession, and Employee 360 helpers.
- `prisma/` — the authoritative SQLite schema, a legacy/incomplete PostgreSQL schema, and seed/migration support.
- `tests/` — unit and focused integration-style tests for existing POS and the new Operations/Employee 360 behavior.
- `scripts/` — database backup/restore/verification, UI audit, import, seed, and maintenance scripts.
- `docs/` — Operations migration plan and reconciliation notes. These contain aggregate migration facts only, not the private employee mapping.
- `public/` — public static application assets. Employee documents must never be stored here.
- `backups/` — local database backups, ignored by Git.
- `storage/employee-files/` — local protected employee uploads, ignored by Git.
- `artifacts/` and `output/` — generated screenshots/PDFs, ignored where they may contain employee information.
- `tmp/` — temporary local working files, ignored by Git.

## Database and schema overview

`prisma/schema.prisma` is the authoritative schema for the current SQLite implementation.

Core areas include:

- `User` and `Employee` identities and role linkage;
- Employee 360 additions:
  - `EmployeeDocument`;
  - `EmployeeEmploymentEvent`;
  - `EmployeeTrainingRecord`;
  - `EmployeeQualification`;
- existing POS catalog, orders, customers, loyalty, devices, payments, audit, print, business-day, settings, and history models;
- employment periods, assignments, and weekly-off information;
- Operations schedules, codes, shift definitions, assignments, and validation runs;
- attendance days, attendance records, and corrections;
- leave accounts, transactions, bookings, allocations, and official holidays;
- overtime accounts and transactions;
- operational days, operational positions, and staffing requirements;
- rotation plans, hourly assignments, and breaks;
- trips, birthday/events, offers, partners, reusable customers, notices, and wristband stock;
- evaluation criteria versions, criteria, deductions, daily evaluation days, employee scores, and exceptions;
- monthly appraisal formulas and month-close records;
- Employee of the Month formulas, competitions, and candidates;
- succession candidates, development actions, and reviews.

The Employee 360 aggregation reads existing operational source records. It does not duplicate schedule, attendance, evaluation, appraisal, recognition, or leave history. The unified timeline is derived at API time instead of being persisted as a second timeline table.

`prisma/schema.postgres.prisma` does not yet match the expanded SQLite schema. Treat it as incomplete migration scaffolding. Do not run `npm run db:pg:push` against a real database until the PostgreSQL schema is reconciled and reviewed.

## Roles and permissions

Current roles are:

- `ADMIN`
- `MANAGER`
- `CASHIER`
- `KITCHEN`
- `DATA`

Default role homes are defined in `lib/roles.js`:

- ADMIN and MANAGER: `/manager`
- CASHIER and DATA: `/data`
- KITCHEN: `/kitchen`

`lib/role-matrix.js` defines permission defaults. `lib/api-auth.js` loads the configured `ROLE_PERMISSION_CONFIG` setting and falls back safely to the code matrix.

ADMIN and MANAGER intentionally retain compatible access to sensitive employee profiles, documents, full employee files, schedules, attendance, evaluations, leave, appraisal, Employee of the Month, succession, health, and management workflows. Do not tighten those two roles without an explicit migration and acceptance plan.

All employee document upload/removal actions require employee-management permission. File view/download requires the sensitive-employee-read permission. Files are served through the protected route with private/no-store and no-sniff headers. There is no public employee document URL.

Authentication uses bcrypt-hashed database passwords and an HMAC-signed HTTP-only cookie. `SESSION_SECRET` is mandatory and must contain at least 32 characters. Production cookies are secure by default.

## Billy Beez business rules

### Employee data

- Preserve 16 employee records: 13 active and 3 inactive.
- Active operational mapping remains 8 HRIS plus 5 Part-Time.
- Do not delete, merge, or rewrite inactive employees for cosmetic cleanup.
- English employee names are the default display source throughout the site.
- Roster-specific two-name labels can be configured manually without changing the employee's legal/full record.
- Existing Operational Positions are the qualification catalog. Do not introduce a second position table.
- Do not fabricate employee history, training, documents, recognition, incidents, or timeline events.

### Employee 360

- History tabs must show real employee-specific records when detail exists, not counters alone.
- Schedule, attendance, daily evaluation, appraisal, recognition, training, qualification, and employment history are read from their real sources.
- Leave and overtime must show honest empty states when there are no transactions.
- Employee photos and documents share the protected `EmployeeDocument` source.
- The active employee photo is also used by Employee of the Month and Hall of Fame views.
- Employees without an active photo use initials fallback.
- Photo replacement marks the previous active photo `REPLACED`; removal is a soft `REMOVED` state.
- Document status, type, issue/expiry dates, notes, uploader, and upload time are metadata, not inferred content.
- The Complete Employee File is year-based and supports current-year-to-date data.
- Complete Employee File modes are Standard, Management, Full Restricted, and Custom sections.
- English and Arabic are separate full-language views; do not mix labels in a single exported copy.
- Browser print is the supported Save-as-PDF path.
- Attachment merging is explicitly deferred. Never claim original attachments are embedded in the PDF.
- Employee AI output is advisory, generated from recorded data for the selected employee/year, and must never make an automatic HR decision.

### Scheduling, roster, and rotations

- Monthly schedules use DRAFT, PUBLISHED, and SUPERSEDED versions.
- Import, XLSX export, and direct downloadable PDF export are part of the scheduling workflow.
- Operations and Cashier schedule groups are separate and come from employee department/configuration.
- The daily roster is sourced from the published monthly schedule.
- Standard shifts are:
  - AM: 10:00–18:00;
  - BW: 13:00–21:00;
  - PM: 15:00–23:00.
- If a real trip requires a 09:00 opening, AM becomes 09:00–17:00 for that day.
- Each shift displays exactly eight hourly rotation slots based on that shift's times.
- Do not show BW when no BW employee is scheduled.
- Do not render filler employee rows.
- A cashier appears first in each applicable shift and receives no rotation assignment.
- A configured Team Leader receives no rotation assignment.
- A combined Cashier + Team Leader gets one combined role band.
- Cashier, Team Leader, male, and female roster styles are distinct configuration/display states.
- The three primary cashiers and backups are operational settings/data. They are deliberately not hardcoded in Git.
- Cashier names and other employee personal identifiers must not be added to source defaults.
- Rotation generation must honor position qualifications, mandatory positions, priorities, and staffing requirements.
- A position with no qualification records at all is treated as qualification-not-required. Once qualifications exist for that position, they gate assignment.
- The generator must not assign two overlapping employees to the same operational position in the same hour.
- Generated rotations are deterministic for the same input/day while still rotating assignments fairly.
- `DATA` is the default mandatory position in the current settings, but settings remain authoritative.
- The roster supports image generation/copy and a direct WhatsApp opening flow; printing/PDF uses the roster preview.

### Attendance and evaluation

- Attendance in/out defaults come from the scheduled shift, while remaining editable.
- Daily employee evaluations open with each configured criterion at 10/10.
- Supervisors can save one row or save all, then review/approve according to status rules.
- Default values are convenience defaults, not proof that work or attendance occurred.

### Daily operations content

- Trips, birthdays, offers, and stock each have independent workspaces.
- Trip partners and birthday customers are reusable records so recurring organizations/customers are not re-entered every time.
- Trips capture organization, supervisor/contact, schedule, meal types and counts, and related details.
- Birthdays capture customer/child/contact, date/time, meal counts, and party-room duration.
- Offers may be permanent or date-ranged and may show before/after pricing.
- Stock categories are separate: socks, wristbands, cash rolls, and Visa rolls.
- Wristband material/color and inventory drive roster display; do not hardcode live stock.
- Future trips and birthdays reserve wristbands by expected headcount. Editing headcount adjusts the reservation and cancellation releases it.
- The current stock design also accounts for sock sizes/colors and selectable wristband colors/materials.
- Offers and wristband sections use full width when there are no trip/birthday cards. Empty trip/birthday cards are hidden.
- Twenty editable motivational phrases rotate by day and replace the old static slogan.
- Leave labels use the same schedule color vocabulary as the monthly schedule.

### POS compatibility

- Payment is normally blocked until order delivery unless the relevant setting explicitly permits it.
- Archive eligibility depends on the order workflow, including payment, Geidea registration where required, and customer-left state.
- Active bracelet codes remain unique.
- ADMIN and MANAGER retain broad POS edit, archive, and settings access.

## Features completed

### Employee 360

- Overview, Personal, Employment, Documents, Schedule & Attendance, Leaves & Balances, Performance, Training & Qualifications, Recognition, Timeline, and Files tabs.
- Clean placeholders for Guest Feedback and Guidance & Penalties.
- Real source aggregation without duplicate history tables.
- Protected photo/document upload, view, download, replacement, and soft removal.
- Initials fallback and shared recognition photo source.
- Employment events, training records, and qualifications linked to existing positions.
- Unified derived timeline.
- Annual/YTD Complete Employee File with year picker and access modes.
- Standard, Management, Full Restricted, and Custom print views.
- Separate Arabic/English view support in the intended workflow.
- Employee intelligence/AI page using recorded facts and a selected reporting year.

### Operations

- Operations navigation ordered around the supervisor workflow: roster, attendance, daily evaluation, then supporting areas.
- Separate roster, attendance, evaluation, schedule, trips, birthdays, offers, stock, leave/time, employees, performance, and health/settings workspaces.
- Monthly schedule version workflow, live edit, validation, publish, cancel/delete draft, import, and export.
- Daily roster and printable approval/display template.
- Eight-slot per-shift rotation layout and rule-aware generator.
- Cashier/Team Leader exclusion and merged role bands.
- Attendance defaults and editable daily records.
- Daily evaluation defaults plus per-row and save-all actions.
- Reusable trip partners and birthday customers.
- Offer before/after pricing and permanent/ranged scheduling.
- Separated inventory categories, event-linked bracelet reservations, and settings-driven daily content.
- Management settings/insights page at `/settings`.
- Dashboard top performers, bottom performers, and actionable operational insights.
- Employee of the Month artwork and Hall of Fame views.

## Features partially completed or intentionally deferred

- Guest Feedback is a labeled placeholder only.
- Guidance, Penalties, and Incidents are labeled placeholders only.
- Complete Employee File attachment merging is not implemented.
- Employee file storage is local filesystem storage. It needs object storage before stateless/multi-instance deployment.
- PostgreSQL schema migration is incomplete and must be reconciled with SQLite.
- The project lacks a full automated browser end-to-end suite.
- Roster gender and Team Leader fields are configurable, but historical/local records may still be null until a manager configures them. Name-based gender inference exists only as a presentation fallback.
- Some operational staffing requirements exceed the currently available scheduled team. The latest local plan reports 32 genuine coverage warnings; this is an operational capacity/configuration gap, not a duplicate-assignment bug.
- The settings and Daily Operations interfaces have been heavily revised but still need continued real-user visual review at common desktop widths and print sizes.

## Known bugs and limitations

- `README.md` is stale in several places: it still references an older branch/port flow and includes development seed credential examples. Do not treat those credentials as production-safe. Update or remove that section and rotate any reused credentials.
- `prisma/schema.postgres.prisma` is not aligned with the active SQLite schema.
- There is no committed deployment pipeline or production infrastructure definition.
- SQLite and local upload storage are single-host state. They require persistent volumes, backup discipline, and single-writer considerations.
- Generated screenshots and PDFs are not versioned because they can reveal employee information.
- The repository's UI audit is useful but is not a substitute for assistive-technology testing or browser E2E coverage.
- Direct browser print behavior can vary by browser; Complete Employee File and roster print layouts should be visually checked after CSS changes.

No currently reproduced runtime-blocking roster API error remains in the committed code. If `Unexpected end of JSON input` returns, inspect the server terminal first: it previously indicated an API/server failure rather than valid empty data.

## Technical debt

- Reconcile and test a PostgreSQL schema/migration path.
- Move employee files to protected object storage with signed or authenticated access.
- Add Playwright or equivalent E2E coverage for schedule publish, daily roster, attendance, evaluation, Employee 360 uploads, protected downloads, and print previews.
- Break up the large `DailyWorkspace.jsx` and `DailyApprovalPreview.jsx` components.
- Replace alert-based client feedback with consistent form validation and notifications.
- Add explicit schema migrations instead of relying only on `prisma db push` for production evolution.
- Refresh README setup, port, branch, credential, and deployment documentation.
- Add retention/cleanup rules for soft-removed employee files and replaced photos.
- Add localization coverage tests for full Arabic and full English exports.
- Add a formal data retention/privacy policy for employee documents and generated reports.

## Recent implementation decisions

- The current Phase 2 Employee 360 requirements were the source of truth because the original EMP-001 document was unavailable.
- All schema work was additive. Existing migrated tables/fields were not renamed or dropped for cleanup.
- Existing Operations records remain the source of employee history.
- The timeline is aggregated instead of persisted again.
- Operational Positions are reused for qualifications.
- Employee document binaries are stored outside `public/` and accessed only through authorized API routes.
- ADMIN and MANAGER sensitive access compatibility was preserved.
- AI is isolated in an employee intelligence experience and does not alter employee records or make decisions.
- The management control experience is named Settings and follows the previous manager-page structure while adding insights.
- Employee names default to English across the site; the roster can use manager-configured two-name labels.
- The roster is a dedicated sidebar page and uses a fixed compact navigation pattern intended to preserve content width.
- Cashier assignments are settings/data driven; hardcoded employee identifiers were removed from source.
- Browser schedule exports now provide a generated PDF download and a Cashier-inclusive XLSX; browser printing remains a separate action.
- Bracelet availability means cashier plus warehouse stock minus allocated and issued quantities. Trip/birthday lifecycle actions maintain allocations.
- The local duplicate active `WF Weekend` offers were consolidated to one recurring Thursday/Friday/Saturday offer; this is local operational data, not a hardcoded source default.
- Generated evidence containing employee information is local-only and ignored by Git.

## Local-only context not represented by Git data

- Latest verified local counts: 16 total employees, 13 active, 3 inactive, 8 active HRIS, 5 active Part-Time.
- SQLite integrity was verified as `ok` before the Employee 360 schema changes and again during closure work.
- Pre-change backup: `backups/manual-2026-09-14T02-24-42-035Z.db`.
- Latest verified backup: `backups/manual-2026-09-24T10-16-44-618Z.db`.
- Full confidential non-Git restore package: `D:\Projects\billybeez-system-backups\BillyBeez-MOT-restore-2026-09-24T10-16-44Z.zip`.
- Read `BACKUP_INVENTORY.md` and `RESTORE_GUIDE.md` before restoring. The archive remains local and must never be uploaded to GitHub.
- The local database contains the operational schedule/history and must not be reseeded or reset.
- The latest local rotation plan at handoff is V1 for 2026-09-24 with 13 DATA assignments, merged cashier bands, no cashier rotations, and no duplicate employee/hour or position/hour assignment. Optional positions were correctly withheld because the published day includes leave records and `optionalOnlyWhenFullyStaffed` is enabled.
- A local ignored migration helper exists at `scripts/migrate-bb-oms.js`. It contains private employee reconciliation data and a source-database path. Do not commit, publish, or treat it as a supported repeatable migration. The reconciliation is already complete.
- Local ignored admin helper scripts and development logs may contain credentials or sensitive output. Do not commit them.
- Generated Employee 360 screenshots and a restricted employee PDF were retained locally for verification but deliberately excluded from Git.

## Environment variables

Create a local `.env` from `.env.example`, then add the required variables. Never commit `.env`.

- `DATABASE_URL` — required Prisma database URL. The local default is a SQLite file URL.
- `SESSION_SECRET` — required; at least 32 characters; use a cryptographically random value.
- `AUTH_COOKIE_NAME` — optional cookie-name override.
- `COOKIE_SECURE` — optional; use `false` only for local HTTP development. Production defaults to secure cookies.
- `POSTGRES_DATABASE_URL` — only for future PostgreSQL schema validation/migration after the schema is reconciled.

Do not put secret values, API keys, passwords, access tokens, or production database URLs in documentation, scripts, commits, screenshots, or issue text.

## Local setup and run instructions

1. Install a supported current Node.js version and npm.
2. Clone the repository and check out `ops-migration-local`.
3. Run `npm install`.
4. Copy `.env.example` to `.env`.
5. Set `SESSION_SECRET` and confirm `DATABASE_URL` points to the intended local database.
6. For a new disposable development database only, run `npm run db:push`, then seed only if demo data is explicitly wanted.
7. Run `npm run dev`.
8. Open `http://127.0.0.1:3008`.

Validation commands:

```text
npm test
npm run lint
npm run build
```

Production-style local start uses `npm run start` on port 3000 after `npm run build`. Review the Windows-specific environment syntax in that script before using it on Linux or in a deployment platform.

## Database migration and setup

- Back up the database and record counts before every schema change.
- Run the SQLite integrity check before and after risky data work.
- Prefer additive schema changes.
- Do not rename or drop migrated fields/tables for cosmetic cleanup.
- Use `npm run db:push` only after reviewing the exact Prisma diff against the intended database.
- Do not run `npm run db:seed` against the current operational database. It is intended for a disposable/demo database and may overwrite or create unwanted records.
- Do not run the ignored `scripts/migrate-bb-oms.js` as a routine setup step.
- Do not run PostgreSQL push commands until `prisma/schema.postgres.prisma` is brought into parity and validated on an isolated database.

For a new clean environment, schema creation and seed behavior must be tested on a disposable database first. For an existing Billy Beez database, preserve operational history and reconcile by stable identifiers rather than names.

## Backup and restore

Available scripts:

- `npm run db:backup`
- `npm run db:verify-backup -- <backup-file>`
- `npm run db:restore -- <backup-file>`

The restore script should create a safety backup before replacement; confirm its output before proceeding. Backups are ignored by Git and must be copied to an approved secure backup location separately. Never upload database dumps to GitHub.

Before restore:

1. stop application writes;
2. record the active database path and employee counts;
3. verify the selected backup;
4. make a fresh safety backup;
5. restore;
6. run integrity and count checks;
7. perform a focused UI/API smoke test.

Employee files under `storage/employee-files/` require a separate filesystem backup coordinated with the database metadata.

## Deployment notes

There is no finished production deployment definition in this repository.

Any deployment must provide:

- a strong `SESSION_SECRET` through the platform secret manager;
- HTTPS and secure cookies;
- a persistent database with tested backups;
- protected persistent/object storage for employee documents;
- a migration strategy with rollback;
- access controls that preserve ADMIN/MANAGER compatibility;
- logging that does not expose employee data or credentials;
- health checks and post-deploy smoke tests.

Do not deploy the current SQLite file and local `storage/` directory to an ephemeral or horizontally scaled platform. Reconcile PostgreSQL and object storage first, or use a deliberately persistent single-host deployment with documented operational safeguards.

## Current unfinished tasks

1. Reconcile the PostgreSQL schema with the complete SQLite schema and produce reviewed migrations.
2. Move protected employee uploads to production-grade object storage.
3. Add browser E2E tests for critical Employee 360 and Daily Operations flows.
4. Select the fourth backup cashier and any Team Leader through Settings; these choices were intentionally not invented. Enter real inventory quantities and optional qualification restrictions as operational data becomes available.
5. Resolve or explicitly accept current operational coverage warnings using real staffing requirements; do not suppress them in code.
6. Continue visual refinement using runtime screenshots at actual branch desktop widths and A4 print preview.
7. Complete Guest Feedback in its later phase.
8. Complete Guidance, Penalties, and Incidents in their later phase.
9. Decide whether Complete Employee File attachment merging is required and design it honestly if approved.
10. Refresh README and remove or replace stale development credential guidance.

## Recommended next steps in priority order

1. Make a fresh database and employee-file backup before any additional schema or data change.
2. Read this file, `prisma/schema.prisma`, `lib/settings.js`, `lib/role-matrix.js`, and the Operations reconciliation docs.
3. Start the server on port 3008 and run a focused runtime smoke test of schedule, roster, attendance, daily evaluation, Employee 360, uploads, protected file access, and both print previews.
4. Review current Settings data with the branch manager and select the fourth backup cashier, Team Leader, real stock quantities, and any qualification restrictions the branch actually uses.
5. Verify coverage warnings against the real staffing model and adjust requirements or staffing only with operational approval.
6. Add E2E coverage before another large UI refactor.
7. Reconcile PostgreSQL and object storage in an isolated environment before planning deployment.
8. Update README and remove stale credential examples.
9. Implement deferred HR modules only when their later phase requirements are supplied; keep placeholders honest until then.

## Files to review first

1. `CODEX_HANDOFF.md`
2. `prisma/schema.prisma`
3. `app/operations/OperationsClient.jsx`
4. `app/operations/DailyWorkspace.jsx`
5. `app/operations/daily-preview/DailyApprovalPreview.jsx`
6. `app/operations/Employee360View.jsx`
7. `app/operations/EmployeeAnnualFile.jsx`
8. `app/operations/EmployeeIntelligence.jsx`
9. `app/settings/OperationsSettingsClient.jsx`
10. `app/api/operations/`
11. `lib/operations/live-daily.js`
12. `lib/operations/employee360.js`
13. `lib/settings.js`
14. `lib/role-matrix.js`
15. `docs/operations-migration-plan.md`
16. `docs/operations-migration-reconciliation.md`
17. `tests/live-daily-operations.test.js`
18. `tests/employee360.test.js`
19. `tests/operations-foundation.test.js`

## Legacy and safety warnings

- Do not build new work on root-level `index.html`, `cashier.html`, `delivery.html`, `dashboard.html`, `orders.html`, `invoice.html`, `app.js`, `auth.js`, `config.js`, `code.gs`, `appsscript.json`, or `style.css`. They are legacy references.
- Do not treat `prisma/schema.postgres.prisma` as production-ready.
- Do not seed or reset the current local operational database.
- Do not commit `.env`, SQLite databases, backups, `storage/`, generated employee screenshots/PDFs, local admin helpers, logs, or the ignored migration helper.
- Do not expose employee files through `public/` or a raw static URL.
- Do not hardcode employee names, IDs, phone numbers, national IDs, or private mapping tables in source or docs.
- Do not replace real history with synthetic records to make a screen look populated.
- Do not mark UI verification complete from tests/build alone; inspect the running UI and print layouts.
- Do not implement Guest Feedback, Guidance/Penalties, or Incidents opportunistically without their approved phase requirements.

## Verification baseline

The implementation commit was reviewed for tracked secrets and forbidden artifacts. The following were deliberately excluded:

- `.env` and all secret values;
- SQLite databases and database dumps;
- database backups;
- local employee photo/document storage;
- screenshots and restricted PDFs containing employee information;
- development logs;
- local admin/check/reset helpers containing credentials;
- the one-time employee reconciliation helper containing private mappings.

At handoff, the expected repository checks are:

```text
npm test      # 60 passing
npm run lint  # UI audit passing
npm run build # production build passing
```

Re-run them after material changes. Runtime verification remains mandatory for visual or workflow changes.
