# Operations SQLite upgrades

These additive upgrades protect the existing imported SQLite database. They do not reset, seed or recalculate business history. Back up the database before applying:

```powershell
node scripts/migrate-operations-sqlite.js D:\Projects\billybeez-data-system-mot\prisma\dev.db
```

The runner records ordered filenames and SHA-256 checksums in `_OperationsMigration`, runs each migration in an immediate transaction, and refuses edits to an already-applied migration. Re-running it is safe. Playwright automatically upgrades its disposable database copy.

- 001 prevents new overlapping employee/position allocations in one plan and duplicate active trips at the same branch/date/time/name. Existing conflicting history is retained for explicit managerial review.
- 002 adds missing explanatory schedule catalog entries; historical overtime is inactive for new schedule entry. Published cells are unchanged.

This is an incremental baseline for the existing SQLite schema, not a replacement for provisioning the full Prisma schema on a new database. PostgreSQL needs equivalent provider-specific constraints and an infrastructure rehearsal before production readiness can be claimed. Do not apply these SQLite trigger statements to PostgreSQL.
