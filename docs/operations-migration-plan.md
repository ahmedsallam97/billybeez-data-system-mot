# Operations Migration Plan

## Safety baseline

- Target repository: `D:\Projects\billybeez-data-system-mot`
- Working branch: `ops-migration-local` (local only, no upstream)
- Rollback/base commit: `a34f4091b8ec2791a34606f4a011e22ec94973dc`
- Target database backup: `backups/manual-2026-09-11T11-43-32-992Z.db`
- Source repository: `D:\Projects\BB-OMS`, branch `local-mot-sqlite`, read only
- Source database: `packages/database/prisma/bb-oms-mot.db`, read only
- Remote pushes and pull requests are prohibited.

## Canonical target architecture and visual language

The target application remains a single Next.js application using its existing Prisma client, signed-cookie authentication, role matrix, `AuditLog`, and `SystemSetting` services.

New operations pages will use these existing target patterns:

- `AppShell` for authentication-aware navigation, language/theme controls, and business-day context.
- `.container`, `.panel`, `.card`, `.metrics`, `.metric`, `.tabs`, `.form-grid`, existing table/list rows, badges, alerts, modals, toasts, skeletons, and empty states.
- Existing Billy Beez CSS variables, eight-pixel corners, borders, shadows, spacing, Tajawal Arabic typography, and existing responsive breakpoints.
- `UiPreferencesProvider` and the target translation dictionary for Arabic/English and RTL/LTR.
- Route handlers returning JSON with `success`/`error` conventions, `authorizeApi()` for server authorization, and `writeAudit()` for changes.

No BB-OMS JSX, global CSS, sidebar, theme, layout, or authentication code will be copied.

## Source data baseline

The source SQLite integrity check passes. Validated source counts:

| Entity | Count |
| --- | ---: |
| Canonical employees | 13 |
| HRIS employees | 8 |
| Part-Time employees | 5 |
| Employment periods | 13 |
| Employment assignments | 13 |
| Schedule versions | 23 |
| Published operational periods | 12 |
| Published schedule cells | 4,745 |
| Published `N/A` cells | 257 |
| All schedule-version cells | 9,087 |
| Attendance days / records | 2 / 26 |
| Operations days | 2 |
| Daily evaluation days / employee evaluations | 1 / 0 |
| Monthly appraisals | 57 |
| Source audit events | 95 |

The leave, replacement, holiday, overtime, EOTM, and succession tables currently contain no historical transactions or decisions. Their validated rules and workflows will still be migrated.

## Employee identity mapping

The existing target employee IDs remain canonical so POS/Kitchen relationships do not change. Source IDs and codes were attached to those rows through an explicit, locally reviewed identity map. No employee was matched by a broad fuzzy-name rule. The private identity map is intentionally excluded from Git; reconciliation records only the aggregate result: 13 explicit matches, consisting of 8 HRIS and 5 Part-Time employees, with zero conflicts.

`موظف مطعم 1`, `موظف مطعم 2`, and `موظف مطعم 3` are target-only kitchen placeholders and are excluded from historical Operations imports unless explicitly assigned later.

## Source-to-target model mapping

| Source concept | Target strategy |
| --- | --- |
| Branch | Omit duplicate branch entity. The local database is MOT-only; operations rows use a fixed local scope. |
| Employee | Extend the existing `Employee`; preserve its ID, Arabic display name, department, POS relations, and login relation. |
| User/Roles/Permissions | Keep target `User`, bcrypt password, signed cookie, `Role`, and role matrix. Add operations permissions to the matrix. |
| AuditEvent | Map significant operations changes into existing `AuditLog` metadata with entity type/source IDs. |
| Settings | Add operations defaults through existing `SystemSetting` service and Manager settings patterns. |
| EmploymentPeriod / Assignment / WeeklyOff | Add operations history models related to target `Employee`. |
| Schedule / Assignment / Validation | Add operational schedule models with revision, publish state, raw import value, and metadata preservation. |
| ScheduleCode / ShiftDefinition | Add reference models; normalize only runtime semantics while retaining historical raw values. |
| Attendance | Add day, record, and correction history models sourced from published schedules. |
| Operations / Rotation | Add day, position, staffing, rotation, break, and event-execution models. Rotation assigns positions only. |
| Daily Evaluation | Add criteria/version, day, employee evaluation, and exception models. Multi-save is transactional. |
| Leave / Replacement | Add account, immutable transaction ledger, booking, and allocation models. Reversals are additive records. |
| Official Holiday | Add manually managed periods. Finalized worked holidays credit exactly two Replacement days with deduplication. |
| Overtime | Add minute-based account/transactions. Eight hours equals one day; remainder stays available. |
| Appraisal / Month Close | Add immutable formula versions and versioned monthly snapshots. Imported finalized history is never recalculated. |
| EOTM | Add formula, competition, candidate, winner, lock, and explicit reopen history. |
| Succession | Add candidate, manual readiness reviews, development actions, and deterministic advisory insights. |
| Notifications/Tasks | Prefer a computed Needs Attention API and target dashboard cards. Persist only user-managed tasks if later required. |
| Backup/Health | Extend the existing target backup scripts/settings UI and SQLite integrity checks. |

Source PWA configuration, file/document storage, wristband inventory, and the source auth stack are outside this migration scope.

## Required business rules

- Operational schedule periods: January 1–15; December November 16–December 31; otherwise previous-month 16 through selected-month 15.
- Reporting remains calendar-month based.
- `BW1`/`BW2` normalize to `BW` while raw input remains stored.
- `AM Front`/`PM Front` retain the base shift and temporary Front Cashier metadata.
- `N/A` creates no work, off, leave, absence, attendance expectation, overtime, or ledger effect. Blank remains blank.
- Expected attendance derives from the published schedule; actual attendance remains separate.
- Daily Operations derives its team from the published schedule; rotation assigns positions only.
- National ID is optional, exactly 14 digits when supplied, unique, masked in list responses, and returned only to authorized detail/edit requests.
- HRIS is exactly five digits. Part-Time staff have no HRIS and use unique local codes.
- Part-Time staff without HRIS are ineligible for annual entitlement when policy provides none and are always excluded from Replacement.
- Leave, Replacement, and Overtime balances cannot become negative.
- Historical `OverTime` schedule cells are occurrences only and never imply hours.
- EOTM lock is terminal unless an explicit authorized reopen records actor, timestamp, and reason.
- Succession readiness and promotion remain manual decisions. `Cashier - Front` normalizes to `Front Cashier` only for succession paths.

## Schema conflicts and resolutions

1. Target `Employee.department` is a POS routing field; source assignments contain operations job titles. Preserve department and store job/assignment history separately.
2. Target employee names are Arabic short names; source names are canonical English full names. Use the explicit identity map above and persist source IDs/codes for repeatable imports.
3. Source users and audit rows reference a separate auth/RBAC system. Do not import source users. Historical source actor IDs remain optional metadata when operational history is imported.
4. Source schedules have 23 versions but 12 published periods. Preserve every version and status; use only published versions for attendance and rosters.
5. Source schedule assignments intentionally have no Prisma relation to Employee. The target will use a real Employee relation after identity validation.
6. Source is branch-aware; target is deliberately single-branch MOT. Migration filters the source MOT branch and does not introduce a redundant branch picker.

## Staged implementation

### Phase 1 — foundation and Employee 360

- Extend Employee safely and add employment history/reference models.
- Add operations permission keys and settings defaults.
- Add schema models needed by later phases without altering existing POS/Kitchen models.
- Implement a dry-run-first, transactional source migration utility with explicit identity mapping.
- Build Employee 360 API/detail behavior using target authorization and masking rules.

### Phase 2 — schedule, import, publish, roster

- Port schedule-period and code semantics with focused tests.
- Build schedule CRUD/revision/publish APIs and old-style grid.
- Add Excel preview/validation/confirm with merge/replace safeguards.
- Add daily roster and print/share view sourced from the published schedule.

### Phase 3 — attendance, daily operations, evaluation

- Build attendance expectations from published schedules.
- Add corrections/finalization and 12-hour display formatting.
- Build operations team/position rotation and exception handling.
- Build transactional Daily Evaluation and grooming workflow.

### Phase 4 — leave and time ledgers

- Build annual leave, Replacement, official holidays, overtime, and smart allocation.
- Enforce eligibility, negative protection, deduplication, reasons, and reversals.

### Phase 5 — performance

- Build versioned appraisal calculations and month close.
- Build EOTM calculation/review/winner/lock/reopen.
- Build succession and deterministic advisory insights.

### Phase 6 — attention, permissions, safety

- Add actionable Needs Attention cards.
- Finish permission management, settings, audit views, backup verification, and database health.

### Phase 7 — historical migration and end-to-end QA

- Preview source-to-target identity and row counts.
- Import transactionally from the read-only source after a fresh target backup.
- Preserve raw schedule values, formula snapshots, statuses, versions, and timestamps.
- Reconcile 13 employees, 12 published periods, 4,745 published cells, 257 `N/A` cells, and 57 appraisal rows.
- Verify Arabic/English, RTL/LTR, desktop/responsive behavior, persistence, permissions, and existing POS/Kitchen workflows.
