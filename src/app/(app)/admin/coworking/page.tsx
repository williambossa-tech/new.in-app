import Link from "next/link";
import { cancelarCwAction, configCwAction, excecaoCwAction } from "@/app/actions/cw";
import { AdminTabs } from "@/components/AppShell";
import { CancelWithReason } from "@/components/CancelWithReason";
import { ActionForm, SubmitButton } from "@/components/forms";
import { BookingBadge, Empty, Stat } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { addDays, formatCpf, todayIso } from "@/lib/bmg/rules";
import { cwAdminData } from "@/lib/cw/queries";
import { cwSettings } from "@/lib/cw/service";
import { asUser } from "@/lib/db";

export const metadata = { title: "Coworking · Administração" };
type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const hm = (d: Date) => new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" }).format(d);
const dm = (d: Date | string) => new Date(d).toISOString().slice(0, 10).split("-").reverse().slice(0, 2).join("/");

export default async function AdminCw({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const me = await requireRole("admin", "sindico", "conselheiro");
  const sp = await searchParams;
  const aba = sp.aba ?? "agenda";
  const day = sp.dia ?? todayIso();
  const from = sp.de ?? addDays(todayIso(), -30);
  const to = sp.ate ?? addDays(todayIso(), 14);
  const data = await cwAdminData(me.id, { from, to, day });
  const settings = await asUser(me.id, (tx) => cwSettings(tx));
  const tabs = [["agenda", "Agenda do dia"], ["excecoes", `Exceções${data.pending.length ? ` (${data.pending.length})` : ""}`], ["relatorio", "Relatório"], ["config", "Configuração"]];
  return (
    <>
      <AdminTabs active="/admin/coworking" />
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div><p className="eyebrow">Administração</p><h1 className="h1">Coworking</h1></div>
        <span className={settings.open ? "badge-verde" : "badge-amarelo"}>{settings.open ? `Reservas abertas · antecedência ${settings.advanceMin} min` : "Reservas fechadas"}</span>
      </div>
      <div className="no-print -mx-4 mb-8 overflow-x-auto px-4">
        <div className="flex w-max gap-1 rounded-full bg-white p-1 ring-1 ring-linha">
          {tabs.map(([k, l]) => <Link key={k} href={`?aba=${k}`} className={`rounded-full px-4 py-2 text-sm font-medium ${aba === k ? "bg-turquesa text-white" : "text-noite-70 hover:bg-turquesa-50"}`}>{l}</Link>)}
        </div>
      </div>

      {aba === "agenda" && (
        <div className="space-y-6">
          <form className="flex items-end gap-3"><input type="hidden" name="aba" value="agenda" />
            <div><label className="field-label">Dia</label><input className="input" type="date" name="dia" defaultValue={day} /></div>
            <button className="btn-secondary">Ver</button></form>
          <section className="card overflow-x-auto p-5 sm:p-7">
            <div className="min-w-[760px]">
              <div className="ml-36 flex text-[11px] text-noite-50">{Array.from({ length: 24 }, (_, h) => <div key={h} className="flex-1">{String(h).padStart(2, "0")}</div>)}</div>
              {data.rooms.map((r) => (
                <div key={r.code} className="flex items-center border-t border-linha py-4">
                  <div className="w-36 shrink-0 pr-3 text-sm font-semibold">{r.name}</div>
                  <div className="relative h-12 flex-1 rounded-xl bg-fundo">
                    {data.dayRows.filter((b) => b.room_code === r.code).map((b, i) => {
                      const s = new Date(b.ini), e = new Date(b.fim);
                      const h = (d: Date) => { const [hh, mm] = hm(d).split(":").map(Number); return hh + mm / 60; };
                      const left = (h(s) / 24) * 100, width = Math.max(1.5, ((+e - +s) / 3600_000 / 24) * 100);
                      return <div key={b.id} title={`Apto ${b.unit} · ${hm(s)}–${hm(e)}`} style={{ left: `${left}%`, width: `${width}%`, animationDelay: `${i * 70}ms` }}
                        className={`grow-x absolute top-1.5 flex h-9 items-center overflow-hidden rounded-lg px-2 text-xs font-semibold text-white ${b.status === "solicitada" ? "bg-amarelo text-noite" : b.purpose === "atendimento" ? "bg-violeta" : "bg-turquesa"}`}>
                        <span className="truncate">{b.unit}</span></div>;
                    })}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-3 flex gap-4 text-xs text-noite-50">
              <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-turquesa" />Uso pessoal</span>
              <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-violeta" />Atendimento</span>
              <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-amarelo" />Exceção em análise</span>
            </div>
          </section>
          {data.dayRows.map((b) => <Card key={b.id} b={b} />)}
          {!data.dayRows.length && <div className="card"><Empty title="Nenhuma reserva neste dia" /></div>}
        </div>
      )}

      {aba === "excecoes" && (
        <div className="space-y-4">
          {!data.pending.length && <div className="card"><Empty pose="festa" title="Nenhum pedido de exceção" /></div>}
          {data.pending.map((b) => (
            <div key={b.id} className="card p-6 ring-2 ring-amarelo">
              <Card b={b} bare />
              <p className="mt-3 text-sm"><b className="font-semibold">Limite:</b> {b.exception_limit === "dias" ? "mais de 3 dias de atendimento na semana" : "mais de 10 convidados diferentes na semana"}</p>
              <p className="text-sm"><b className="font-semibold">Motivo:</b> {b.exception_reason}</p>
              <ActionForm action={excecaoCwAction} className="mt-4 flex flex-wrap gap-2">
                <input type="hidden" name="booking_id" value={b.id} />
                <input className="input min-h-10 flex-1" name="note" placeholder="Justificativa da decisão" required />
                <button name="decision" value="aprovada" className="btn-success btn-sm">Aprovar</button>
                <button name="decision" value="recusada" className="btn-danger btn-sm">Recusar</button>
              </ActionForm>
            </div>
          ))}
        </div>
      )}

      {aba === "relatorio" && (
        <div className="space-y-6">
          <form className="no-print card grid gap-3 p-5 sm:grid-cols-4 sm:items-end"><input type="hidden" name="aba" value="relatorio" />
            <div><label className="field-label">De</label><input className="input" type="date" name="de" defaultValue={from} /></div>
            <div><label className="field-label">Até</label><input className="input" type="date" name="ate" defaultValue={to} /></div>
            <button className="btn-secondary">Filtrar</button>
            <a className="btn-primary btn-sm self-center" href={`/api/admin/cw?de=${from}&ate=${to}`}>Exportar Excel (CSV)</a></form>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Reservas" value={data.report.filter((b) => ["confirmada", "em_uso", "concluida"].includes(b.status)).length} />
            <Stat label="Horas reservadas" value={data.report.filter((b) => ["confirmada", "em_uso", "concluida"].includes(b.status)).reduce((a, b) => a + (+new Date(b.fim) - +new Date(b.ini)) / 3600_000, 0).toLocaleString("pt-BR")} />
            <Stat label="Atendimentos" value={data.report.filter((b) => b.purpose === "atendimento" && ["confirmada", "em_uso", "concluida"].includes(b.status)).length} />
            <Stat label="Exceções pedidas" value={data.report.filter((b) => b.exception_status).length} />
          </div>
          <section className="card p-2 sm:p-5">
            <h2 className="h2 px-3 pt-2">Uso semanal por apartamento (limites do item 23.14)</h2>
            <div className="table-wrap mt-2"><table className="tbl">
              <thead><tr><th>Semana</th><th>Apto</th><th>Reservas</th><th>Horas</th><th>Dias de atendimento</th><th>Convidados diferentes</th></tr></thead>
              <tbody>{data.weekly.map((w) => (
                <tr key={`${w.week}${w.unit}`}><td>{dm(w.week)}</td><td className="font-semibold">{w.unit}</td><td>{w.reservas}</td><td>{String(w.horas ?? 0).replace(".", ",")}</td>
                  <td className={w.dias_atendimento > 3 ? "font-semibold text-[#c23a2b]" : ""}>{w.dias_atendimento}/3</td>
                  <td className={w.convidados > 10 ? "font-semibold text-[#c23a2b]" : ""}>{w.convidados}/10</td></tr>))}</tbody>
            </table>{!data.weekly.length && <Empty title="Sem reservas no período" />}</div>
          </section>
        </div>
      )}

      {aba === "config" && (
        <section className="card max-w-xl p-7">
          <h2 className="h2">Configuração</h2>
          <ActionForm action={configCwAction} className="mt-5 space-y-4">
            <div><label className="field-label">Antecedência mínima (minutos)</label>
              <input className="input w-40" name="advance_min" type="number" min={0} max={10080} defaultValue={settings.advanceMin ?? ""} /></div>
            <label className="flex items-center gap-3"><input type="checkbox" name="open" defaultChecked={settings.open} className="h-5 w-5 accent-violeta" /><span>Reservas abertas para os moradores</span></label>
            <input className="input" name="source" placeholder="Fonte da definição" required />
            <SubmitButton>Salvar</SubmitButton>
          </ActionForm>
        </section>
      )}
    </>
  );
}

function Card({ b, bare }: { b: Row; bare?: boolean }) {
  const inner = (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <p className="font-semibold">{b.room} · Apto {b.unit}</p><BookingBadge status={b.status} />
        <span className="badge-cinza">{b.purpose === "atendimento" ? "Atendimento" : "Uso pessoal"}</span>
        {b.extended && <span className="badge-violeta">Prorrogada</span>}
        <span className="ml-auto text-xs text-noite-50">#{b.code}</span>
      </div>
      <p className="mt-1 text-sm text-noite-70">{dm(b.local_day)} · {hm(b.ini)}–{hm(b.fim)} · {b.responsible_name}</p>
      {(b.guests as { name: string; cpf: string }[]).map((g) => <p key={g.cpf} className="text-sm">{g.name} · <span className="text-noite-50">CPF {formatCpf(g.cpf)}</span></p>)}
    </>
  );
  if (bare) return inner;
  return (
    <div className="card p-6">
      {inner}
      {["solicitada", "confirmada"].includes(b.status) && <div className="mt-3"><CancelWithReason id={b.id} action={cancelarCwAction} /></div>}
    </div>
  );
}
