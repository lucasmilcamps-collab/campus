#!/usr/bin/env bash
# Seeds the database in DATABASE_URL, then runs the given command. Used inside test-db.sh.
set -euo pipefail
psql "$DATABASE_URL" -q -v ON_ERROR_STOP=1 -f "$(dirname "$0")/../supabase/seed.sql"
exec "$@"
