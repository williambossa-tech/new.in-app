import Link from "next/link";
import type { CalItem } from "@/lib/quadras/service";

export type View = "dia" | "semana" | "mes";
const pad = (n: number) => String(n).padStart(2, "0");
const addDays = (d: string, n: number) => { const x = new Date(`${d}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
export const mondayOf = (d: string) => addDays(d, -((new Date(`${d}T12:00:00Z`).getUTCDay() + 6) % 7));
const wd = (d: string, style: "short" | "long" = "short") => new Intl.DateTimeFormat("pt-BR", { weekday: style, timeZone: "UTC" }).format(new Date(`${d}T12:00:00Z`)).replace(".", "");
const dm = (d: string) => `${d.slice(8)}/${d.slice(5, 7)}`;
const monthName = (d: string) => new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${d}T12:00:00Z`));
const toMin = (h: string) => Number(h.slice(0, 2)) * 60 + Number(h.slice(3, 5));

export function rangeFor(view: View, d: string) {
  if (view === "dia") return { from: d, to: d };
  if (view === "semana") { const m = mondayOf(d); return { from: m, to: addDays(m, 6) }; }
  const first = `${d.slice(0, 7)}-01`;
  const last = addDays(`${(Number(d.slice(0, 4)) + (d.slice(5, 7) === "12" ? 1 : 0))}-${pad(d.slice(5, 7) === "12" ? 1 : Number(d.slice(5, 7)) + 1)}-01`, -1);
  return { from: mondayOf(first), to: addDays(mondayOf(last), 6), first, last };
}

const tone = (i: CalItem) =>
  i.kind === "bloqueio" ? "bg-noite/10 text-noite-70 ring-noite/15"
  : i.kind === "programacao" ? "bg-violeta-50 text-violeta-700 ring-violeta/25"
  : i.mine ? "bg-turquesa-50 text-[#0e7f74] ring-turquesa/40"
  : "bg-coral-50 text-[#b5452f] ring-coral/30";
const label = (i: CalItem) =>
  i.kind === "bloqueio" ? `Bloqueado · ${i.title}` : i.kind === "programacao" ? `Programação · ${i.title}${i.detail ? ` (${i.detail})` : ""}`
  : i.mine ? `${i.title}${i.status === "solicitada" ? (i.approval === "pendente" ? " · aguardando aprovação" : " · aguardando confirmação") : ""}` : i.title;

export function CourtCalendar({ court, view, day, today, items, admin }: { court: string; view: View; day: string; today: string; items: CalItem[]; admin: boolean }) {
  const href = (v: View, d: string) => `/quadras/${court}?v=${v}&d=${d}#calendario`;
  const step = view === "dia" ? 1 : view === "semana" ? 7 : 0;
  const prev = view === "mes" ? `${day.slice(0, 4)}-${day.slice(5, 7)}-01` : addDays(day, -step);
  const next = view === "mes" ? addDays(rangeFor("mes", day).last!, 1) : addDays(day, step);
  const prevMonth = view === "mes" ? addDays(prev, -1).slice(0, 8) + "01" : prev;
  const byDay = (d: string) => items.filter((i) => i.day === d);
  const title = view === "dia" ? `${wd(day, "long")}, ${dm(day)}` : view === "semana" ? `Semana de ${dm(mondayOf(day))} a ${dm(addDays(mondayOf(day), 6))}` : monthName(day);

  return (
    <section id="calendario" className="card scroll-mt-24 p-5 sm:p-7">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="grid grid-cols-3 rounded-full bg-fundo p-1 text-sm">
          {(["dia", "semana", "mes"] as View[]).map((v) => (
            <Link key={v} href={href(v, day)} scroll={false}
              className={`rounded-full px-4 py-1.5 text-center transition ${view === v ? "bg-white font-semibold text-noite shadow" : "text-noite-50"}`}>
              {v === "dia" ? "Dia" : v === "semana" ? "Semana" : "Mês"}
            </Link>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <Link href={href(view, view === "mes" ? prevMonth : prev)} scroll={false} className="grid h-9 w-9 place-items-center rounded-full bg-fundo text-lg hover:bg-violeta-50" aria-label="Anterior">‹</Link>
          <Link href={href(view, today)} scroll={false} className="rounded-full bg-fundo px-3 py-1.5 text-sm hover:bg-violeta-50">Hoje</Link>
          <Link href={href(view, next)} scroll={false} className="grid h-9 w-9 place-items-center rounded-full bg-fundo text-lg hover:bg-violeta-50" aria-label="Próximo">›</Link>
        </div>
      </div>
      <h3 className="mt-4 text-lg font-semibold capitalize">{title}</h3>

      {view === "dia" && <DayGrid court={court} day={day} items={byDay(day)} past={day < today} admin={admin} />}

      {view === "semana" && (
        <div className="mt-4 grid gap-3 sm:grid-cols-7">
          {Array.from({ length: 7 }, (_, k) => addDays(mondayOf(day), k)).map((d) => {
            const its = byDay(d);
            return (
              <Link key={d} href={href("dia", d)} scroll={false}
                className={`block rounded-2xl p-3 ring-1 transition hover:shadow-md ${d === today ? "ring-violeta" : "ring-linha"} ${d < today ? "opacity-60" : ""}`}>
                <p className="text-xs capitalize text-noite-50">{wd(d)} <span className="font-semibold text-noite">{d.slice(8)}</span></p>
                <div className="mt-2 space-y-1.5">
                  {its.length === 0 && <p className="text-xs text-[#1f8a5a]">Livre</p>}
                  {its.map((i) => (
                    <p key={i.id} className={`rounded-lg px-2 py-1 text-[11px] leading-tight ring-1 ${tone(i)}`}>
                      <span className="font-semibold">{i.start}–{i.end}</span><br /><span className="line-clamp-2">{label(i)}</span>
                    </p>
                  ))}
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {view === "mes" && (() => {
        const r = rangeFor("mes", day);
        const days: string[] = []; for (let d = r.from; d <= r.to; d = addDays(d, 1)) days.push(d);
        return (
          <div className="mt-4">
            <div className="grid grid-cols-7 gap-1 text-center text-[11px] uppercase tracking-wide text-noite-50">
              {["seg", "ter", "qua", "qui", "sex", "sáb", "dom"].map((x) => <span key={x}>{x}</span>)}
            </div>
            <div className="mt-1 grid grid-cols-7 gap-1">
              {days.map((d) => {
                const its = byDay(d); const out = d.slice(0, 7) !== day.slice(0, 7);
                const n = (k: CalItem["kind"]) => its.filter((i) => i.kind === k).length;
                return (
                  <Link key={d} href={href("dia", d)} scroll={false}
                    className={`flex aspect-square flex-col items-center justify-start rounded-xl p-1 text-sm transition hover:bg-violeta-50 sm:aspect-auto sm:min-h-16 ${out ? "opacity-35" : ""} ${d === today ? "ring-2 ring-violeta" : ""}`}>
                    <span className={d < today ? "text-noite-50" : "font-medium"}>{Number(d.slice(8))}</span>
                    <span className="mt-1 flex flex-wrap justify-center gap-0.5">
                      {n("agendamento") > 0 && <span className="h-1.5 w-1.5 rounded-full bg-coral" title={`${n("agendamento")} agendamento(s)`} />}
                      {its.some((i) => i.mine) && <span className="h-1.5 w-1.5 rounded-full bg-turquesa" />}
                      {n("programacao") > 0 && <span className="h-1.5 w-1.5 rounded-full bg-violeta" />}
                      {n("bloqueio") > 0 && <span className="h-1.5 w-1.5 rounded-full bg-noite-50" />}
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>
        );
      })()}

      <div className="mt-5 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-noite-50">
        <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-[#2fbf71]" /> Livre</span>
        <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-coral" /> Agendado</span>
        <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-turquesa" /> Seu</span>
        <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-violeta" /> Programação</span>
        <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-noite-50" /> Bloqueio</span>
      </div>
    </section>
  );
}

function DayGrid({ court, day, items, past, admin }: { court: string; day: string; items: CalItem[]; past: boolean; admin: boolean }) {
  const slots = Array.from({ length: 28 }, (_, k) => 8 * 60 + k * 30);
  const fmt = (m: number) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
  const now = new Date();
  const nowMin = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(now) === day
    ? Number(new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", hour12: false }).format(now)) * 60 + now.getMinutes() : past ? 24 * 60 : -1;
  const shown = new Set<string>();
  return (
    <div className="mt-4 divide-y divide-linha overflow-hidden rounded-2xl ring-1 ring-linha">
      {slots.map((m) => {
        const hit = items.find((i) => toMin(i.start) <= m && toMin(i.end) > m);
        const gone = m + 30 <= nowMin;
        if (hit) {
          if (shown.has(hit.id)) return null;
          shown.add(hit.id);
          return (
            <div key={m} className={`flex items-start gap-3 px-4 py-3 ${tone(hit)} ring-0`}>
              <span className="w-24 shrink-0 text-sm font-semibold tabular-nums">{hit.start}–{hit.end}</span>
              <span className="text-sm">{label(hit)}{admin && hit.unit ? ` · Apto ${hit.unit}` : ""}{admin && hit.detail && hit.kind === "agendamento" ? <><br /><span className="text-xs opacity-80">{hit.detail}</span></> : null}</span>
            </div>
          );
        }
        return gone ? (
          <div key={m} className="flex items-center gap-3 px-4 py-2 text-sm text-noite-50/50"><span className="w-24 tabular-nums">{fmt(m)}</span><span>—</span></div>
        ) : (
          <Link key={m} href={`/quadras/${court}?v=dia&d=${day}&inicio=${fmt(m)}#agendar`} scroll={false}
            className="flex items-center gap-3 px-4 py-2 text-sm transition hover:bg-[#e9f9f0]">
            <span className="w-24 tabular-nums text-noite-70">{fmt(m)}</span><span className="text-[#1f8a5a]">Livre · agendar</span>
          </Link>
        );
      })}
    </div>
  );
}
