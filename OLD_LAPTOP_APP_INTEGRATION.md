# Recovering the old-laptop application

The sanitized full system is preserved on `ops-migration-local` and `archive/full-system-before-separation`, both at `bbf877e5743ae616722b10b1f42344ff97460564`. Neither branch should be rewritten or merged into the active branch as a shortcut. The original private local safety ref is not an integration or sharing source.

## Begin on a separate integration branch

```powershell
git fetch origin
git switch active-workplace-base
git status --short
git rev-parse HEAD
git rev-parse origin/active-workplace-base
git rev-list --left-right --count HEAD...origin/active-workplace-base
# Continue only with a clean tree, matching hashes and 0 / 0.
git switch -c integration/old-laptop-app
```

Never develop directly on `active-workplace-base`. If the branch is missing locally, use `git switch --track origin/active-workplace-base`. Stop if hashes diverge; do not reset or overwrite someone else's work.

## Inspect before copying

Preserve the recovered application privately first. Inventory its source files, framework, dependencies, entry points, routes, APIs, authentication, permissions, settings, storage and database requirements. Identify databases, uploads, credentials, environment files, keys, cookies, backups, logs and generated output before staging anything. Do not copy or commit those private files.

Create a mapping of the recovered routes and APIs to independent active pages and permission keys. Compare database entities, field semantics, identifiers, relations and migration history; compare local/object storage paths, upload limits, Settings ownership, language/theme behavior and deployment needs. Resolve collisions before importing source.

Reuse existing shared components, account profiles, branch/employee scopes, permission guards, database access, storage providers, Settings and backup/deployment tools. Preserve enabled rotation, reports, evaluations, Employee 360, planning, users and permissions. Do not restore unrelated excluded POS/Core or Apps Script functionality. The exact excluded source inventory is in `docs/ACTIVE_SYSTEM_SEPARATION.json`.

Keep existing database tables and historical records. Use an explicit reviewed migration only when genuinely necessary; no automatic destructive schema push, table removal, record deletion or identifier remapping. Create and verify an encrypted backup before any approved workplace migration.

Test integration on copied or synthetic data first: direct routes, permissions, branch scopes, API failures, existing data compatibility, uploads/downloads, printing, restart persistence and backup restoration. Build from a fresh clone without workplace data. Scan both the working tree and every Git object reachable from the proposed branch before a normal explicitly named push.

Do not push the private local safety reference, use `--all` or mirror pushes, publish real workplace data, enable excluded features, or recreate the recovered application before its actual source is available.
