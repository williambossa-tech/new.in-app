import { execFileSync } from "node:child_process";
import postgres from "postgres";

// Recria o banco de testes do zero e aplica as migrações.
export default async function setup() {
  const url = process.env.TEST_DATABASE_URL ?? "postgres://postgres@localhost/newin_test";
  const sql = postgres(url, { max: 1, onnotice: () => {} });
  await sql.unsafe("drop schema if exists public cascade; drop schema if exists app cascade; create schema public;");
  await sql.end();
  execFileSync("node", ["scripts/migrate.mjs"], { env: { ...process.env, DATABASE_URL: url, APP_ENV: "demonstracao" }, stdio: "inherit" });
  execFileSync("node", ["scripts/load-kb.mjs"], { env: { ...process.env, DATABASE_URL: url }, stdio: "inherit" });
}
