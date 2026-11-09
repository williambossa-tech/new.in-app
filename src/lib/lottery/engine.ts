import "server-only";
import { asSystem, type Tx } from "../db";
import { audit } from "../audit";
import {
  byUnitCode, drawOneStage, freezeHash, randomSeedHex, resolveOrder, sha256Hex, computeRound,
  type FreezeDoc,
} from "./core";

export class RuleError extends Error {}

type Actor = { id: string; label: string };

async function assertAdmin(tx: Tx) {
  const [r] = await tx`select app.has_role('admin') as ok`;
  if (!r?.ok) throw new RuleError("Somente a administração pode executar esta operação.");
}

async function lockCampaign(tx: Tx, code: string) {
  const [c] = await tx`select * from lottery_campaigns where code = ${code} for update`;
  if (!c) throw new RuleError("Campanha não encontrada.");
  return c;
}

async function periodsAndVenues(tx: Tx, campaignId: string) {
  const periods = await tx`select id, code, label, start_date, end_date from lottery_periods where campaign_id = ${campaignId} order by sort`;
  const venues = await tx`
    select s.id, s.code, s.name, v.fixed_position from lottery_venues v join spaces s on s.id = v.space_id
    where v.campaign_id = ${campaignId} order by s.sort_order`;
  return { periods, venues };
}

// ---------------------------------------------------------------------------
// Inscrições
// ---------------------------------------------------------------------------
export async function setRegistrationState(actor: Actor, code: string, to: "inscricoes_abertas" | "inscricoes_encerradas") {
  return asSystem(async (tx) => {
    await assertAdmin(tx);
    const c = await lockCampaign(tx, code);
    const allowedFrom = to === "inscricoes_abertas" ? ["rascunho", "inscricoes_encerradas"] : ["inscricoes_abertas"];
    if (!allowedFrom.includes(c.status)) throw new RuleError("Mudança de situação não permitida neste momento.");
    if (to === "inscricoes_abertas") {
      await tx`update lottery_campaigns set status = ${to}, opened_at = coalesce(opened_at, now()), opened_by = coalesce(opened_by, ${actor.id}) where id = ${c.id}`;
    } else {
      await tx`update lottery_campaigns set status = ${to}, closed_at = now(), closed_by = ${actor.id} where id = ${c.id}`;
    }
    await audit(tx, {
      actorId: actor.id, actorLabel: actor.label,
      action: to === "inscricoes_abertas" ? (c.status === "rascunho" ? "sorteio.abrir_inscricoes" : "sorteio.reabrir_inscricoes") : "sorteio.encerrar_inscricoes",
      entity: "lottery_campaign", entityId: code, data: { de: c.status, para: to },
    });
  }, actor.id);
}

export async function setOrderMethod(actor: Actor, code: string, method: "fixa" | "sorteada", fixed: Record<string, string[]> | null, note: string) {
  return asSystem(async (tx) => {
    await assertAdmin(tx);
    const c = await lockCampaign(tx, code);
    if (c.freeze_hash) throw new RuleError("A ordem já foi congelada.");
    const { periods, venues } = await periodsAndVenues(tx, c.id);
    if (method === "fixa") {
      const codes = venues.map((v) => v.code).sort();
      for (const p of periods) {
        const f = fixed?.[p.code];
        if (!f || [...f].sort().join() !== codes.join() || new Set(f).size !== f.length)
          throw new RuleError(`Informe a ordem completa dos ${codes.length} salões para ${p.label}, sem repetir.`);
      }
    }
    if (note.trim().length < 10) throw new RuleError("Registre a fonte da decisão (ex.: deliberação, ata ou comunicado) com pelo menos 10 caracteres.");
    await tx`update lottery_campaigns set order_method = ${method}, order_note = ${note.trim()} where id = ${c.id}`;
    await tx`update parameters set status = 'definido',
             value = ${tx.json({ metodo: method, ordem_fixa: method === "fixa" ? fixed : null } as never)},
             source = ${note.trim()}, updated_by = ${actor.id}, updated_at = now()
             where key = 'sorteio.ordem_saloes'`;
    await audit(tx, { actorId: actor.id, actorLabel: actor.label, action: "sorteio.ordem", entity: "lottery_campaign", entityId: code,
      data: { metodo: method, ordem_fixa: method === "fixa" ? fixed : null, fonte: note.trim() } });
  }, actor.id);
}

// ---------------------------------------------------------------------------
// Congelamento da lista + lacre da chave da rodada 1
// ---------------------------------------------------------------------------
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function buildFreezeDoc(tx: Tx, c: Record<string, any>): Promise<FreezeDoc> {
  const { periods, venues } = await periodsAndVenues(tx, c.id);
  const entries = await tx`
    select p.code as period, s.code as space, u.code as unit
    from lottery_entries e join lottery_periods p on p.id = e.period_id
    join spaces s on s.id = e.space_id join units u on u.id = e.unit_id
    where e.campaign_id = ${c.id} and e.status = 'ativa'`;
  let ordemFixa: Record<string, string[]> | null = null;
  if (c.order_method === "fixa") {
    const [param] = await tx`select value from parameters where key = 'sorteio.ordem_saloes'`;
    ordemFixa = (param?.value?.ordem_fixa as Record<string, string[]>) ?? null;
  }
  return {
    campanha: c.code,
    regras_versao: c.rules_version,
    termos_versao: c.terms_version,
    metodo_ordem: c.order_method,
    ordem_fixa: ordemFixa,
    periodos: periods.map((p) => ({
      codigo: p.code,
      saloes: venues.map((v) => ({
        codigo: v.code,
        apartamentos: [...new Set(entries.filter((e) => e.period === p.code && e.space === v.code).map((e) => e.unit as string))].sort(byUnitCode),
      })),
    })),
  };
}

async function sealRound(tx: Tx, campaignId: string, round: number, actorId: string) {
  const seed = randomSeedHex();
  const commitment = await sha256Hex(seed);
  await tx`insert into lottery_rounds (campaign_id, round, status, seed_commitment, sealed_by)
           values (${campaignId}, ${round}, 'lacrada', ${commitment}, ${actorId})`;
  await tx`insert into lottery_secrets (campaign_id, round, seed) values (${campaignId}, ${round}, ${seed})`;
  return commitment;
}

export async function freeze(actor: Actor, code: string) {
  return asSystem(async (tx) => {
    await assertAdmin(tx);
    const c = await lockCampaign(tx, code);
    if (c.status !== "inscricoes_encerradas") throw new RuleError("Encerre as inscrições antes de congelar a lista.");
    if (c.order_method === "pendente") throw new RuleError("Defina e divulgue o método de ordem dos salões antes de congelar (parâmetro pendente).");
    const doc = await buildFreezeDoc(tx, c);
    const hash = await freezeHash(doc);
    await tx`update lottery_campaigns set status = 'congelada', frozen_at = now(), frozen_by = ${actor.id},
             freeze_doc = ${tx.json(doc as never)}, freeze_hash = ${hash} where id = ${c.id}`;
    const commitment = await sealRound(tx, c.id, 1, actor.id);
    const total = doc.periodos.reduce((n, p) => n + p.saloes.reduce((m, s) => m + s.apartamentos.length, 0), 0);
    await audit(tx, { actorId: actor.id, actorLabel: actor.label, action: "sorteio.congelar", entity: "lottery_campaign", entityId: code,
      data: { hash_lista: hash, lacre_chave_rodada_1: commitment, inscricoes_por_etapa: total } });
    return { hash, commitment };
  }, actor.id);
}

// ---------------------------------------------------------------------------
// Execução
// ---------------------------------------------------------------------------
export async function startRound(actor: Actor, code: string, publicEntropy: string) {
  const entropy = publicEntropy.trim();
  if (!/^[0-9A-Za-z .,\-/]{3,60}$/.test(entropy))
    throw new RuleError("Informe o número público (3 a 60 caracteres: dígitos, letras, espaço, ponto, vírgula, hífen ou barra).");
  return asSystem(async (tx) => {
    await assertAdmin(tx);
    const c = await lockCampaign(tx, code);
    if (c.status !== "congelada") throw new RuleError("A lista precisa estar congelada e a rodada lacrada.");
    const round = c.current_round;
    const [r] = await tx`select * from lottery_rounds where campaign_id = ${c.id} and round = ${round} for update`;
    if (!r || r.status !== "lacrada") throw new RuleError("Rodada indisponível.");
    const [{ seed }] = await tx`select seed from lottery_secrets where campaign_id = ${c.id} and round = ${round}`;
    const doc = c.freeze_doc as FreezeDoc;
    const order = await resolveOrder(doc, round, seed, entropy);
    const { periods, venues } = await periodsAndVenues(tx, c.id);
    for (const p of periods) {
      let seq = 1;
      for (const spaceCode of order[p.code]) {
        const v = venues.find((x) => x.code === spaceCode)!;
        await tx`insert into lottery_stages (campaign_id, round, period_id, space_id, seq)
                 values (${c.id}, ${round}, ${p.id}, ${v.id}, ${seq++})`;
      }
    }
    await tx`update lottery_rounds set status = 'em_andamento', public_entropy = ${entropy}, started_at = now(),
             started_by = ${actor.id}, order_doc = ${tx.json(order as never)} where campaign_id = ${c.id} and round = ${round}`;
    await tx`update lottery_campaigns set status = 'em_sorteio' where id = ${c.id}`;
    await audit(tx, { actorId: actor.id, actorLabel: actor.label, action: "sorteio.iniciar", entity: "lottery_campaign", entityId: code,
      data: { rodada: round, numero_publico: entropy, ordem: order, metodo_ordem: doc.metodo_ordem } });
    return { order };
  }, actor.id);
}

/**
 * Sorteia uma etapa. Idempotente: se a etapa já foi sorteada (clique duplo,
 * atualização da página, requisição repetida), devolve o resultado gravado.
 */
export async function drawStage(actor: Actor, code: string, stageId: string) {
  return asSystem(async (tx) => {
    await assertAdmin(tx);
    const c = await lockCampaign(tx, code); // serializa todas as execuções da campanha
    const [st] = await tx`select * from lottery_stages where id = ${stageId} and campaign_id = ${c.id} for update`;
    if (!st) throw new RuleError("Etapa não encontrada.");
    if (st.status !== "pendente") return { already: true, stageId };
    if (c.status !== "em_sorteio" || st.round !== c.current_round) throw new RuleError("Esta rodada não está em andamento.");
    const prevPending = await tx`select 1 from lottery_stages where campaign_id = ${c.id} and round = ${st.round}
                                  and period_id = ${st.period_id} and seq < ${st.seq} and status = 'pendente'`;
    if (prevPending.length) throw new RuleError("Sorteie as etapas na ordem definida.");
    const [p] = await tx`select code from lottery_periods where id = ${st.period_id}`;
    const [s] = await tx`select code from spaces where id = ${st.space_id}`;
    const winners = (await tx`
      select u.code from lottery_stages x join units u on u.id = x.winner_unit_id
      where x.campaign_id = ${c.id} and x.round = ${st.round} and x.period_id = ${st.period_id} and x.status = 'sorteada'`).map((r) => r.code as string);
    const [{ seed }] = await tx`select seed from lottery_secrets where campaign_id = ${c.id} and round = ${st.round}`;
    const [r] = await tx`select public_entropy from lottery_rounds where campaign_id = ${c.id} and round = ${st.round}`;
    const res = await drawOneStage({ doc: c.freeze_doc as FreezeDoc, round: st.round, seedHex: seed, entropy: r.public_entropy,
      period: p.code, space: s.code, seq: st.seq, previousWinners: winners });
    let winnerUnitId: string | null = null, winnerEntryId: string | null = null;
    if (res.winner) {
      const [w] = await tx`
        select e.id as entry_id, e.unit_id from lottery_entries e join units u on u.id = e.unit_id
        where e.campaign_id = ${c.id} and u.code = ${res.winner} and e.period_id = ${st.period_id}
          and e.space_id = ${st.space_id} and e.status = 'ativa'`;
      winnerUnitId = w.unit_id; winnerEntryId = w.entry_id;
    }
    await tx`update lottery_stages set status = ${res.winner ? "sorteada" : "sem_elegiveis"},
             eligible = ${tx.json(res.eligible as never)}, eligible_hash = ${res.eligibleHash},
             excluded = ${tx.json(res.excluded as never)}, draw_index = ${res.index}, rng_counter = ${res.counter},
             winner_unit_id = ${winnerUnitId}, winner_entry_id = ${winnerEntryId},
             executed_by = ${actor.id}, executed_at = clock_timestamp()
             where id = ${stageId}`;
    await audit(tx, { actorId: actor.id, actorLabel: actor.label, action: "sorteio.etapa", entity: "lottery_stage", entityId: stageId,
      data: { campanha: code, rodada: st.round, periodo: p.code, salao: s.code, ordem: st.seq,
              elegiveis: res.eligible, excluidos_por_ja_terem_vencido: res.excluded, hash_elegiveis: res.eligibleHash,
              posicao_sorteada: res.index === null ? null : res.index + 1, contador: res.counter, vencedor: res.winner } });
    return { already: false, stageId };
  }, actor.id);
}

export async function concludeRound(actor: Actor, code: string) {
  return asSystem(async (tx) => {
    await assertAdmin(tx);
    const c = await lockCampaign(tx, code);
    if (c.status !== "em_sorteio") throw new RuleError("Não há sorteio em andamento.");
    const round = c.current_round;
    const pending = await tx`select 1 from lottery_stages where campaign_id = ${c.id} and round = ${round} and status = 'pendente'`;
    if (pending.length) throw new RuleError("Ainda há etapas a sortear.");
    const [{ seed }] = await tx`select seed from lottery_secrets where campaign_id = ${c.id} and round = ${round}`;
    // Conferência independente: refaz a rodada inteira e compara com o que foi gravado.
    const [r] = await tx`select public_entropy from lottery_rounds where campaign_id = ${c.id} and round = ${round}`;
    const check = await computeRound(c.freeze_doc as FreezeDoc, round, seed, r.public_entropy);
    const stored = await tx`
      select p.code as period, s.code as space, u.code as winner from lottery_stages x
      join lottery_periods p on p.id = x.period_id join spaces s on s.id = x.space_id left join units u on u.id = x.winner_unit_id
      where x.campaign_id = ${c.id} and x.round = ${round}`;
    for (const st of check.stages) {
      const got = stored.find((x) => x.period === st.period && x.space === st.space);
      if ((got?.winner ?? null) !== st.winner) throw new RuleError("Falha na conferência interna do resultado. Nada foi concluído; acione o suporte.");
    }
    await tx`update lottery_rounds set status = 'concluida', concluded_at = now(), concluded_by = ${actor.id}, seed_revealed = ${seed}
             where campaign_id = ${c.id} and round = ${round}`;
    // Reserva de cada vencedor para o período completo (dois dias), com uma única taxa.
    const wins = await tx`
      insert into bookings (space_id, unit_id, responsible_user_id, responsible_name, kind, status, period, blocked, origin,
                            lottery_stage_id, fee_status, notes, created_by)
      select x.space_id, x.winner_unit_id, e.applicant_user_id, e.applicant_name, 'salao_festivo', 'confirmada',
             tstzrange(p.start_date::timestamp at time zone 'America/Sao_Paulo', (p.end_date + 1)::timestamp at time zone 'America/Sao_Paulo', '[)'),
             tstzrange(p.start_date::timestamp at time zone 'America/Sao_Paulo', (p.end_date + 1)::timestamp at time zone 'America/Sao_Paulo', '[)'),
             'sorteio', x.id, 'pendente_definicao',
             'Reserva gerada pelo sorteio. Período completo de dois dias, uma única taxa (valor pendente de definição). Horários de entrega/devolução e prazo de aceite: pendentes de política aprovada.',
             ${actor.id}
      from lottery_stages x join lottery_periods p on p.id = x.period_id join lottery_entries e on e.id = x.winner_entry_id
      where x.campaign_id = ${c.id} and x.round = ${round} and x.status = 'sorteada'
      returning id`;
    await tx`update lottery_campaigns set status = 'concluida', concluded_at = now() where id = ${c.id}`;
    await audit(tx, { actorId: actor.id, actorLabel: actor.label, action: "sorteio.concluir", entity: "lottery_campaign", entityId: code,
      data: { rodada: round, chave_revelada: seed, reservas_geradas: wins.length } });
  }, actor.id);
}

export async function annulRound(actor: Actor, code: string, reason: string) {
  const why = reason.trim();
  if (why.length < 20) throw new RuleError("Descreva a justificativa da anulação (mínimo de 20 caracteres).");
  return asSystem(async (tx) => {
    await assertAdmin(tx);
    const c = await lockCampaign(tx, code);
    if (!["em_sorteio", "concluida"].includes(c.status)) throw new RuleError("Não há rodada em andamento ou concluída para anular.");
    const round = c.current_round;
    const [{ seed }] = await tx`select seed from lottery_secrets where campaign_id = ${c.id} and round = ${round}`;
    await tx`update lottery_rounds set status = 'anulada', annulled_at = now(), annulled_by = ${actor.id}, annul_reason = ${why},
             seed_revealed = coalesce(seed_revealed, ${seed}) where campaign_id = ${c.id} and round = ${round}`;
    await tx`update lottery_stages set status = 'anulada' where campaign_id = ${c.id} and round = ${round}`;
    const cancelled = await tx`
      update bookings set status = 'cancelada', cancelled_at = now(), cancel_reason = ${"Rodada " + round + " do sorteio anulada: " + why}
      where lottery_stage_id in (select id from lottery_stages where campaign_id = ${c.id} and round = ${round})
        and status in ('solicitada', 'confirmada') returning id`;
    const next = round + 1;
    const commitment = await sealRound(tx, c.id, next, actor.id);
    await tx`update lottery_campaigns set status = 'congelada', current_round = ${next}, concluded_at = null where id = ${c.id}`;
    await audit(tx, { actorId: actor.id, actorLabel: actor.label, action: "sorteio.anular", entity: "lottery_campaign", entityId: code,
      data: { rodada_anulada: round, justificativa: why, chave_revelada: seed, reservas_canceladas: cancelled.length,
              nova_rodada: next, lacre_nova_rodada: commitment } });
  }, actor.id);
}

// ---------------------------------------------------------------------------
// Simulação — isolada dos resultados oficiais (tabela própria, chave descartável)
// ---------------------------------------------------------------------------
export async function simulate(actor: Actor, code: string, fixedOverride?: Record<string, string[]> | null) {
  return asSystem(async (tx) => {
    await assertAdmin(tx);
    const [c] = await tx`select * from lottery_campaigns where code = ${code}`;
    if (!c) throw new RuleError("Campanha não encontrada.");
    const basis = c.freeze_doc ? "lista_congelada" : "inscricoes_atuais";
    let doc: FreezeDoc = c.freeze_doc ?? (await buildFreezeDoc(tx, c));
    if (doc.metodo_ordem !== "fixa" && doc.metodo_ordem !== "sorteada") {
      doc = { ...doc, metodo_ordem: fixedOverride ? "fixa" : "sorteada", ordem_fixa: fixedOverride ?? null };
    }
    const seed = randomSeedHex();
    const entropy = `SIMULACAO-${Date.now()}`;
    const result = await computeRound(doc, 1, seed, entropy);
    const payload = { aviso: "SIMULAÇÃO — sem validade oficial", base: basis, metodo_ordem: doc.metodo_ordem, chave: seed, numero_publico: entropy, ...result };
    const [row] = await tx`insert into lottery_simulations (campaign_id, created_by, basis, result)
                           values (${c.id}, ${actor.id}, ${basis}, ${tx.json(payload as never)}) returning id`;
    await audit(tx, { actorId: actor.id, actorLabel: actor.label, action: "sorteio.simulacao", entity: "lottery_simulation", entityId: row.id,
      data: { campanha: code, base: basis } });
    return { id: row.id as string, ...payload };
  }, actor.id);
}
