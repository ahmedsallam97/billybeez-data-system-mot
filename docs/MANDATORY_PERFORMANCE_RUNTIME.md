# Performance and operational evidence runtime

The existing implementation reuses the account, configuration, report, evaluation, appraisal and file services. It does not require importing workplace records to build. New settings remain draft until an authorized manager explicitly publishes them.

## Independent destinations

- Daily evaluations: `/operations/evaluations/daily`.
- Monthly evaluations: `/operations/evaluations/monthly`.
- Employee of the Month: `/operations/employee-of-the-month`.
- Operational reports: `/operations/reports/operational`.
- Performance reports: `/operations/reports/performance`.
- Succession: `/operations/succession`.
- Development: `/operations/development`.

Each page has its own permission and route ownership. Shared services do not merge the pages into a module-switching page. Existing legacy links resolve to their dedicated destinations.

## Trusted sources and approvals

Report drafts link to their booking or published schedule, staffing and attendance sources. Trip, Birthday and Shift Leadership reports use the existing lifecycle, independent approvals, configuration snapshots, audit and file ownership rules. Repeated leader assignment or report saves do not create duplicate linked reports.

Monthly calculations use the configured formula, reviewed daily records and eligible approved evidence. Recognition and Guest Feedback are independently configured numeric sources; unavailable required evidence produces a clear exclusion or pending reason. The system does not invent scores, substitute zero, renormalize a missing factor or automatically approve a result.

Approved event adjustments contribute to the daily source once and flow through monthly aggregation once. Fingerprints make unchanged recalculation idempotent. Manual component proposals retain source/evidence/reason metadata and require an independent approval. They cannot silently replace an available approved automatic source. Existing supported manual monthly results and immutable approved history remain intact.

Employee 360 and suitability show source evidence only within current employee, branch and page permissions. Succession and Development retain their plan ownership, competencies, evidence, revisions and manual readiness decision; the application does not promote an employee automatically.

## Files and persistence

Evidence uses the existing protected file-storage adapter. Upload validation, report ownership, authorization, hashes and approved-record locking apply. There is no public employee upload folder. Backup and restore include the full protected file inventory and database metadata. Restore writes a new generation rather than overwriting workplace data.

## Optional worker

`scripts/performance-worker.js` and the existing Compose `performance-worker` profile provide the opt-in runtime. Configure its dedicated active account, branch and interval through private environment settings. Startup validates the selected data generation. Do not start both native and container workers for the same branch. Jobs preserve existing manual/approved records according to the published policy and never approve scores automatically.

## Tests

Focused source, aggregation, eligibility, report, access, worker, backup and restart tests are under `tests`. Browser workflow tests use disposable copies or a new synthetic generation. No test fixture is a workplace business decision. Keep generated records, credentials, authentication state and evidence outside Git.
