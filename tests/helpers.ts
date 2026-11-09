import { asSystem, asUser, db } from "@/lib/db";

let n = 0;
export async function mkUser(opts: { roles?: string[]; unit?: string; relation?: string; resides?: boolean; status?: string } = {}) {
  n++;
  return asSystem(async (tx) => {
    const [u] = await tx`insert into users (email, full_name, password_hash, status)
      values (${`u${n}-${Date.now()}@teste.local`}, ${"Pessoa Teste " + n}, 'x', ${opts.status ?? "ativo"}) returning id`;
    for (const r of opts.roles ?? ["morador"]) await tx`insert into user_roles (user_id, role) values (${u.id}, ${r})`;
    if (opts.unit) {
      await tx`insert into unit_memberships (user_id, unit_id, relation, resides, status)
        select ${u.id}, id, ${opts.relation ?? "proprietario"}, ${opts.resides ?? true}, 'ativo' from units where code = ${opts.unit}`;
    }
    return u.id as string;
  });
}

export async function ids() {
  const sql = db();
  const [c] = await sql`select id from lottery_campaigns where code = 'festas-2026'`;
  const periods = Object.fromEntries((await sql`select code, id from lottery_periods`).map((r) => [r.code, r.id]));
  const spaces = Object.fromEntries((await sql`select code, id from spaces`).map((r) => [r.code, r.id]));
  return { campaignId: c.id as string, periods, spaces };
}

export async function enroll(userId: string, unit: string, period: string, space: string) {
  const { campaignId, periods, spaces } = await ids();
  return asUser(userId, async (tx) => {
    const [u] = await tx`select id from units where code = ${unit}`;
    await tx`insert into lottery_entries (campaign_id, submission_id, unit_id, period_id, space_id, applicant_name, applicant_user_id,
              contact, terms_version, terms_accepted_at, origin)
             values (${campaignId}, gen_random_uuid(), ${u.id}, ${periods[period]}, ${spaces[space]}, 'Fulano de Tal', ${userId},
                     '41 99999-0000', 1, now(), 'app')`;
  });
}
