// Carrega o Regimento e a Convenção (db/kb/kb.json) na base de busca, quando a versão muda.
import postgres from "postgres";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const file = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "db", "kb", "kb.json");
const sql = postgres(process.env.DATABASE_URL, { max: 1, onnotice: () => {} });
try {
  const kb = JSON.parse(await readFile(file, "utf8"));
  const [m] = await sql`select version from kb_meta`;
  if (m?.version === kb.version) { console.log("base da Corujinha: atualizada"); process.exit(0); }
  await sql.begin(async (tx) => {
    await tx`delete from kb_chunks`;
    for (let i = 0; i < kb.chunks.length; i += 200) {
      const part = kb.chunks.slice(i, i + 200).map((c) => ({ source: c.source, ref: c.ref, title: c.title, body: c.text }));
      await tx`insert into kb_chunks ${tx(part, "source", "ref", "title", "body")}`;
    }
    await tx`insert into kb_meta (version) values (${kb.version}) on conflict (singleton) do update set version = excluded.version, loaded_at = now()`;
  });
  console.log(`base da Corujinha carregada: ${kb.chunks.length} trechos`);
} finally {
  await sql.end();
}
