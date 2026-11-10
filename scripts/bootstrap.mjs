// Cria o primeiro usuário de administração, se ainda não existir nenhum.
// Variáveis: BOOTSTRAP_ADMIN_EMAIL, BOOTSTRAP_ADMIN_NAME, BOOTSTRAP_ADMIN_PASSWORD (provisória; troca obrigatória no 1º acesso).
import postgres from "postgres";
import { randomBytes, scrypt as _scrypt } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(_scrypt);
// Perfil Desenvolvedor (configurações técnicas): DESENVOLVEDOR_EMAILS (separados por vírgula);
// sem a variável, vale o e-mail do administrador inicial. Nunca é concedido pelo app.
const { DATABASE_URL, BOOTSTRAP_ADMIN_EMAIL, BOOTSTRAP_ADMIN_NAME, BOOTSTRAP_ADMIN_PASSWORD, DESENVOLVEDOR_EMAILS } = process.env;
if (!DATABASE_URL) process.exit(0);

const sql = postgres(DATABASE_URL, { max: 1, onnotice: () => {} });
try {
  const devs = (DESENVOLVEDOR_EMAILS || BOOTSTRAP_ADMIN_EMAIL || "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
  if (devs.length) {
    const rows = await sql`insert into user_roles (user_id, role) select id, 'desenvolvedor' from users where lower(email) in ${sql(devs)} and status = 'ativo'
                           on conflict do nothing returning user_id`;
    if (rows.length) console.log(`perfil desenvolvedor concedido a ${rows.length} usuário(s)`);
  }
  const [{ n }] = await sql`select count(*)::int as n from user_roles where role = 'admin'`;
  if (n === 0 && BOOTSTRAP_ADMIN_EMAIL && BOOTSTRAP_ADMIN_PASSWORD) {
    const salt = randomBytes(16);
    const key = await scrypt(BOOTSTRAP_ADMIN_PASSWORD, salt, 64, { N: 16384, r: 8, p: 1 });
    const hash = `scrypt$16384$8$1$${salt.toString("base64")}$${key.toString("base64")}`;
    await sql.begin(async (tx) => {
      const [u] = await tx`insert into users (email, full_name, password_hash, status, must_change_password)
        values (${BOOTSTRAP_ADMIN_EMAIL.toLowerCase()}, ${BOOTSTRAP_ADMIN_NAME ?? "Administração"}, ${hash}, 'ativo', true)
        on conflict ((lower(email))) do update set status = 'ativo' returning id`;
      await tx`insert into user_roles (user_id, role) values (${u.id}, 'admin'), (${u.id}, 'morador') on conflict do nothing`;
      await tx`insert into audit_log (actor_id, actor_label, action, entity, entity_id, data, prev_hash, hash)
        values (null, 'Sistema', 'admin.usuario_criado', 'user', ${u.id}, ${sql.json({ origem: "instalação inicial", email: BOOTSTRAP_ADMIN_EMAIL })}, '', '')`;
    });
    console.log(`administrador inicial criado: ${BOOTSTRAP_ADMIN_EMAIL}`);
  }
} finally {
  await sql.end();
}
