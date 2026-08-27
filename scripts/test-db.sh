#!/usr/bin/env bash
# pgTAP layer. Guards against a stopped local stack: without it the CLI spins
# indefinitely instead of reporting that there is nothing to connect to.
set -euo pipefail

if ! supabase status >/dev/null 2>&1; then
  echo "Supabase stack is not running. Run: supabase start" >&2
  exit 1
fi

exec supabase test db --local "$@"
