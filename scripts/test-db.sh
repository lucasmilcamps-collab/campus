#!/usr/bin/env bash
# Runs a command against a throwaway local Postgres with every migration applied.
#
#   scripts/test-db.sh pnpm --filter @stride/server test
#
# Needs the Postgres server binaries (initdb, pg_ctl). The cluster lives in a
# temp dir and is deleted afterwards. As root, the cluster runs as `postgres`.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BIN="${PG_BIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
[ -x "$BIN/initdb" ] || { echo "test-db: initdb not found (set PG_BIN)"; exit 2; }
DIR="$(mktemp -d /tmp/stride-pg.XXXXXX)"
PORT="${PG_PORT:-55433}"
as_pg() { if [ "$(id -u)" = 0 ]; then su postgres -s /bin/bash -c "$*"; else bash -c "$*"; fi; }
[ "$(id -u)" = 0 ] && chown postgres "$DIR"
cleanup() { as_pg "$BIN/pg_ctl -D $DIR/data -m fast stop >/dev/null 2>&1" || true; rm -rf "$DIR"; }
trap cleanup EXIT

as_pg "$BIN/initdb -D $DIR/data -A trust -U postgres >/dev/null"
as_pg "$BIN/pg_ctl -D $DIR/data -o '-k $DIR -p $PORT -c listen_addresses=' -l $DIR/log -w start >/dev/null"
as_pg "$BIN/createdb -h $DIR -p $PORT -U postgres stride"

export DATABASE_URL="postgresql://postgres@localhost/stride?host=$DIR&port=$PORT"
node "$ROOT/scripts/migrate.mjs" --pre "$ROOT/supabase/test/auth-stub.sql" >/dev/null
"$@"
