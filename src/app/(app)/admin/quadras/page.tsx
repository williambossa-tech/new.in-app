import Link from "next/link";
import { alterarQuadraAction, cancelarQuadraAction, configQuadraAction, decidirQuadraAction, encerrarProgramacaoAction, programacaoQuadraAction } from "@/app/actions/quadras";
import { AdminTabs } from "@/components/AppShell";
import { CancelWithReason } from "@/components/CancelWithReason";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Empty, Stat } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { addDays, todayIso } from "@/lib/bmg/rules";
import { asUser } from "@/lib/db";
import { COURTS, courtReport, courtSettings, isCourt, type CourtKey } from "@/lib/quadras/service";

export const dynamic = "force-dynamic";
export const metadata = { title: "Quadras · Administração" };
type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const hm = (d: Date) => new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" }).format(d);
const dLong = (d: Date) => new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "short", day: "2-digit", month: "2-digit" }).format(d).replace(".", "");
const WD = ["", "seg", "ter", "qua", "qui", "sex", "sáb", "dom"];
const STATUS: Record<string, [string, string]> = {
  confirmada: ["badge-verde", "Confirmado"], solicitada: ["badge-amarelo", "Solicitado"], recusada: ["badge-coral", "Rejeitado"],
  cancelada: ["badge-cinza", "Cancelado"], em_uso: ["badge-verde", "Em uso"], concluida: ["badge-cinza", "Concluído"],
};

export default async function AdminQuadras({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const me = await requireRole("admin", "sindico", "conselheiro");
  const sp = await searchParams;
  const aba = sp.aba ?? "agenda";
  const court: CourtKey = isCourt(sp.q ?? "") ? (sp.q as CourtKey) : "poli";
  const day = sp.dia ?? todayIso();
  const from = sp.de ?? addDays(todayIso(), -30), to = sp.ate ?? addDays(todayIso(), 30);

  const data = await asUser(me.id, async (tx) => {
    const sel = tx`select b.id, b.code, b.status, lower(b.period) as ini, upper(b.period) as fim, b.local_day, s.name as court, s.code as court_code, u.code as unit,
                          b.responsible_name, d.modality, d.participants, d.visitors, d.activity, d.activity_note, d.approval, d.decision_note, b.cancel_reason,
                          d.terms_accepted_at
                   from bookings b join court_details d on d.booking_id = b.id join spaces s on s.id = b.space_id join units u on u.id = b.unit_id where b.kind = 'quadra'`;
    const dayRows = await tx`${sel} and b.local_day = ${day}::date order by s.sort_order, lower(b.period)`;
    const pending = await tx`${sel} and b.status = 'solicitada' and upper(b.period) > now() order by (d.approval = 'pendente') desc, lower(b.period)`;
    const scheds = await tx`select c.id, c.kind, c.title, c.audience, to_char(c.start_date, 'DD/MM/YYYY') as ini, to_char(c.end_date, 'DD/MM/YYYY') as fim, c.weekdays,
                                   to_char(c.start_time, 'HH24:MI') as st, to_char(c.end_time, 'HH24:MI') as et, c.cancelled_at, c.cancel_reason, s.name as court
                            from court_schedules c join spaces s on s.id = c.space_id where s.code = ${COURTS[court].code} order by c.cancelled_at nulls first, c.created_at desc`;
    const settings = await courtSettings(tx, court);
    const params = await tx`select key, status, source from parameters where key like ${`quadra.${court}.%`}`;
    const hist = await tx`select action, actor_label, entity_id, data, at as created_at from audit_log where action like 'quadra.%' order by id desc limit 40`;
    return { dayRows, pending, scheds, settings, params, hist };
  });
  const rep = aba === "relatorio" ? await courtReport(me.id, court, from, to) : null;
  const tabs = [["agenda", "Agenda do dia"], ["solicitacoes", `Solicitações${data.pending.length ? ` (${data.pending.length})` : ""}`], ["programacao", "Programação e bloqueios"],
    ["relatorio", "Relatório"], ["config", "Configuração"], ["historico", "Histórico"]];
  const courtPicker = (
    <div className="mb-6 flex gap-2">
      {(Object.keys(COURTS) as CourtKey[]).map((k) => (
        <Link key={k} href={`?aba=${aba}&q=${k}`} className={`rounded-full px-4 py-2 text-sm font-medium ring-1 ${court === k ? "bg-noite text-white ring-noite" : "bg-white text-noite-70 ring-linha"}`}>{COURTS[k].name}</Link>
      ))}
    </div>
  );

  return (
    <>
      <AdminTabs active="/admin/quadras" />
      <div className="mb-8"><p className="eyebrow">Administração</p><h1 className="h1">Quadras</h1>
        <p className="mt-2 text-sm text-noite-70">Regimento: 08h00 às 22h00 (25.7) · mais de 4 visitantes em jogos exige autorização (25.3) · programação pela administração (25.4).</p></div>
      <div className="no-print -mx-4 mb-8 overflow-x-auto px-4">
        <div className="flex w-max gap-1 rounded-full bg-white p-1 ring-1 ring-linha">
          {tabs.map(([k, l]) => <Link key={k} href={`?aba=${k}&q=${court}`} className={`rounded-full px-4 py-2 text-sm font-medium ${aba === k ? "bg-violeta text-white" : "text-noite-70 hover:bg-violeta-50"}`}>{l}</Link>)}
        </div>
      </div>

      {aba === "agenda" && (
        <div className="space-y-4">
          <form className="flex items-end gap-3"><input type="hidden" name="aba" value="agenda" />
            <div><label className="field-label">Dia</label><input className="input" type="date" name="dia" defaultValue={day} /></div>
            <button className="btn-secondary">Ver</button></form>
          {!data.dayRows.length && <div className="card"><Empty title="Nenhum agendamento neste dia" /></div>}
          {data.dayRows.map((b: Row) => <BookingCard key={b.id} b={b} />)}
        </div>
      )}

      {aba === "solicitacoes" && (
        <div className="space-y-4">
          {!data.pending.length && <div className="card"><Empty pose="festa" title="Nenhuma solicitação pendente" /></div>}
          {data.pending.map((b: Row) => (
            <div key={b.id} className={`card p-6 ${b.approval === "pendente" ? "ring-2 ring-amarelo" : ""}`}>
              <BookingHead b={b} />
              <p className="mt-2 text-sm font-medium">{b.approval === "pendente" ? `Autorização (item 25.3): jogo com ${b.visitors} visitantes` : "Aguardando confirmação da administração"}</p>
              <ActionForm action={decidirQuadraAction} className="mt-4 space-y-3">
                <input type="hidden" name="booking_id" value={b.id} />
                <textarea name="note" rows={2} className="input" placeholder="Justificativa (obrigatória para rejeitar)" />
                <div className="flex flex-wrap gap-3">
                  <button name="decision" value="confirmar" className="btn-success btn-sm">{b.approval === "pendente" ? "Autorizar" : "Confirmar"}</button>
                  <button name="decision" value="rejeitar" className="btn-danger btn-sm">Rejeitar</button>
                </div>
              </ActionForm>
            </div>
          ))}
        </div>
      )}

      {aba === "programacao" && (
        <div className="space-y-6">
          {courtPicker}
          <section className="card p-6 sm:p-7">
            <h2 className="h2">Nova programação ou bloqueio</h2>
            <p className="mt-1 text-sm text-noite-70">Programação: horários reservados a um público ou modalidade (item 25.4). Bloqueio: manutenção ou evento. Moradores não conseguem agendar nesses horários.</p>
            <ActionForm action={programacaoQuadraAction} className="mt-5 space-y-4" resetOnSuccess>
              <input type="hidden" name="court" value={court} />
              <div className="grid gap-4 sm:grid-cols-3">
                <div><label className="field-label">Tipo</label><select name="kind" className="input"><option value="programacao">Programação</option><option value="bloqueio">Bloqueio</option></select></div>
                <div className="sm:col-span-2"><label className="field-label">Título ou motivo</label><input name="title" className="input" required placeholder="Ex.: Beach tennis infantil · Manutenção da rede" /></div>
                <div><label className="field-label">Público ou modalidade</label><input name="audience" className="input" placeholder="Ex.: Crianças, Adultos" /></div>
                <div><label className="field-label">Início</label><input name="start_time" type="time" min="08:00" max="22:00" step={1800} className="input" required defaultValue="08:00" /></div>
                <div><label className="field-label">Término</label><input name="end_time" type="time" min="08:00" max="22:00" step={1800} className="input" required defaultValue="10:00" /></div>
                <div><label className="field-label">Data</label><input name="start_date" type="date" className="input" required defaultValue={todayIso()} /></div>
                <div><label className="field-label">Repetir até (opcional)</label><input name="end_date" type="date" className="input" /></div>
              </div>
              <div>
                <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" name="recorrente" className="h-5 w-5 accent-violeta" /> Repetir nos dias da semana:</label>
                <div className="mt-2 flex flex-wrap gap-2">
                  {[1, 2, 3, 4, 5, 6, 7].map((d) => <label key={d} className="flex items-center gap-1.5 rounded-full bg-fundo px-3 py-1.5 text-sm"><input type="checkbox" name="weekdays" value={d} className="accent-violeta" /> {WD[d]}</label>)}
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm text-noite-70"><input type="checkbox" name="cancel_affected" className="h-5 w-5 accent-coral" /> Se houver agendamentos de moradores no período, cancelar e avisar os moradores</label>
              <SubmitButton pendingText="Salvando…">Salvar</SubmitButton>
            </ActionForm>
          </section>
          <section className="space-y-3">
            {!data.scheds.length && <div className="card"><Empty title="Nenhuma programação ou bloqueio" /></div>}
            {data.scheds.map((s: Row) => (
              <div key={s.id} className={`card p-5 ${s.cancelled_at ? "opacity-60" : ""}`}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className={s.kind === "bloqueio" ? "badge-cinza" : "badge-violeta"}>{s.kind === "bloqueio" ? "Bloqueio" : "Programação"}</span>
                  <p className="font-semibold">{s.title}</p>{s.audience && <span className="text-sm text-noite-50">· {s.audience}</span>}
                  {s.cancelled_at && <span className="badge-coral">Encerrado</span>}
                </div>
                <p className="mt-1 text-sm text-noite-70">{s.st}–{s.et} · {s.weekdays ? `toda ${(s.weekdays as number[]).map((d) => WD[d]).join(", ")} · de ${s.ini}${s.fim ? ` até ${s.fim}` : " sem data final"}` : s.ini}</p>
                {s.cancel_reason && <p className="text-xs text-noite-50">{s.cancel_reason}</p>}
                {!s.cancelled_at && <div className="mt-3"><CancelWithReason id={s.id} action={encerrarProgramacaoAction} label="Encerrar" hint="Os horários voltam a ficar livres para agendamento." /></div>}
              </div>
            ))}
          </section>
        </div>
      )}

      {aba === "relatorio" && rep && (
        <div className="space-y-6">
          {courtPicker}
          <form className="flex flex-wrap items-end gap-3"><input type="hidden" name="aba" value="relatorio" /><input type="hidden" name="q" value={court} />
            <div><label className="field-label">De</label><input className="input" type="date" name="de" defaultValue={from} /></div>
            <div><label className="field-label">Até</label><input className="input" type="date" name="ate" defaultValue={to} /></div>
            <button className="btn-secondary">Atualizar</button>
            <a className="btn-ghost" href={`/api/admin/quadras?q=${court}&de=${from}&ate=${to}`}>Exportar CSV</a></form>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
            <Stat label="Agendamentos" value={rep.tot.total} /><Stat label="Confirmados" value={rep.tot.confirmados} />
            <Stat label="Pendentes de aprovação" value={rep.tot.pendentes_aprovacao} /><Stat label="Cancelados" value={rep.tot.cancelados} /><Stat label="Rejeitados" value={rep.tot.rejeitados} />
          </div>
          <div className="grid gap-6 lg:grid-cols-3">
            <Bars title="Horários mais procurados" rows={rep.porHora.map((r: Row) => [`${String(r.hora).padStart(2, "0")}h`, r.n])} />
            <Bars title="Modalidades" rows={rep.porModalidade.map((r: Row) => [r.modalidade, r.n])} />
            <Bars title="Por apartamento" rows={rep.porUnidade.map((r: Row) => [`Apto ${r.unidade}`, r.n])} />
          </div>
          <section className="card overflow-x-auto p-5">
            <h2 className="h2 mb-3">Histórico de programações e bloqueios</h2>
            <table className="w-full min-w-[640px] text-sm"><thead className="text-left text-noite-50"><tr><th className="py-2">Tipo</th><th>Título</th><th>Período</th><th>Horário</th><th>Criado em</th><th>Situação</th></tr></thead>
              <tbody>{rep.bloqueios.map((b: Row, i: number) => <tr key={i} className="border-t border-linha"><td className="py-2">{b.tipo === "bloqueio" ? "Bloqueio" : "Programação"}</td><td>{b.titulo}</td><td>{b.inicio}{b.fim && b.fim !== b.inicio ? ` a ${b.fim}` : ""}</td><td>{b.horario}</td><td>{b.criado_em}</td><td>{b.encerrado ? "Encerrado" : "Ativo"}</td></tr>)}</tbody></table>
          </section>
        </div>
      )}

      {aba === "config" && (
        <div className="space-y-6">
          {courtPicker}
          <section className="card p-6 sm:p-7">
            <h2 className="h2">{COURTS[court].name}</h2>
            <p className="mt-1 text-sm text-noite-70">Parâmetros operacionais (não previstos no Regimento). Em branco = pendente de definição e não aplicado.</p>
            <ActionForm action={configQuadraAction} className="mt-5 space-y-4">
              <input type="hidden" name="court" value={court} />
              <div className="grid gap-4 sm:grid-cols-2">
                <div><label className="field-label">Confirmação</label>
                  <select name="confirmacao" className="input" defaultValue={data.settings.confirmacao ?? ""}>
                    <option value="">Pendente (a administração confirma cada agendamento)</option><option value="automatica">Automática</option><option value="administracao">Pela administração</option></select></div>
                <Num name="duracao" label="Duração fixa de cada horário (min)" v={data.settings.duracao} />
                <Num name="antecedencia_min" label="Antecedência mínima (horas)" v={data.settings.antecedenciaMinH} />
                <Num name="antecedencia_max" label="Antecedência máxima (dias)" v={data.settings.antecedenciaMaxD} />
                <div className="grid grid-cols-2 gap-2">
                  <Num name="max_qtd" label="Máximo por unidade" v={data.settings.maxUnidade?.quantidade ?? null} />
                  <div><label className="field-label">Por</label><select name="max_periodo" className="input" defaultValue={data.settings.maxUnidade?.periodo ?? "semana"}><option value="dia">dia</option><option value="semana">semana</option><option value="mes">mês</option></select></div>
                </div>
                <Num name="intervalo" label="Intervalo entre agendamentos da unidade (min)" v={data.settings.intervaloMin} />
                <Num name="consecutivos" label="Tempo máximo contínuo (min)" v={data.settings.consecutivosMin} />
                <Num name="cancelamento" label="Prazo para o morador cancelar (horas antes)" v={data.settings.cancelamentoH} />
              </div>
              <div><label className="field-label">Regras de prioridade (informativo)</label><textarea name="prioridade" rows={2} className="input" defaultValue={data.settings.prioridade ?? ""} placeholder="Ex.: sábados de manhã para crianças" /></div>
              <div><label className="field-label">Modalidades (uma por linha)</label><textarea name="modalidades" rows={4} className="input" defaultValue={data.settings.modalidades.join("\n")} required /></div>
              <div><label className="field-label">Fonte da definição</label><input name="source" className="input" required placeholder="Ex.: decisão do síndico de 10/11/2026" /></div>
              <SubmitButton pendingText="Salvando…">Salvar configuração</SubmitButton>
            </ActionForm>
            <ul className="mt-6 grid gap-1 text-xs text-noite-50 sm:grid-cols-2">
              {data.params.map((p: Row) => <li key={p.key}>{p.key.split(".").pop()}: {p.status === "definido" ? `definido · ${p.source}` : "pendente"}</li>)}
            </ul>
          </section>
        </div>
      )}

      {aba === "historico" && (
        <section className="card divide-y divide-linha p-2">
          {data.hist.map((h: Row, i: number) => (
            <div key={i} className="px-4 py-3 text-sm">
              <p><b>{h.actor_label}</b> · {h.action.replace("quadra.", "").replace("_", " ")} · <span className="text-noite-50">{dLong(h.created_at)} {hm(h.created_at)}</span></p>
              <p className="text-xs text-noite-50">{h.entity_id} · {Object.entries(h.data ?? {}).filter(([, v]) => v !== null && v !== "").map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : String(v)}`).join(" · ")}</p>
            </div>
          ))}
        </section>
      )}
    </>
  );
}

function BookingHead({ b }: { b: Row }) {
  const [cls, lbl] = b.status === "solicitada" && b.approval === "pendente" ? ["badge-amarelo", "Pendente de aprovação"] : STATUS[b.status] ?? ["badge-cinza", b.status];
  return (
    <>
      <div className="flex flex-wrap items-center gap-2"><p className="font-semibold">{b.court} · {dLong(b.ini)} · {hm(b.ini)}–{hm(b.fim)}</p><span className={cls}>{lbl}</span></div>
      <p className="mt-1 text-sm text-noite-70">Apto {b.unit} · {b.responsible_name} · {b.modality} · {b.participants} participantes · {b.visitors} visitantes · {b.activity === "jogo" ? "jogo amistoso/organizado" : "uso recreativo"}</p>
      {b.activity_note && <p className="text-sm text-noite-50">“{b.activity_note}”</p>}
      {b.terms_accepted_at && <p className="text-xs text-noite-50">Ciência de acompanhar os visitantes registrada.</p>}
      {(b.decision_note || b.cancel_reason) && <p className="text-xs text-noite-50">{b.decision_note ?? b.cancel_reason}</p>}
    </>
  );
}

function BookingCard({ b }: { b: Row }) {
  const active = ["solicitada", "confirmada"].includes(b.status) && +new Date(b.ini) > Date.now();
  return (
    <div className="card p-6">
      <BookingHead b={b} />
      {active && (
        <div className="mt-4 flex flex-wrap items-start gap-x-6 gap-y-3">
          <details>
            <summary className="cursor-pointer text-sm font-medium text-violeta-700">Alterar horário</summary>
            <ActionForm action={alterarQuadraAction} className="mt-3 grid gap-3 sm:grid-cols-4">
              <input type="hidden" name="booking_id" value={b.id} />
              <input type="date" name="day" className="input" defaultValue={new Date(b.local_day).toISOString().slice(0, 10)} required />
              <input type="time" name="start" step={1800} className="input" defaultValue={hm(b.ini)} required />
              <input type="time" name="end" step={1800} className="input" defaultValue={hm(b.fim)} required />
              <input name="note" className="input" placeholder="Motivo" required />
              <SubmitButton className="btn-secondary btn-sm sm:col-span-4 sm:w-fit" pendingText="Salvando…">Salvar e avisar o morador</SubmitButton>
            </ActionForm>
          </details>
          <CancelWithReason id={b.id} action={cancelarQuadraAction} label="Cancelar" hint="O morador será avisado." />
        </div>
      )}
    </div>
  );
}

function Num({ name, label, v }: { name: string; label: string; v: number | null }) {
  return <div><label className="field-label">{label}</label><input name={name} type="number" min={1} className="input" defaultValue={v ?? ""} placeholder="Pendente" /></div>;
}

function Bars({ title, rows }: { title: string; rows: [string, number][] }) {
  const max = Math.max(1, ...rows.map((r) => r[1]));
  return (
    <section className="card p-5">
      <h3 className="mb-3 text-sm font-semibold">{title}</h3>
      {!rows.length && <p className="text-sm text-noite-50">Sem dados no período.</p>}
      <ul className="space-y-2">
        {rows.slice(0, 12).map(([k, n]) => (
          <li key={k} className="text-sm"><div className="flex justify-between"><span>{k}</span><span className="font-semibold">{n}</span></div>
            <div className="mt-1 h-2 rounded-full bg-fundo"><div className="grow-x h-full rounded-full bg-violeta" style={{ width: `${(n / max) * 100}%` }} /></div></li>
        ))}
      </ul>
    </section>
  );
}
