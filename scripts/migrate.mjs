// Aplica as migrações SQL em ordem, uma única vez cada, dentro de transação.
// Uso: node scripts/migrate.mjs   (requer DATABASE_URL e APP_ENV)
import postgres from 'postgres';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'db', 'migrations');
const url = process.env.DATABASE_URL;
if (!url) { console.error('DATABASE_URL não definida'); process.exit(1); }
const env = process.env.APP_ENV === 'demonstracao' ? 'demonstracao' : 'producao';

const sql = postgres(url, { max: 1, onnotice: () => {}, connection: { TimeZone: 'America/Sao_Paulo' } });

try {
  await sql`select pg_advisory_lock(424242)`;
  await sql`create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())`;
  const done = new Set((await sql`select name from schema_migrations`).map((r) => r.name));
  const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
  for (const f of files) {
    if (done.has(f)) continue;
    const body = await readFile(path.join(dir, f), 'utf8');
    await sql.begin(async (tx) => {
      await tx.unsafe(body);
      await tx`insert into schema_migrations (name) values (${f})`;
    });
    console.log(`migração aplicada: ${f}`);
  }
  const [marker] = await sql`select env from environment_marker`;
  if (!marker) {
    await sql`insert into environment_marker (env) values (${env})`;
    console.log(`ambiente registrado: ${env}`);
  } else if (marker.env !== env) {
    console.error(`ATENÇÃO: o banco está marcado como "${marker.env}", mas APP_ENV indica "${env}". Interrompendo.`);
    process.exit(2);
  }
  await sql`select pg_advisory_unlock(424242)`;
} catch (e) {
  console.error('Falha na migração:', e.message);
  process.exit(1);
} finally {
  await sql.end();
}
