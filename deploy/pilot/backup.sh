#!/usr/bin/env bash
set -euo pipefail
# Install/run from the immutable reviewed release directory on the Linux VM.
# systemd provides exclusivity; flock also protects manual invocations.
exec 9>/run/operations-pilot-backup.lock
flock -n 9 || exit 1
cd /opt/operations-pilot/current
compose=(docker compose --env-file /etc/operations-pilot/deployment.env -f deploy/pilot/compose.yml)
# Brief maintenance window makes database + file capture deterministic.
worker_running=false
if [[ -n "$("${compose[@]}" --profile performance-worker ps --status running -q performance-worker)" ]]; then
  worker_running=true
  "${compose[@]}" --profile performance-worker stop performance-worker
fi
restart_services() {
  "${compose[@]}" up -d --wait app
  if [[ "$worker_running" == true ]]; then
    "${compose[@]}" --profile performance-worker up -d performance-worker
  fi
}
trap restart_services EXIT
"${compose[@]}" stop app
"${compose[@]}" --profile maintenance run --rm --no-deps backup
