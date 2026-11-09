// Popula o ambiente de DEMONSTRAÇÃO com dados fictícios identificados.
// Recusa-se a rodar em banco marcado como produção.
import postgres from "postgres";
import { randomBytes, scrypt as _scrypt } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(_scrypt);
const sql = postgres(process.env.DATABASE_URL, { max: 1, onnotice: () => {} });
const hash = async (pw) => {
  const salt = randomBytes(16);
  const key = await scrypt(pw, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$16384$8$1$${salt.toString("base64")}$${key.toString("base64")}`;
};

try {
  const [m] = await sql`select env from environment_marker`;
  if (m?.env !== "demonstracao") { console.log("seed-demo: banco não é de demonstração; nada feito."); process.exit(0); }
  const [{ n }] = await sql`select count(*)::int as n from users where email like '%@demo.newin'`;
  if (n > 0) { console.log("seed-demo: já populado."); process.exit(0); }
  const pw = await hash("demo2026");
  await sql.begin(async (tx) => {
    const mk = async (email, name, roles, unit, relation = "proprietario", resides = true) => {
      const [u] = await tx`insert into users (email, full_name, phone, password_hash, status) values (${email}, ${name}, '(41) 90000-0000', ${pw}, 'ativo') returning id`;
      for (const r of roles) await tx`insert into user_roles (user_id, role) values (${u.id}, ${r})`;
      if (unit) await tx`insert into unit_memberships (user_id, unit_id, relation, resides, status) select ${u.id}, id, ${relation}, ${resides}, 'ativo' from units where code = ${unit}`;
      return u.id;
    };
    await mk("admin@demo.newin", "Administração [DEMO]", ["admin", "morador"], null);
    await mk("portaria@demo.newin", "Portaria [DEMO]", ["portaria"], null);
    await mk("morador@demo.newin", "Morador Fictício Principal [DEMO]", ["morador"], "1204");
    const [c] = await tx`select id from lottery_campaigns where code = 'festas-2026'`;
    await tx`update lottery_campaigns set status = 'inscricoes_abertas', opened_at = now() where id = ${c.id}`;
    const periods = await tx`select id from lottery_periods where campaign_id = ${c.id}`;
    const spaces = await tx`select space_id as id from lottery_venues where campaign_id = ${c.id}`;
    const units = await tx`select code from units where code <> '1204' order by random() limit 28`;
    let i = 1;
    for (const { code } of units) {
      const name = `Morador Fictício ${String(i).padStart(2, "0")} [DEMO]`;
      const uid = await mk(`morador${i}@demo.newin`, name, ["morador"], code, i % 4 === 0 ? "locatario" : "proprietario");
      const [unit] = await tx`select id from units where code = ${code}`;
      const sub = crypto.randomUUID();
      for (const p of periods) for (const s of spaces) {
        if (Math.random() < 0.55) {
          await tx`insert into lottery_entries (campaign_id, submission_id, unit_id, period_id, space_id, applicant_name, applicant_user_id,
                    contact, terms_version, terms_accepted_at, origin)
                   values (${c.id}, ${sub}, ${unit.id}, ${p.id}, ${s.id}, ${name}, ${uid}, '(41) 90000-0000', 1, now(), 'app')`;
        }
      }
      i++;
    }
    await tx`insert into audit_log (actor_id, actor_label, action, entity, entity_id, data, prev_hash, hash)
             values (null, 'Sistema', 'demo.popular', 'environment', 'demonstracao', ${sql.json({ aviso: "dados fictícios" })}, '', '')`;
  });
  console.log("seed-demo: ambiente de demonstração populado.");
} finally {
  await sql.end();
}
