# Online pilot preparation

The existing deployment source is in `deploy/pilot`. Reuse that implementation rather than creating another deployment system. Preparation and verification run against the clearly marked synthetic generation described in [Sanitized pilot data](../deploy/pilot/SANITIZED_DATA.md).

The pilot is a demonstration environment. It contains no workplace identities, files, evaluations, bookings, attendance, credentials, published operational process templates, survey questions or grading policy. Its artificial examples must not be used for workplace decisions. Private account and secret outputs remain outside the checkout.

## Required owner access

Before public deployment, obtain all of the following:

- An owner-controlled, approved free hosting provider and region, with an MFA-approved session.
- Available free VM capacity and restricted SSH access.
- Control of the intended DNS hostname and the certificate contact email.
- A private backup endpoint/bucket with restricted credentials supplied securely.

Do not accept a paid upgrade, assume region approval or retry unavailable public access without those prerequisites. Workplace data must remain local.

## Verification sequence

1. Build the reviewed code-only release using the existing Dockerfile.
2. Prepare a new synthetic generation and separate private test accounts.
3. Rehearse the workflows, permissions, files, PDFs and three simultaneous desktop sessions locally.
4. Verify restart, recreation, encrypted backup and restoration using the existing tools.
5. Deploy only that sanitized generation to approved free resources.
6. Verify trusted public HTTPS and external desktop access.
7. Install and verify automatic encrypted backups and test a new restored generation.

Follow [Pilot runbook](PILOT_RUNBOOK.md). A local rehearsal is not a claim that a public pilot is live. Keep all generated images, PDFs, logs, databases, credential files, authentication state and encrypted archives outside source history.
