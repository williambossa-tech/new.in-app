import Link from "next/link";
import { notFound } from "next/navigation";
import {
  anularAction, concluirAction, congelarAction, desistenciaAdminAction, horarioAction, revelarReservaAction, iniciarAction, invalidarInscricaoAction, lancarEmailAction,
  ordemAction, simularAction, situacaoInscricoesAction, sortearEtapaAction,
} from "@/app/actions/admin-sorteio";
import { AdminTabs } from "@/components/AppShell";
import { ActionForm, SubmitButton } from "@/components/forms";
import { CampaignBadge, Notice, Pending, Stat } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { asUser } from "@/lib/db";
import { fmtDate, fmtDateTime, fmtDateTimeSec } from "@/lib/format";
import { loadCampaign } from "@/lib/lottery/queries";

export const metadata = { title: "Administração do sorteio" };

const STEP = ["rascunho", "inscricoes_abertas", "inscricoes_encerradas", "congelada", "em_sorteio", "concluida"];

export default async function AdminSorteio({ params, searchParams }: { params: Promise<{ code: string }>; searchParams: Promise<{ todas?: string }> }) {
  const { code } = await params;
  const { todas } = await searchParams;
  const me = await requireRole("admin", "sindico", "conselheiro");
  const v = await loadCampaign(me.id, code);
  if (!v) notFound();
  const { campaign: c, periods, venues, rounds, stages, counts, params: pend } = v;
  const extra = await asUser(me.id, async (tx) => {
    const entries = await tx`
      select e.id, e.status, e.status_reason, e.applicant_name, e.contact, e.origin, e.created_at, e.email_received_at,
             u.code as unit, p.code as period, s.code as space, s.name as space_name, l.full_name as launched_by
      from lottery_entries e join units u on u.id = e.unit_id join lottery_periods p on p.id = e.period_id join spaces s on s.id = e.space_id
      left join users l on l.id = e.launched_by
      where e.campaign_id = ${c.id} order by e.created_at desc`;
    const sims = await tx`select id, created_at, basis, result from lottery_simulations where campaign_id = ${c.id} order by created_at desc limit 3`;
    const [{ ok, head_hash }] = await tx`select ok, head_hash from app.audit_verify()`;
    return { entries, sims, chainOk: ok as boolean, head: head_hash as string | null };
  });
  const step = STEP.indexOf(c.status);
  const active = extra.entries.filter((e) => e.status === "ativa");
  const unitsCount = new Set(active.map((e) => e.unit)).size;
  const round = rounds.find((r) => r.round === c.current_round);
  const cur = stages.filter((s) => s.round === c.current_round);
  const orderParam = pend.find((p) => p.key === "sorteio.ordem_saloes");
  const shown = todas ? extra.entries : extra.entries.slice(0, 40);
  const deadlinePassed = new Date(c.deadline) < new Date();

  return (
    <>
      <AdminTabs active="/admin/sorteios/festas-2026" />
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="eyebrow">Administração do sorteio</p>
          <h1 className="h1">{c.title}</h1>
          <div className="mt-2 flex flex-wrap gap-2"><CampaignBadge status={c.status} />
            {!extra.chainOk && <span className="badge-coral">Trilha de auditoria com divergência</span>}</div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/telao/${code}`} className="btn-secondary btn-sm" target="_blank">Abrir telão ↗</Link>
          <a href={`/api/admin/sorteios/${code}/ata`} className="btn-secondary btn-sm">Ata (PDF)</a>
          <a href={`/api/admin/sorteios/${code}/inscricoes`} className="btn-secondary btn-sm">Inscrições (CSV)</a>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Apartamentos inscritos" value={unitsCount} />
        <Stat label="Inscrições ativas" value={active.length} hint="unidade × salão × período" />
        <Stat label="Prazo" value={fmtDate(c.registration_deadline_date)} hint={c.registration_deadline ? fmtDateTime(c.registration_deadline) : "horário pendente (até 23h59)"} />
        <Stat label="Sorteio" value={fmtDate(c.draw_date)} hint={c.draw_at ? fmtDateTime(c.draw_at) : "horário pendente"} />
      </div>

      {/* Linha do tempo */}
      <ol className="mb-6 grid gap-2 sm:grid-cols-6">
        {["Preparação", "Inscrições abertas", "Inscrições encerradas", "Lista congelada", "Sorteio", "Resultado oficial"].map((l, i) => (
          <li key={l} className={`rounded-2xl px-3 py-2 text-sm font-bold ring-1 ${i < step ? "bg-verde-50 text-[#23803e] ring-[#c6ebd1]" : i === step ? "bg-violeta text-white ring-violeta" : "bg-white text-noite-50 ring-linha"}`}>
            {i + 1}. {l}
          </li>
        ))}
      </ol>

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="flex flex-col gap-6">
          {/* 1. Inscrições */}
          <section className="card p-6">
            <h2 className="h2">1. Inscrições</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              {periods.map((p) => venues.map((s) => {
                const n = counts.find((x) => x.periodId === p.id && x.spaceId === s.id)?.units ?? 0;
                return (
                  <div key={`${p.id}${s.id}`} className="rounded-2xl bg-fundo p-3">
                    <p className="text-xs font-black uppercase text-noite-50">{p.code === "natal" ? "Natal" : "Ano Novo"}</p>
                    <p className="font-bold">{s.name.split(" (")[0]}</p>
                    <p className="text-2xl font-black text-violeta-700">{n}</p>
                  </div>
                );
              }))}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {(c.status === "rascunho" || c.status === "inscricoes_encerradas") && (
                <ActionForm action={situacaoInscricoesAction}>
                  <input type="hidden" name="campaign" value={code} /><input type="hidden" name="to" value="inscricoes_abertas" />
                  <SubmitButton className="btn-success" confirm={c.status === "rascunho" ? "Abrir as inscrições pelo aplicativo para todos os moradores aprovados?" : "Reabrir as inscrições?"}>
                    {c.status === "rascunho" ? "Abrir inscrições no aplicativo" : "Reabrir inscrições"}
                  </SubmitButton>
                </ActionForm>
              )}
              {c.status === "inscricoes_abertas" && (
                <ActionForm action={situacaoInscricoesAction}>
                  <input type="hidden" name="campaign" value={code} /><input type="hidden" name="to" value="inscricoes_encerradas" />
                  <SubmitButton className="btn-danger" confirm={deadlinePassed ? "Encerrar as inscrições?" : "O prazo ainda não terminou. Encerrar mesmo assim?"}>Encerrar inscrições</SubmitButton>
                </ActionForm>
              )}
            </div>
            {c.status === "inscricoes_abertas" && deadlinePassed && (
              <p className="mt-2 text-sm font-bold text-[#c23a2b]">O prazo terminou: o aplicativo já não aceita inscrições. Encerre para seguir ao congelamento.</p>
            )}

            {["rascunho", "inscricoes_abertas", "inscricoes_encerradas"].includes(c.status) && (
              <details className="mt-5 rounded-2xl border border-linha p-4">
                <summary className="cursor-pointer font-black">Lançar inscrição recebida por e-mail (vanguard.newin@gmail.com)</summary>
                <ActionForm action={lancarEmailAction} className="mt-4 space-y-3" resetOnSuccess>
                  <input type="hidden" name="campaign" value={code} />
                  <div className="grid gap-3 sm:grid-cols-3">
                    <input className="input" name="unit" placeholder="Apto" required />
                    <input className="input sm:col-span-2" name="applicant_name" placeholder="Nome completo" required />
                    <input className="input" name="contact" placeholder="Contato" required />
                    <div className="sm:col-span-2">
                      <input className="input" name="received_at" type="datetime-local" required />
                      <p className="field-hint">Data e hora de recebimento do e-mail (horário de Curitiba).</p>
                    </div>
                    <input className="input sm:col-span-3" name="subject" defaultValue="Sorteios de Salões 2026" placeholder="Assunto" />
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {periods.map((p) => (
                      <div key={p.id} className="rounded-xl bg-fundo p-3">
                        <p className="mb-1 text-sm font-black">{p.label}</p>
                        {venues.map((s) => (
                          <label key={s.id} className="flex items-center gap-2 py-1 text-sm font-bold">
                            <input type="checkbox" name="combo" value={`${p.id}|${s.id}`} className="h-4 w-4 accent-violeta" /> {s.name.split(" (")[0]}
                          </label>
                        ))}
                      </div>
                    ))}
                  </div>
                  <label className="flex items-center gap-2 text-sm font-bold">
                    <input type="checkbox" name="accepted" className="h-4 w-4 accent-violeta" /> O e-mail contém o aceite das regras.
                  </label>
                  <SubmitButton>Lançar inscrição</SubmitButton>
                </ActionForm>
              </details>
            )}

            <details className="mt-5" open={step <= 2}>
            <summary className="cursor-pointer font-black">Lista de inscrições ({extra.entries.length})</summary>
            <div className="table-wrap mt-3">
              <table className="tbl">
                <thead><tr><th>Apto</th><th>Período / salão</th><th>Interessado</th><th>Origem</th><th>Situação</th></tr></thead>
                <tbody>
                  {shown.map((e) => (
                    <tr key={e.id}>
                      <td className="font-black">{e.unit}</td>
                      <td>{e.period === "natal" ? "Natal" : "Ano Novo"} · {e.space_name.split(" (")[0]}</td>
                      <td>{e.applicant_name}<div className="text-xs text-noite-50">{e.contact}</div></td>
                      <td className="text-xs">{e.origin === "email" ? <>E-mail de {fmtDateTime(e.email_received_at)}<br />lançado por {e.launched_by}</> : <>App · {fmtDateTime(e.created_at)}</>}</td>
                      <td>
                        {e.status === "ativa" ? <span className="badge-turquesa">Ativa</span> : <span className="badge-cinza" title={e.status_reason ?? ""}>{e.status}</span>}
                        {e.status === "ativa" && ["inscricoes_abertas", "inscricoes_encerradas"].includes(c.status) && (
                          <details className="mt-1">
                            <summary className="cursor-pointer text-xs font-bold text-[#c23a2b]">Invalidar</summary>
                            <ActionForm action={invalidarInscricaoAction} className="mt-1 space-y-1">
                              <input type="hidden" name="campaign" value={code} /><input type="hidden" name="entry_id" value={e.id} />
                              <input className="input min-h-9 text-sm" name="reason" placeholder="Motivo" required />
                              <SubmitButton className="btn-danger btn-sm">Confirmar</SubmitButton>
                            </ActionForm>
                          </details>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!todas && extra.entries.length > shown.length && <Link className="mt-2 inline-block text-sm font-bold text-violeta-700" href="?todas=1">Ver todas ({extra.entries.length})</Link>}
            </div>
            </details>
          </section>

          {/* 2. Ordem */}
          <section className="card p-6">
            <h2 className="h2">2. Ordem de sorteio dos salões</h2>
            <p className="mt-1 text-sm muted">A ordem influencia o resultado, porque quem vence sai das etapas seguintes do mesmo período. O sistema não escolhe a ordem sozinho.</p>
            {c.order_method === "pendente" ? <p className="mt-2"><Pending /></p> : (
              <Notice tone="turquesa" title={c.order_method === "fixa" ? "Ordem fixa definida" : "A ordem será sorteada no início do sorteio"}>
                {c.order_method === "fixa" && orderParam?.value?.ordem_fixa && periods.map((p) => (
                  <p key={p.id}>{p.code === "natal" ? "Natal" : "Ano Novo"}: {(orderParam.value.ordem_fixa[p.code] as string[]).map((sc) => venues.find((x) => x.code === sc)?.name.split(" (")[0]).join(" → ")}</p>
                ))}
                <p className="text-xs">Fonte: {c.order_note}</p>
              </Notice>
            )}
            {!c.freeze_hash && (
              <ActionForm action={ordemAction} className="mt-4 space-y-3">
                <input type="hidden" name="campaign" value={code} />
                <div className="grid gap-2 sm:grid-cols-2">
                  <label className="flex items-start gap-2 rounded-2xl border border-linha p-3 has-[:checked]:border-violeta has-[:checked]:bg-violeta-50">
                    <input type="radio" name="method" value="sorteada" defaultChecked={c.order_method === "sorteada"} className="mt-1 accent-violeta" required />
                    <span><b>Sortear a ordem</b><br /><span className="text-sm muted">A ordem é sorteada no início, com a mesma chave lacrada e o número público.</span></span>
                  </label>
                  <label className="flex items-start gap-2 rounded-2xl border border-linha p-3 has-[:checked]:border-violeta has-[:checked]:bg-violeta-50">
                    <input type="radio" name="method" value="fixa" defaultChecked={c.order_method === "fixa"} className="mt-1 accent-violeta" />
                    <span><b>Ordem fixa divulgada</b><br /><span className="text-sm muted">Preencha a sequência abaixo para cada período.</span></span>
                  </label>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {periods.map((p) => (
                    <div key={p.id} className="rounded-2xl bg-fundo p-3">
                      <p className="mb-2 text-sm font-black">{p.label}</p>
                      {[1, 2, 3].map((i) => (
                        <select key={i} name={`${p.code}_${i}`} className="input mb-2 min-h-10" defaultValue={orderParam?.value?.ordem_fixa?.[p.code]?.[i - 1] ?? ""}>
                          <option value="">{i}º salão…</option>
                          {venues.map((s) => <option key={s.id} value={s.code}>{s.name.split(" (")[0]}</option>)}
                        </select>
                      ))}
                    </div>
                  ))}
                </div>
                <input className="input" name="note" placeholder="Fonte da decisão (ex.: deliberação do conselho em 12/11/2026, divulgada no comunicado X)" required />
                <SubmitButton className="btn-secondary">Registrar método</SubmitButton>
              </ActionForm>
            )}
          </section>

          {/* 3. Congelamento */}
          <section className="card p-6">
            <h2 className="h2">3. Congelar a lista e lacrar a chave</h2>
            {c.freeze_hash ? (
              <dl className="mt-3 space-y-2 text-sm">
                <div><dt className="font-bold">Congelada em {fmtDateTimeSec(c.frozen_at)} — impressão digital</dt><dd className="mono">{c.freeze_hash}</dd></div>
                {round && <div><dt className="font-bold">Lacre da chave da rodada {round.round}</dt><dd className="mono">{round.seed_commitment}</dd></div>}
                <p className="text-noite-70">Divulgue estes dois códigos aos moradores <b>antes</b> do sorteio (aplicativo, mural, grupo).</p>
              </dl>
            ) : (
              <>
                <p className="mt-1 text-sm muted">Depois de congelada, nenhuma inscrição pode ser incluída, cancelada ou alterada — nem pela administração.</p>
                <ActionForm action={congelarAction} className="mt-3">
                  <input type="hidden" name="campaign" value={code} />
                  <SubmitButton className="btn-primary" confirm="Congelar a lista de inscrições? Esta ação é definitiva."
                    >Congelar lista</SubmitButton>
                </ActionForm>
                {c.status !== "inscricoes_encerradas" && <p className="mt-2 text-sm text-noite-50">Disponível após encerrar as inscrições.</p>}
              </>
            )}
          </section>

          {/* 4. Sorteio */}
          <section className={`card p-6 ${step >= 3 ? "order-first" : ""}`}>
            <h2 className="h2">4. Sorteio{round ? ` — rodada ${round.round}` : ""}</h2>
            {c.status === "congelada" && (
              <ActionForm action={iniciarAction} className="mt-3 space-y-3">
                <input type="hidden" name="campaign" value={code} />
                <div>
                  <label className="field-label" htmlFor="entropy">Número público</label>
                  <input id="entropy" className="input" name="entropy" placeholder="ex.: 7 3 9 1 5 (dígitos ditos por moradores presentes)" required />
                  <p className="field-hint">Peça a 3–5 moradores presentes que digam um algarismo cada. Esse número entra na conta junto com a chave lacrada.</p>
                </div>
                <SubmitButton className="btn-primary" confirm="Iniciar o sorteio com este número público?">Iniciar sorteio</SubmitButton>
              </ActionForm>
            )}
            {round?.public_entropy && <p className="mt-2 text-sm">Número público: <b className="mono">{round.public_entropy}</b> · iniciado em {fmtDateTime(round.started_at)}</p>}
            {cur.length > 0 && (
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                {periods.map((p) => {
                  const ps = cur.filter((s) => s.period_code === p.code);
                  const next = ps.find((s) => s.status === "pendente");
                  return (
                    <div key={p.id} className="rounded-2xl border border-linha p-4">
                      <p className="font-black">{p.label}</p>
                      <ul className="mt-3 space-y-3">
                        {ps.map((s) => (
                          <li key={s.id} className="rounded-xl bg-fundo p-3">
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-bold">{s.seq}º · {s.space_name.split(" (")[0]}</span>
                              {s.status === "sorteada" && <span className="text-xl font-black text-violeta-700">{s.holder_code ? `Apto ${s.holder_code}` : "Sem titular"}{s.holder_code !== s.winner_code && <span className="ml-1 text-xs font-normal text-noite-50">(sorteado: {s.winner_code})</span>}</span>}
                              {s.status === "sem_elegiveis" && <span className="badge-cinza">Sem elegíveis</span>}
                              {s.status === "anulada" && <span className="badge-coral">Anulada</span>}
                              {s.status === "pendente" && next?.id === s.id && c.status === "em_sorteio" && (
                                <ActionForm action={sortearEtapaAction}>
                                  <input type="hidden" name="campaign" value={code} /><input type="hidden" name="stage_id" value={s.id} />
                                  <SubmitButton className="btn-primary btn-sm" pendingText="Sorteando…">Sortear</SubmitButton>
                                </ActionForm>
                              )}
                            </div>
                            {(s.substitutions as Record<string, unknown>[] as { id: string; n: number; withdrawn_code: string; origin: string; reason: string; eligible: string[]; new_winner_code: string | null; created_at: Date }[])?.map((x) => (
                              <p key={x.id} className="mt-1 text-xs text-[#8a6100]">
                                {x.n}ª desistência: apto {x.withdrawn_code} ({x.origin === "morador" ? "pelo morador" : `pela administração — ${x.reason}`}) ·
                                novo sorteio entre {(x.eligible as string[]).length}: {x.new_winner_code ? <b>apto {x.new_winner_code}</b> : "sem inscritos disponíveis"} · {fmtDateTimeSec(x.created_at)}
                              </p>
                            ))}
                            {c.status === "concluida" && s.status === "sorteada" && s.holder_code && !round?.reserve_revealed && (
                              <details className="mt-2">
                                <summary className="cursor-pointer text-xs font-bold text-[#c23a2b]">Registrar desistência do apto {s.holder_code}</summary>
                                <ActionForm action={desistenciaAdminAction} className="mt-2 space-y-2">
                                  <input type="hidden" name="campaign" value={code} /><input type="hidden" name="stage_id" value={s.id} />
                                  <input type="hidden" name="unit" value={s.holder_code} />
                                  <input className="input min-h-10 text-sm" name="reason" placeholder="Como a desistência foi comunicada (ex.: e-mail de 02/12)" required />
                                  <SubmitButton className="btn-danger btn-sm" confirm={`Registrar a desistência do apto ${s.holder_code} e sortear novamente entre os demais inscritos?`}>Registrar e sortear novamente</SubmitButton>
                                </ActionForm>
                              </details>
                            )}
                            {s.eligible && (
                              <p className="mt-1 text-xs text-noite-50">
                                {(s.eligible as string[]).length} elegível(is): {(s.eligible as string[]).join(", ") || "—"}
                                {(s.excluded as string[])?.length ? ` · retirados por já terem vencido: ${(s.excluded as string[]).join(", ")}` : ""}
                                {s.draw_index !== null ? ` · posição sorteada ${s.draw_index + 1}` : ""} · {fmtDateTimeSec(s.executed_at)}
                              </p>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </div>
            )}
            {c.status === "em_sorteio" && cur.every((s) => s.status !== "pendente") && (
              <ActionForm action={concluirAction} className="mt-4">
                <input type="hidden" name="campaign" value={code} />
                <SubmitButton className="btn-success" confirm="Concluir o sorteio, revelar a chave e gerar as reservas dos vencedores?">Concluir e revelar a chave</SubmitButton>
              </ActionForm>
            )}
            {round?.seed_revealed && <p className="mt-3 text-sm">Chave revelada: <span className="mono">{round.seed_revealed}</span></p>}
            {round?.reserve_commitment && (
              <div className="mt-4 rounded-2xl bg-fundo p-4 text-sm">
                <p className="font-bold">Desistências</p>
                <p className="text-noite-70">Na desistência do sorteado, o novo sorteio entre os demais inscritos é automático e usa a chave reserva lacrada na conclusão.</p>
                <p className="mt-1">Lacre da chave reserva: <span className="mono">{round.reserve_commitment}</span></p>
                {round.reserve_revealed ? (
                  <p className="mt-1">Período encerrado em {fmtDateTime(round.reserve_revealed_at)} · chave reserva: <span className="mono">{round.reserve_revealed}</span></p>
                ) : c.status === "concluida" && (
                  <ActionForm action={revelarReservaAction} className="mt-2">
                    <input type="hidden" name="campaign" value={code} />
                    <SubmitButton className="btn-secondary btn-sm" confirm="Encerrar o período de desistências e revelar a chave reserva? Depois disso, novas desistências não geram novo sorteio.">
                      Encerrar desistências e revelar chave reserva
                    </SubmitButton>
                  </ActionForm>
                )}
              </div>
            )}
            {["em_sorteio", "concluida"].includes(c.status) && (
              <details className="mt-5 rounded-2xl border border-[#ffd0ca] p-4">
                <summary className="cursor-pointer font-black text-[#c23a2b]">Anular esta rodada…</summary>
                <p className="mt-2 text-sm muted">O resultado não é apagado: fica no histórico como anulado, com sua justificativa, e as reservas geradas são canceladas. Uma nova chave é lacrada para eventual nova rodada. As regras para repetir o sorteio dependem de decisão da administração.</p>
                <ActionForm action={anularAction} className="mt-3 space-y-2">
                  <input type="hidden" name="campaign" value={code} />
                  <textarea className="input" name="reason" rows={3} placeholder="Justificativa detalhada (mínimo de 20 caracteres)" required />
                  <SubmitButton className="btn-danger" confirm="Anular a rodada? Esta ação fica registrada permanentemente.">Anular rodada</SubmitButton>
                </ActionForm>
              </details>
            )}
          </section>
        </div>

        {/* Lateral */}
        <aside className="space-y-6">
          <section className="card p-5">
            <h2 className="text-lg font-black">Horários</h2>
            {(["prazo", "sorteio"] as const).map((w) => (
              <ActionForm key={w} action={horarioAction} className="mt-3 space-y-2">
                <input type="hidden" name="campaign" value={code} /><input type="hidden" name="which" value={w} />
                <label className="field-label">{w === "prazo" ? `Encerramento das inscrições (${fmtDate(c.registration_deadline_date)})` : `Sorteio (${fmtDate(c.draw_date)})`}</label>
                <div className="flex gap-2">
                  <input className="input w-28" type="time" name="time" required
                    defaultValue={(w === "prazo" ? c.registration_deadline : c.draw_at) ? fmtDateTime(w === "prazo" ? c.registration_deadline : c.draw_at).split(" ")[1] : ""} />
                  <input className="input" name="source" placeholder="Fonte da definição" required />
                </div>
                <SubmitButton className="btn-secondary btn-sm">Salvar</SubmitButton>
              </ActionForm>
            ))}
          </section>

          <section className="card p-5">
            <h2 className="text-lg font-black">Simulação</h2>
            <p className="mt-1 text-sm muted">Ensaia o sorteio com uma chave descartável. Não altera inscrições nem resultados oficiais.</p>
            <ActionForm action={simularAction} className="mt-3">
              <input type="hidden" name="campaign" value={code} />
              <SubmitButton className="btn-secondary btn-sm" pendingText="Simulando…">Executar simulação</SubmitButton>
            </ActionForm>
            {extra.sims.map((s) => {
              const r = s.result as { stages: { period: string; space: string; winner: string | null; eligible: string[] }[]; metodo_ordem: string };
              return (
                <div key={s.id} className="relative mt-4 overflow-hidden rounded-2xl border-2 border-dashed border-amarelo bg-amarelo-50 p-3 text-sm">
                  <p className="font-black text-[#8a6100]">SIMULAÇÃO · sem validade · {fmtDateTime(s.created_at)}</p>
                  <p className="text-xs text-noite-50">Base: {s.basis === "lista_congelada" ? "lista congelada" : "inscrições atuais"} · ordem {r.metodo_ordem}</p>
                  <ul className="mt-1">
                    {r.stages.map((st, i) => (
                      <li key={i}>{st.period === "natal" ? "Natal" : "Ano Novo"} · {venues.find((x) => x.code === st.space)?.name.split(" (")[0]}: <b>{st.winner ?? "—"}</b> <span className="text-xs text-noite-50">({st.eligible.length})</span></li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </section>

          <section className="card p-5">
            <h2 className="text-lg font-black">Pendências desta campanha</h2>
            <ul className="mt-2 space-y-2 text-sm">
              {pend.map((p) => (
                <li key={p.key} className="flex items-start gap-2">
                  {p.status === "pendente" ? <span className="badge-amarelo shrink-0">Pendente</span> : <span className="badge-verde shrink-0">Definido</span>}
                  <span>{p.label}</span>
                </li>
              ))}
            </ul>
            <Link href="/admin/parametros" className="mt-3 inline-block text-sm font-bold text-violeta-700">Registrar definições →</Link>
          </section>

          <section className="card p-5 text-sm">
            <h2 className="text-lg font-black">Trilha de auditoria</h2>
            <p className="mt-1">{extra.chainOk ? <span className="badge-verde">Íntegra</span> : <span className="badge-coral">Divergência</span>}</p>
            <p className="mono mt-2 text-noite-50">{extra.head}</p>
            <Link href="/admin/auditoria" className="mt-2 inline-block font-bold text-violeta-700">Ver eventos →</Link>
          </section>
        </aside>
      </div>
    </>
  );
}
