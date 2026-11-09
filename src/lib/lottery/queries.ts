import "server-only";
import { asUser } from "../db";

export type CampaignView = Awaited<ReturnType<typeof loadCampaign>>;

export async function loadCampaign(userId: string, code: string) {
  return asUser(userId, async (tx) => {
    const [c] = await tx`select *, app.lottery_deadline(lottery_campaigns.*) as deadline from lottery_campaigns where code = ${code}`;
    if (!c) return null;
    const periods = await tx`select id, code, label, start_date, end_date from lottery_periods where campaign_id = ${c.id} order by sort`;
    const venues = await tx`
      select s.id, s.code, s.name, s.capacity, s.capacity_source, v.fixed_position
      from lottery_venues v join spaces s on s.id = v.space_id where v.campaign_id = ${c.id} order by s.sort_order`;
    const counts = await tx`select * from app.lottery_counts(${c.id})`;
    const rounds = await tx`
      select round, status, seed_commitment, sealed_at, public_entropy, started_at, order_doc, concluded_at, seed_revealed, annulled_at, annul_reason,
             reserve_commitment, reserve_revealed, reserve_revealed_at
      from lottery_rounds where campaign_id = ${c.id} order by round`;
    const stages = await tx`
      select x.id, x.round, x.seq, x.status, x.eligible, x.eligible_hash, x.excluded, x.draw_index, x.rng_counter, x.executed_at,
             p.code as period_code, p.id as period_id, s.code as space_code, s.name as space_name, u.code as winner_code
      from lottery_stages x join lottery_periods p on p.id = x.period_id join spaces s on s.id = x.space_id
      left join units u on u.id = x.winner_unit_id
      where x.campaign_id = ${c.id} order by x.round, p.sort, x.seq`;
    const params = await tx`select key, label, description, status, value, source from parameters where module = 'sorteio' order by key`;
    const subs = await tx`
      select s.id, s.stage_id, s.round, s.n, s.origin, s.reason, s.created_at, s.eligible, s.excluded, s.eligible_hash, s.draw_index,
             w.code as withdrawn_code, nw.code as new_winner_code, us.full_name as requested_by_name
      from lottery_substitutions s join units w on w.id = s.withdrawn_unit_id left join units nw on nw.id = s.new_winner_unit_id
      join users us on us.id = s.requested_by
      where s.campaign_id = ${c.id} order by s.stage_id, s.n`;
    // Titular atual de cada etapa (resultado original ou o último novo sorteio após desistência)
    for (const st of stages) {
      const mine = subs.filter((x) => x.stage_id === st.id);
      st.holder_code = mine.length ? mine[mine.length - 1].new_winner_code ?? null : st.winner_code ?? null;
      st.substitutions = mine;
    }
    return {
      campaign: c,
      periods,
      venues,
      counts: counts.map((r) => ({ periodId: r.period_id as string, spaceId: r.space_id as string, units: Number(r.units) })),
      rounds,
      stages,
      params,
      subs,
    };
  });
}

export async function loadMyEntries(userId: string, campaignId: string) {
  return asUser(userId, (tx) => tx`
    select e.id, e.status, e.status_reason, e.applicant_name, e.contact, e.origin, e.created_at, e.terms_version,
           u.code as unit_code, u.id as unit_id, p.code as period_code, p.label as period_label, s.code as space_code, s.name as space_name
    from lottery_entries e join units u on u.id = e.unit_id join lottery_periods p on p.id = e.period_id join spaces s on s.id = e.space_id
    where e.campaign_id = ${campaignId}
    order by u.code, p.sort, s.sort_order, e.created_at`);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function registrationOpen(c: Record<string, any>) {
  return c.status === "inscricoes_abertas" && new Date(c.deadline) > new Date();
}
