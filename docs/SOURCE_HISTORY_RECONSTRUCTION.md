# Source history reconstruction — 2026-10-14

The completed application was reconstructed directly on the published baseline `e346b22475bf5ee70824eda1b39d38a856671b1f`. The original 19 unpushed commits were not cherry-picked. Only their inspected source, safe tests and sanitized documentation were retained.

## Milestone mapping

| Original local milestone | Clean replacement |
| --- | --- |
| `2b35345b57dbd88247a31ade3edc8953f7a21691` completed application | `7cd8caae383831bb3a0c73d07b17db771c9b8f53` |
| `0fc5394530719f5c0b8f073d18b400f90115ec99` tests and pilot preparation | `85ec069b6798b5f29d3cc84b04c1b5f339324b94` plus the application commit above |
| `a9b1c325e83727edcd5f613d0a03c5cbcf6d209e` private completion evidence | This sanitized reconstruction document replaces the private report; evidence is local-only. |
| `a1da3bf4864f3b2ba82f390806163ee3ba7f61dc` synthetic pilot and Prisma bootstrap | Included in the two clean source/test commits above. |

Application, library, public assets, database schemas/migrations, scripts and deployment source have identical Git bytes to the completed source. Tests retain their assertions with six changes that put verification datasets, authentication, logs and evidence outside the checkout. Real employee labels in a copy-format test were replaced with generic test names. Migration bytes are protected against Windows newline conversion.

## Excluded private artifacts

`docs/stabilization-evidence/` and `docs/phases-completion-2026-10-13/` are excluded in full: employee portraits and PDFs, screenshots, real evaluation snapshots, data/upload hashes, runtime logs and derived evidence. Earlier local audit, completion, handoff and artifact-list documents are replaced with source-only guides. All original evidence is preserved privately outside the clean checkout.

The nine raw logs were `final-configuration-regression.log`, `final-postgres-schema.log`, `final-prisma.log`, `final-production-playwright.log`, `final-profile-framing-regression.log`, `final-ui-audit.log`, `final-unit.log`, `rail-profile-pdf-verified.log` and `uploads-schedule-verified.log`, all under `docs/stabilization-evidence/`.

Runtime databases, employee storage, uploads, backup archives, environment files, credentials, keys, authentication state, temporary datasets and generated verification files are excluded by precise ignore rules. Source routes such as `app/api/backups/` remain visible to Git.

## History boundary

The original unpushed history is retained solely as `local/private-pre-sanitize-a1da3bf`. Never push that ref, use `git push --all` or mirror pushes, or create a sharing bundle from it. Push only explicitly named verified branches.

The published baseline already contains a static employee display-label overlap in historical legacy seed/Apps Script source. It contains no attached personnel files or evaluation evidence. This inherited source is disclosed separately by the scanner; removing it from ancestral history would require a forbidden remote-history rewrite. No such rewrite is part of this reconstruction. The scanner must report zero new private findings and must not claim zero historical identity literals anywhere.

The archive branch preserves all full-system source. The active branch removes only proven globally excluded independent legacy source and retains the existing database schemas, shared services and workplace workflows. Public deployment is outside this phase.
