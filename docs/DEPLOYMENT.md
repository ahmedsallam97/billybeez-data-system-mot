# Billy Beez deployment runbook

## Release gate

Every release must pass the GitHub Actions workflow in `.github/workflows/ci.yml`. It verifies generated PostgreSQL schema parity, validates Prisma, creates and seeds an isolated SQLite database, runs unit tests, runs the UI audit, builds the application, and runs browser tests including the isolated create/update/delete/publish workflows.

Use immutable commit hashes for production releases. Keep `.env`, databases, employee files, backups, and employee artifacts outside Git and outside the Docker build context.

## Required environment

Copy `.env.example` to an access-controlled `.env.production` and replace placeholders. Use a unique `SESSION_SECRET` of at least 32 random characters. Never use the CI-only seed passwords in production.

Choose exactly one database provider:

- SQLite: `DATABASE_PROVIDER=sqlite` and `DATABASE_URL=file:/app/prisma/dev.db`.
- PostgreSQL: `DATABASE_PROVIDER=postgresql` and a real `POSTGRES_DATABASE_URL`. `DATABASE_URL` can remain a harmless SQLite placeholder because the PostgreSQL runtime uses its separately generated client.

Choose employee storage:

- local: mount `/app/storage/employee-files` on persistent encrypted storage;
- S3: set `EMPLOYEE_FILE_STORAGE_PROVIDER=s3` plus the bucket, region, prefix, credentials/instance role, and optional endpoint/SSE fields.

Run `npm run storage:verify` with the final production environment before accepting uploads. The command writes, reads, hashes, and removes one verification object without printing credentials.

## SQLite single-host deployment

SQLite requires one application instance and persistent volumes. It is not suitable for multiple concurrent replicas.

```powershell
Copy-Item .env.example .env.production
# Fill real values without committing the file.
docker compose -f docker-compose.production.example.yml build
docker compose -f docker-compose.production.example.yml up -d
```

The container runs `prisma db push` before starting the app, and the named volumes preserve the SQLite database, local employee files, and database backups. Restore the verified database and storage package before first start when deploying existing operational data.

Before each SQLite release, run `npm run db:backup` and `npm run db:verify-backup -- <backup-file>`. Roll back by stopping the container, restoring the verified database and matching storage snapshot, checking out the previous immutable image/commit, and starting one instance.

## PostgreSQL deployment and rehearsal

The generated runtime schema is `prisma/postgres/schema.prisma`. Versioned migrations live beside it in `prisma/postgres/migrations/`. The Docker entrypoint runs `prisma migrate deploy` for PostgreSQL and never runs `db push` against PostgreSQL.

Rehearse against an isolated empty PostgreSQL database:

```powershell
$env:DATABASE_PROVIDER = 'postgresql'
$env:POSTGRES_DATABASE_URL = '<isolated-target-url>'
npm run db:pg:validate
npm run db:pg:status
npm run db:pg:migrate
npm run db:pg:status
npm run db:pg:generate
npm test
npm run build
```

Then start the application against that isolated target and run `npm run test:e2e`. A full production cutover also requires a reviewed SQLite-to-PostgreSQL data transfer, row-count and relationship reconciliation, a final write freeze, and a fresh backup. Schema migration alone does not copy current SQLite operational data.

The current workstation has no configured PostgreSQL URL and its Docker daemon is stopped, so the migration files are generated and validated but a live PostgreSQL rehearsal cannot be truthfully marked complete here.

## File lifecycle

`npm run storage:cleanup` is always a dry run. It reports employee objects whose database records have been `REMOVED` or `REPLACED` longer than `EMPLOYEE_FILE_RETENTION_DAYS`, plus old orphan files for local storage. Review the JSON report and a backup before running `npm run storage:cleanup:apply`.

For S3, lifecycle rules should retain object versions and expire noncurrent versions only after the approved retention window. Database records stay for audit even after the old binary is purged. Back up database and object storage as one recovery point so references remain consistent.

## Monitoring and rollback

- Check `/api/operations/health` through an authenticated admin session. SQLite reports integrity and local backups; PostgreSQL reports connectivity and expects platform-managed backups.
- Monitor failed authentication, `OPS_` audit actions, storage failures, database capacity, backup age, and container restarts.
- Test restore procedures regularly. A backup that has not been restored and validated is not a verified recovery point.
- Roll back application code using the previous image/commit. Roll back data only through a reviewed restore because it discards newer operational changes.
