import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { asUser } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Dados públicos (para moradores logados) que permitem refazer o sorteio de forma independente. */
export async function GET(_: Request, { params }: { params: Promise<{ code: string }> }) {
  const me = await getSessionUser();
  if (!me || me.status !== "ativo") return NextResponse.json({ erro: "não autenticado" }, { status: 401 });
  const { code } = await params;
  const data = await asUser(me.id, async (tx) => {
    const [c] = await tx`select id, code, title, status, frozen_at, freeze_doc, freeze_hash, current_round from lottery_campaigns where code = ${code}`;
    if (!c) return null;
    const rounds = await tx`select round, status, seed_commitment, sealed_at, public_entropy, started_at, order_doc, concluded_at,
                                   seed_revealed, annulled_at, annul_reason, reserve_commitment, reserve_revealed
                            from lottery_rounds where campaign_id = ${c.id} order by round`;
    const stages = await tx`
      select x.round, x.seq, x.status, x.eligible, x.excluded, x.eligible_hash, x.draw_index, x.rng_counter, x.executed_at,
             p.code as periodo, s.code as salao, s.name as salao_nome, u.code as vencedor
      from lottery_stages x join lottery_periods p on p.id = x.period_id join spaces s on s.id = x.space_id
      left join units u on u.id = x.winner_unit_id where x.campaign_id = ${c.id} order by x.round, p.sort, x.seq`;
    const substituicoes = await tx`
      select s.round, s.n, s.excluded, s.eligible, s.eligible_hash, s.draw_index, p.code as periodo, sp.code as salao, sp.name as salao_nome,
             w.code as desistente, nw.code as novo_vencedor
      from lottery_substitutions s join lottery_stages x on x.id = s.stage_id join lottery_periods p on p.id = x.period_id
      join spaces sp on sp.id = x.space_id join units w on w.id = s.withdrawn_unit_id left join units nw on nw.id = s.new_winner_unit_id
      where s.campaign_id = ${c.id} order by s.round, p.sort, x.seq, s.n`;
    return { substituicoes, campanha: { code: c.code, title: c.title, status: c.status, frozen_at: c.frozen_at, freeze_doc: c.freeze_doc, freeze_hash: c.freeze_hash, current_round: c.current_round }, rounds, stages };
  });
  if (!data) return NextResponse.json({ erro: "campanha não encontrada" }, { status: 404 });
  return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
}
