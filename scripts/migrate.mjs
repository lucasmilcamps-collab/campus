#!/usr/bin/env node
// Applies supabase/migrations/*.sql in name order, each in its own transaction,
// recording what ran in private.schema_migrations. Safe to re-run.
//
//   DATABASE_URL=postgres://... node scripts/migrate.mjs [--pre file.sql]
//
// On a Supabase project you can use `supabase db push` instead (same folder,
// same names); pick one tool per database so the two ledgers don't disagree.
// --pre runs a file first without recording it (the local auth stub in tests).
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(root, 'supabase', 'migrations');
const url = process.env.DATABASE_URL;
if (!url) {
  console.error('migrate: DATABASE_URL is not set');
  process.exit(2);
}

const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  const pre = process.argv.indexOf('--pre');
  if (pre !== -1) await client.query(readFileSync(process.argv[pre + 1], 'utf8'));

  await client.query(`create schema if not exists private;
    create table if not exists private.schema_migrations (name text primary key, applied_at timestamptz not null default now())`);
  const done = new Set((await client.query('select name from private.schema_migrations')).rows.map((r) => r.name));
  const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  let applied = 0;
  for (const f of files) {
    if (done.has(f)) continue;
    await client.query('begin');
    try {
      await client.query(readFileSync(join(dir, f), 'utf8'));
      await client.query('insert into private.schema_migrations (name) values ($1)', [f]);
      await client.query('commit');
      console.log('applied', f);
      applied++;
    } catch (e) {
      await client.query('rollback');
      console.error(`migrate: ${f} failed: ${e.message}`);
      process.exit(1);
    }
  }
  console.log(applied ? `${applied} migration(s) applied` : 'up to date');
} finally {
  await client.end();
}
