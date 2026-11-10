import Link from "next/link";
import {
  ausenciaBmgAction, configBmgAction, excluirTaxaAction, taxaAction, decidirBmgAction, entradaBmgAction, excecaoBmgAction, ocorrenciaBmgAction, saidaBmgAction,
} from "@/app/actions/bmg";
import { AdminTabs } from "@/components/AppShell";
import { ActionForm, SubmitButton } from "@/components/forms";
import { BookingBadge, Empty, Stat } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { addDays, formatCpf, todayIso } from "@/lib/bmg/rules";
import { bmgAdminData } from "@/lib/bmg/queries";
import { bmgCharts, bmgStats, STATUS_LABEL } from "@/lib/bmg/report";
import { bmgSettings } from "@/lib/bmg/service";
import { asUser } from "@/lib/db";
import { fmtDateTime } from "@/lib/format";

export const metadata = { title: "Be My Guest · Administração" };

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const dm = (d: Date) => new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", day: "2-digit", month: "2-digit" }).format(d);
const iso = (d: Date) => new Date(d).toISOString().slice(0, 10);

export default async function AdminBmg({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const me = await requireRole("admin", "portaria", "sindico", "conselheiro");
  const admin = me.roles.includes("admin") || me.roles.includes("sindico") || me.roles.includes("conselheiro");
  const sp = await searchParams;
  const aba = admin ? sp.aba ?? "agenda" : "hoje";
  const from = sp.de ?? addDays(todayIso(), -30);
  const to = sp.ate ?? addDays(todayIso(), 30);
  const data = await bmgAdminData(me.id, { from, to, room: sp.quarto, status: sp.situacao });
  const { settings, fees } = await asUser(me.id, async (tx) => ({
    settings: await bmgSettings(tx),
    fees: await tx`select id, component, amount, basis, valid_from, source from fee_schedules where module = 'bmg' order by component, valid_from desc`,
  }));
  const tabs = admin
    ? [["agenda", "Agenda"], ["solicitacoes", `Solicitações${data.pending.length ? ` (${data.pending.length})` : ""}`], ["hoje", "Entradas e saídas"],
       ["relatorio", "Relatório"], ["config", "Configuração"]]
    : [["hoje", "Entradas e saídas"]];

  return (
    <>
      {admin && <AdminTabs active="/admin/be-my-guest" />}
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">{admin ? "Administração" : "Portaria"}</p>
          <h1 className="h1">Be My Guest</h1>
        </div>
        {admin && (
          <span className={settings.open ? "badge-verde" : "badge-amarelo"}>
            {settings.open ? `Reservas abertas · antecedência ${settings.advanceHours}h` : "Reservas fechadas para moradores"}
          </span>
        )}
      </div>

      <div className="no-print -mx-4 mb-8 overflow-x-auto px-4">
        <div className="flex w-max gap-1 rounded-full bg-white p-1 ring-1 ring-linha">
          {tabs.map(([k, l]) => (
            <Link key={k} href={`?aba=${k}`} className={`rounded-full px-4 py-2 text-sm font-medium ${aba === k ? "bg-violeta text-white" : "text-noite-70 hover:bg-violeta-50"}`}>{l}</Link>
          ))}
        </div>
      </div>

      {aba === "agenda" && <Agenda rows={data.timeline} rooms={data.rooms} />}
      {aba === "solicitacoes" && <Solicitacoes rows={data.pending} />}
      {aba === "hoje" && <Hoje ops={data.ops} occurrences={data.occurrences} admin={admin} />}
      {aba === "relatorio" && <Relatorio rows={data.report} rooms={data.rooms} f={{ from, to, room: sp.quarto ?? "", status: sp.situacao ?? "" }} />}
      {aba === "config" && (
        <div className="grid gap-6 lg:grid-cols-2">
          <section className="card p-7">
            <h2 className="h2">Abertura e antecedência</h2>
            <ActionForm action={configBmgAction} className="mt-5 space-y-4">
              <div>
                <label className="field-label">Antecedência mínima (horas antes da entrada às 18h)</label>
                <input className="input w-40" name="advance_hours" type="number" min={0} max={1440} defaultValue={settings.advanceHours ?? ""} />
              </div>
              <label className="flex items-center gap-3">
                <input type="checkbox" name="open" defaultChecked={settings.open} className="h-5 w-5 accent-violeta" />
                <span>Reservas abertas para os moradores</span>
              </label>
              <input className="input" name="source" placeholder="Fonte da definição" required />
              <SubmitButton>Salvar</SubmitButton>
            </ActionForm>
          </section>
          <section className="card p-7">
            <h2 className="h2">Taxas (Regimento 27.17)</h2>
            <p className="mt-1 text-sm text-noite-50">Cada reserva guarda os valores vigentes no momento da contratação. Para mudar um valor, cadastre um novo com nova vigência.</p>
            <div className="mt-4 divide-y divide-linha">
              {["taxa_uso", "taxa_limpeza", "fundo_manutencao"].map((c) => {
                const cur = fees.filter((x) => x.component === c);
                const label = { taxa_uso: "Taxa de uso", taxa_limpeza: "Taxa de limpeza", fundo_manutencao: "Fundo de manutenção" }[c];
                if (!cur.length) return (
                  <div key={c} className="flex items-center justify-between py-3"><span className="font-medium">{label}</span><span className="badge-amarelo">Pendente de assembleia</span></div>
                );
                return cur.map((x, i) => {
                  const iso = new Date(x.valid_from).toISOString().slice(0, 10);
                  return (
                    <details key={x.id} className="py-3">
                      <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
                        <span className={i ? "text-noite-50" : "font-medium"}>{i ? "↳ anterior" : label}</span>
                        <span className="text-sm">{Number(x.amount).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} {x.basis === "por_diaria" ? "por diária" : "por reserva"}
                          <span className="text-noite-50"> · desde {iso.split("-").reverse().join("/")}</span> <span className="ml-1 text-violeta-700">Editar</span></span>
                      </summary>
                      <ActionForm action={taxaAction} className="mt-3 grid gap-2 rounded-2xl bg-fundo p-4 sm:grid-cols-2">
                        <input type="hidden" name="module" value="bmg" /><input type="hidden" name="id" value={x.id} /><input type="hidden" name="component" value={x.component} />
                        <input className="input" name="amount" inputMode="decimal" defaultValue={String(x.amount).replace(".", ",")} required />
                        <select className="input" name="basis" defaultValue={x.basis}><option value="por_diaria">por diária</option><option value="por_reserva">por reserva</option></select>
                        <input className="input" name="valid_from" type="date" defaultValue={iso} required />
                        <input className="input" name="source" defaultValue={x.source} required />
                        <div><SubmitButton className="btn-secondary btn-sm">Salvar alteração</SubmitButton></div>
                      </ActionForm>
                      <ActionForm action={excluirTaxaAction} className="mt-2 flex gap-2">
                        <input type="hidden" name="id" value={x.id} />
                        <input className="input min-h-10 flex-1" name="reason" placeholder="Motivo para excluir este valor" required />
                        <SubmitButton className="btn-ghost btn-sm text-[#c23a2b]" confirm="Excluir este valor da tabela?">Excluir</SubmitButton>
                      </ActionForm>
                    </details>
                  );
                });
              })}
            </div>
            <p className="mt-4 text-sm font-medium">Cadastrar novo valor</p>
            <ActionForm action={taxaAction} className="mt-2 grid gap-3 sm:grid-cols-2" resetOnSuccess>
              <input type="hidden" name="module" value="bmg" />
              <select className="input" name="component" required><option value="taxa_uso">Taxa de uso</option><option value="taxa_limpeza">Taxa de limpeza</option><option value="fundo_manutencao">Fundo de manutenção</option></select>
              <input className="input" name="amount" inputMode="decimal" placeholder="Valor (R$)" required />
              <select className="input" name="basis" required><option value="por_diaria">por diária</option><option value="por_reserva">por reserva</option></select>
              <input className="input" name="valid_from" type="date" required />
              <input className="input sm:col-span-2" name="source" placeholder="Deliberação que aprovou (ex.: AGE de 15/11/2026, item 4)" required />
              <div><SubmitButton className="btn-secondary btn-sm">Cadastrar valor</SubmitButton></div>
            </ActionForm>
          </section>
        </div>
      )}
    </>
  );
}

function Guests({ g }: { g: { name: string; cpf: string; minor: boolean }[] }) {
  return (
    <ul className="mt-1 space-y-0.5 text-sm">
      {g.map((x) => <li key={x.cpf}>{x.name} · <span className="text-noite-50">CPF {formatCpf(x.cpf)}</span>{x.minor && <span className="ml-1 badge-amarelo">menor</span>}</li>)}
    </ul>
  );
}

function Header({ r }: { r: Row }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <p className="font-semibold">{r.room} · Apto {r.unit}</p>
      <BookingBadge status={r.status} />
      <span className="ml-auto text-xs text-noite-50">#{r.code}</span>
    </div>
  );
}

function Agenda({ rows, rooms }: { rows: Row[]; rooms: Row[] }) {
  const start = addDays(todayIso(), -2);
  const days = Array.from({ length: 31 }, (_, i) => addDays(start, i));
  const W = 100 / days.length;
  const pos = (dateIso: string, hour: number) => ((Date.parse(dateIso) - Date.parse(start)) / 86400_000 + hour / 24) * W;
  const colors: Record<string, string> = { solicitada: "bg-amarelo text-noite", confirmada: "bg-violeta text-white", em_uso: "bg-turquesa text-white", concluida: "bg-[#c9c3e6] text-noite", ausencia: "bg-coral text-white" };
  const todayPos = pos(todayIso(), Number(new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "numeric", hour12: false }).format(new Date())));
  const occ = (code: string) => {
    const nights = rows.filter((r) => r.room_code === code && ["confirmada", "em_uso", "concluida"].includes(r.status))
      .reduce((n, r) => n + Math.max(0, Math.min(Date.parse(iso(r.end_date)), Date.parse(addDays(todayIso(), 30))) - Math.max(Date.parse(iso(r.start_date)), Date.parse(todayIso()))) / 86400_000, 0);
    return Math.round((nights / 30) * 100);
  };
  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {rooms.map((r) => <Stat key={r.code} label={`${r.name} · próximos 30 dias`} value={`${occ(r.code)}%`} hint="ocupação confirmada" />)}
        <Stat label="Aguardando confirmação" value={rows.filter((r) => r.status === "solicitada").length} />
        <Stat label="Em uso agora" value={rows.filter((r) => r.status === "em_uso").length} />
      </div>
      <section className="card overflow-hidden p-5 sm:p-7">
        <div className="overflow-x-auto">
          <div className="min-w-[860px]">
            <div className="relative ml-36 flex h-8 text-[11px] text-noite-50">
              {days.map((d) => (
                <div key={d} style={{ width: `${W}%` }} className={`text-center ${new Date(`${d}T12:00:00Z`).getUTCDay() === 0 ? "font-semibold text-noite-70" : ""}`}>
                  {Number(d.slice(8))}
                  {d.slice(8) === "01" && <div className="absolute -top-3 text-[10px] text-violeta">{new Intl.DateTimeFormat("pt-BR", { month: "short", timeZone: "UTC" }).format(new Date(`${d}T12:00:00Z`))}</div>}
                </div>
              ))}
            </div>
            {rooms.map((room) => (
              <div key={room.code} className="flex items-center border-t border-linha py-4">
                <div className="w-36 shrink-0 pr-3 text-sm font-semibold">{room.name}</div>
                <div className="relative h-14 flex-1 rounded-xl bg-fundo">
                  {rows.filter((r) => r.room_code === room.code).map((r, i) => {
                    const left = Math.max(0, pos(iso(r.start_date), 18));
                    const right = Math.min(100, pos(iso(r.end_date), 12));
                    if (right <= 0 || left >= 100) return null;
                    return (
                      <div key={r.id} title={`Apto ${r.unit} · ${dm(r.start_date)} a ${dm(r.end_date)}`}
                        className={`grow-x absolute top-2 flex h-10 items-center overflow-hidden rounded-lg px-2 text-xs font-semibold shadow-sm ${colors[r.status] ?? "bg-noite-50 text-white"}`}
                        style={{ left: `${left}%`, width: `${right - left}%`, animationDelay: `${i * 70}ms` }}>
                        <span className="truncate">Apto {r.unit}</span>
                      </div>
                    );
                  })}
                  <div className="absolute inset-y-0 w-0.5 bg-coral" style={{ left: `${todayPos}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-4 text-xs text-noite-50">
          {[["bg-amarelo", "Solicitada"], ["bg-violeta", "Confirmada"], ["bg-turquesa", "Em uso"], ["bg-[#c9c3e6]", "Concluída"], ["bg-coral", "Ausência"]].map(([c, l]) => (
            <span key={l} className="flex items-center gap-1.5"><span className={`h-3 w-3 rounded ${c}`} />{l}</span>
          ))}
          <span className="flex items-center gap-1.5"><span className="h-3 w-0.5 bg-coral" />Agora</span>
        </div>
      </section>
      <section className="space-y-3">
        <h2 className="h2">Próximas reservas</h2>
        {rows.filter((r) => ["solicitada", "confirmada", "em_uso"].includes(r.status)).map((r) => (
          <div key={r.id} className="card p-5">
            <Header r={r} />
            <p className="mt-1 text-sm text-noite-70">{fmtDateTime(r.checkin_at)} → {fmtDateTime(r.checkout_at)} · {r.nights} diária(s){r.exceptions ? " · com exceção de horário" : ""}</p>
            <Guests g={r.guests} />
            <details className="mt-3">
              <summary className="cursor-pointer text-sm font-medium text-violeta-700">Exceção de horário</summary>
              <ActionForm action={excecaoBmgAction} className="mt-3 grid gap-3 sm:grid-cols-2">
                <input type="hidden" name="booking_id" value={r.id} />
                <div><label className="field-label">Nova entrada</label><input className="input" type="datetime-local" name="checkin" defaultValue={`${iso(r.start_date)}T18:00`} required /></div>
                <div><label className="field-label">Nova saída</label><input className="input" type="datetime-local" name="checkout" defaultValue={`${iso(r.end_date)}T12:00`} required /></div>
                <input className="input sm:col-span-2" name="reason" placeholder="Motivo e responsável pela autorização" required />
                <input className="input sm:col-span-2" name="charge_note" placeholder="Cobrança adicional, se houver (opcional)" />
                <p className="text-xs text-noite-50 sm:col-span-2">O intervalo de 6h de limpeza é mantido automaticamente; conflitos com outras reservas são recusados.</p>
                <div><SubmitButton className="btn-secondary btn-sm">Autorizar exceção</SubmitButton></div>
              </ActionForm>
            </details>
          </div>
        ))}
      </section>
    </div>
  );
}

function Solicitacoes({ rows }: { rows: Row[] }) {
  if (!rows.length) return <div className="card"><Empty pose="festa" title="Nenhuma solicitação pendente" /></div>;
  return (
    <div className="space-y-4">
      {rows.map((r) => (
        <div key={r.id} className="card p-6">
          <Header r={r} />
          <p className="mt-1 text-sm text-noite-70">{dm(r.start_date)} às 18h → {dm(r.end_date)} até 12h · {r.nights} diária(s) · pedido por {r.responsible_name} em {fmtDateTime(r.created_at)}</p>
          <Guests g={r.guests} />
          <div className="mt-4 flex flex-wrap items-start gap-3">
            <ActionForm action={decidirBmgAction}>
              <input type="hidden" name="booking_id" value={r.id} /><input type="hidden" name="decision" value="confirmar" />
              <SubmitButton className="btn-success btn-sm">Confirmar</SubmitButton>
            </ActionForm>
            <details>
              <summary className="btn-ghost btn-sm cursor-pointer list-none text-[#c23a2b]">Recusar…</summary>
              <ActionForm action={decidirBmgAction} className="mt-2 flex gap-2">
                <input type="hidden" name="booking_id" value={r.id} /><input type="hidden" name="decision" value="recusar" />
                <input className="input min-h-10" name="note" placeholder="Motivo (visível ao morador)" required />
                <SubmitButton className="btn-danger btn-sm">Recusar</SubmitButton>
              </ActionForm>
            </details>
          </div>
        </div>
      ))}
    </div>
  );
}

function Hoje({ ops, occurrences, admin }: { ops: Row[]; occurrences: Row[]; admin: boolean }) {
  return (
    <div className="space-y-8">
      {!ops.length && <div className="card"><Empty title="Nenhuma entrada ou saída pendente" /></div>}
      {ops.map((r) => (
        <div key={r.id} className="card p-6">
          <Header r={r} />
          <p className="mt-1 text-sm text-noite-70">{fmtDateTime(r.checkin_at)} → {fmtDateTime(r.checkout_at)}</p>
          <Guests g={r.guests} />
          {r.status === "confirmada" ? (
            <ActionForm action={entradaBmgAction} className="mt-4 grid gap-3 sm:grid-cols-3">
              <input type="hidden" name="booking_id" value={r.id} />
              <select className="input" name="inspection_ok" defaultValue="sim"><option value="sim">Vistoria sem apontamentos</option><option value="nao">Vistoria com apontamentos</option></select>
              <input className="input" name="tag_code" placeholder="Tag entregue (nº) — opcional" />
              <input className="input" name="inspection_note" placeholder="Observações da vistoria" />
              <div><SubmitButton className="btn-success btn-sm">Registrar entrada</SubmitButton></div>
            </ActionForm>
          ) : (
            <ActionForm action={saidaBmgAction} className="mt-4 grid gap-3 sm:grid-cols-3">
              <input type="hidden" name="booking_id" value={r.id} />
              <p className="text-sm text-noite-50 sm:col-span-3">Entrada em {fmtDateTime(r.checked_in_at)}{r.tag_code ? ` · tag ${r.tag_code}` : ""}</p>
              <select className="input" name="tag_returned" defaultValue={r.tag_code ? "devolvida_ok" : "sem_tag"}>
                <option value="sem_tag">Sem tag (senha numérica)</option><option value="devolvida_ok">Tag devolvida em perfeitas condições</option>
                <option value="nao_devolvida">Tag não devolvida</option><option value="danificada">Tag danificada</option>
              </select>
              <input className="input sm:col-span-2" name="note" placeholder="Observações da saída" />
              <div><SubmitButton className="btn-primary btn-sm">Registrar saída</SubmitButton></div>
            </ActionForm>
          )}
          {admin && r.status === "confirmada" && (
            <ActionForm action={ausenciaBmgAction} className="mt-3">
              <input type="hidden" name="booking_id" value={r.id} />
              <SubmitButton className="btn-ghost btn-sm px-0 text-noite-50" confirm="Registrar que os hóspedes não compareceram?">Registrar ausência</SubmitButton>
            </ActionForm>
          )}
        </div>
      ))}
      {admin && occurrences.length > 0 && (
        <section className="space-y-3">
          <h2 className="h2">Ocorrências aguardando validação</h2>
          {occurrences.map((r) => (
            <div key={r.id} className="card p-6 ring-2 ring-amarelo">
              <Header r={r} />
              <p className="mt-1 text-sm">Tag {r.tag_returned === "nao_devolvida" ? "não devolvida" : "danificada"} · {r.checkout_note} · saída em {fmtDateTime(r.checked_out_at)}</p>
              <p className="text-sm text-noite-50">Regimento 27.30: cobrança de R$ 100,00 somente após validação.</p>
              <ActionForm action={ocorrenciaBmgAction} className="mt-3 flex flex-wrap gap-2">
                <input type="hidden" name="booking_id" value={r.id} />
                <input className="input min-h-10 flex-1" name="note" placeholder="Justificativa da decisão" required />
                <button name="decision" value="validada" className="btn-danger btn-sm">Validar cobrança</button>
                <button name="decision" value="descartada" className="btn-secondary btn-sm">Descartar</button>
              </ActionForm>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}

function Relatorio({ rows, rooms, f }: { rows: Row[]; rooms: Row[]; f: { from: string; to: string; room: string; status: string } }) {
  const rs = rooms.filter((r) => !f.room || r.code === f.room).map((r) => ({ code: r.code as string, name: r.name as string }));
  const stats = bmgStats(rows, rs, f.from, f.to);
  const charts = bmgCharts(stats, rs);
  const k = stats.kpis;
  const qs = new URLSearchParams({ de: f.from, ate: f.to, quarto: f.room, situacao: f.status }).toString();
  const svg = (s: string) => <div className="card overflow-hidden p-2 [&_svg]:h-auto [&_svg]:w-full" dangerouslySetInnerHTML={{ __html: s }} />;
  return (
    <div className="space-y-6">
      <form className="no-print card grid gap-3 p-5 sm:grid-cols-5 sm:items-end">
        <input type="hidden" name="aba" value="relatorio" />
        <div><label className="field-label">De</label><input className="input" type="date" name="de" defaultValue={f.from} /></div>
        <div><label className="field-label">Até</label><input className="input" type="date" name="ate" defaultValue={f.to} /></div>
        <div><label className="field-label">Suíte</label>
          <select className="input" name="quarto" defaultValue={f.room}><option value="">Todas</option>{rooms.map((r) => <option key={r.code} value={r.code}>{r.name}</option>)}</select></div>
        <div><label className="field-label">Situação</label>
          <select className="input" name="situacao" defaultValue={f.status}><option value="">Todas</option>
            {Object.entries(STATUS_LABEL).map(([s, l]) => <option key={s} value={s}>{l}</option>)}</select></div>
        <button className="btn-secondary">Filtrar</button>
      </form>
      <div className="no-print flex flex-wrap gap-2">
        <a className="btn-primary btn-sm" href={`/api/admin/bmg/relatorio?${qs}&formato=xlsx`}>Exportar Excel (.xlsx)</a>
        <a className="btn-secondary btn-sm" href={`/api/admin/bmg/relatorio?${qs}&formato=pdf`} target="_blank">Exportar PDF</a>
        <a className="btn-ghost btn-sm" href={`/api/admin/bmg/relatorio?${qs}&formato=csv`}>CSV</a>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="Reservas no período" value={k.bookings} />
        <Stat label="Diárias utilizadas" value={k.nights} />
        <Stat label="Ocupação média" value={`${String(k.occupancy).replace(".", ",")}%`} />
        <Stat label="Média de diárias" value={String(k.avgNights).replace(".", ",")} />
        <Stat label="Apartamentos atendidos" value={k.units} />
        <Stat label="Antecedência média" value={`${String(k.avgLead).replace(".", ",")} dias`} />
        <Stat label="Cancelamentos" value={`${String(k.cancelRate).replace(".", ",")}%`} />
        <Stat label="Ausências" value={k.absences} />
        <Stat label="Ocorrências de tag" value={k.occurrences} />
        <Stat label="Dias no período" value={k.periodDays} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {svg(charts.occupancy)}
        {svg(charts.status)}
      </div>
      {svg(charts.monthly)}
      <div className="grid gap-4 lg:grid-cols-2">
        {svg(charts.units)}
        <section className="card p-2 sm:p-5">
          <h2 className="h2 px-3 pt-2">Por apartamento</h2>
          <div className="table-wrap mt-2">
            <table className="tbl">
              <thead><tr><th>Apto</th><th>Reservas</th><th>Diárias</th><th>Cancel.</th><th>Ausências</th><th>Última entrada</th></tr></thead>
              <tbody>{stats.byUnit.map((u) => (
                <tr key={u.unit}><td className="font-semibold">{u.unit}</td><td>{u.bookings}</td><td>{u.nights}</td><td>{u.cancelled}</td><td>{u.absences}</td>
                  <td>{u.lastStart ? u.lastStart.split("-").reverse().join("/") : "—"}</td></tr>))}</tbody>
            </table>
            {!stats.byUnit.length && <Empty title="Sem reservas no período" />}
          </div>
        </section>
      </div>
      <section className="card p-2 sm:p-5">
        <h2 className="h2 px-3 pt-2">Reservas</h2>
        <div className="table-wrap mt-2">
          <table className="tbl">
            <thead><tr><th>Reserva</th><th>Suíte</th><th>Apto</th><th>Responsável</th><th>Entrada</th><th>Saída</th><th>Diárias</th><th>Hóspedes</th><th>Situação</th><th>Tag</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="text-xs text-noite-50">#{r.code}</td>
                  <td>{r.room}</td><td className="font-semibold">{r.unit}</td><td>{r.responsible_name}</td>
                  <td>{fmtDateTime(r.checkin_at)}</td><td>{fmtDateTime(r.checkout_at)}</td><td>{r.nights}</td>
                  <td>{(r.guests as { name: string }[]).map((g) => g.name).join(", ")}</td>
                  <td><BookingBadge status={r.status} /></td>
                  <td className="text-xs">{r.tag_code ?? "—"}{r.occurrence_status !== "sem_ocorrencia" && r.occurrence_status ? ` · ${r.occurrence_status.replace("_", " ")}` : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!rows.length && <Empty title="Nenhuma reserva no período" />}
        </div>
      </section>
    </div>
  );
}
