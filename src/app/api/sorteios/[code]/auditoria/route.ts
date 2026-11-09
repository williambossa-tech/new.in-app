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
                                   seed_revealed, annulled_at, annul_reason
                            from lottery_rounds where campaign_id = ${c.id} order by round`;
    const stages = await tx`
      select x.round, x.seq, x.status, x.eligible, x.excluded, x.eligible_hash, x.draw_index, x.rng_counter, x.executed_at,
             p.code as periodo, s.code as salao, s.name as salao_nome, u.code as vencedor
      from lottery_stages x join lottery_periods p on p.id = x.period_id join spaces s on s.id = x.space_id
      left join units u on u.id = x.winner_unit_id where x.campaign_id = ${c.id} order by x.round, p.sort, x.seq`;
    return { campanha: { code: c.code, title: c.title, status: c.status, frozen_at: c.frozen_at, freeze_doc: c.freeze_doc, freeze_hash: c.freeze_hash, current_round: c.current_round }, rounds, stages };
  });
  if (!data) return NextResponse.json({ erro: "campanha não encontrada" }, { status: 404 });
  return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
}
