"use client";

import { useActionState, useMemo, useState } from "react";
import { reservarCwAction } from "@/app/actions/cw";
import { CoworkArt } from "@/components/CoworkArt";
import { Corujinha } from "@/components/Corujinha";
import { FormMessage, SubmitButton } from "@/components/forms";
import { SadOwl } from "@/components/SadOwl";
import { formatCpf, isValidCpf, onlyDigits } from "@/lib/bmg/rules";

type Room = { code: string; name: string; capacity: number };
type Usage = { atendDays: number; distinctGuests: number; guestCpfs: string[]; atendDayList: string[] };
type Props = {
  rooms: Room[];
  busy: Record<string, [number, number][]>;
  days: string[];
  advanceMin: number;
  units: { id: string; code: string }[];
  usage: Record<string, Usage>; // por segunda-feira da semana
};

const DUR = [30, 60, 90, 120];
const durLabel = (m: number) => (m < 60 ? `${m} min` : m % 60 ? `${Math.floor(m / 60)}h${m % 60}` : `${m / 60}h`);
const slotTime = (i: number) => `${String(Math.floor(i / 2)).padStart(2, "0")}:${i % 2 ? "30" : "00"}`;
const at = (day: string, hhmm: string) => new Date(`${day}T${hhmm}:00-03:00`).getTime();
const mondayOf = (d: string) => { const x = new Date(`${d}T12:00:00Z`); const w = (x.getUTCDay() + 6) % 7; x.setUTCDate(x.getUTCDate() - w); return x.toISOString().slice(0, 10); };
const dayChip = (d: string, i: number) => {
  if (i === 0) return ["Hoje", d.slice(8)];
  if (i === 1) return ["Amanhã", d.slice(8)];
  return [new Intl.DateTimeFormat("pt-BR", { weekday: "short", timeZone: "UTC" }).format(new Date(`${d}T12:00:00Z`)).replace(".", ""), d.slice(8)];
};

export function CwPlanner(p: Props) {
  const [state, action] = useActionState(reservarCwAction, {});
  const [room, setRoom] = useState(p.rooms[0]?.code ?? "cw-reunioes");
  const [day, setDay] = useState(p.days[0]);
  const [minutes, setMinutes] = useState(60);
  const [slot, setSlot] = useState<number | null>(null);
  const [purpose, setPurpose] = useState<"uso_pessoal" | "atendimento">("uso_pessoal");
  const [guests, setGuests] = useState([{ name: "", cpf: "" }]);
  const roomInfo = p.rooms.find((r) => r.code === room)!;
  const maxGuests = Math.max(0, (roomInfo?.capacity ?? 1) - 1);
  const ranges = useMemo(() => p.busy[room] ?? [], [p.busy, room]);
  const now = Date.now();

  const slots = useMemo(() => Array.from({ length: 48 }, (_, i) => {
    const s = at(day, slotTime(i)), e = s + minutes * 60_000;
    const tooSoon = s - now < p.advanceMin * 60_000;
    const taken = ranges.some(([lo, hi]) => lo < e && hi > s);
    const occupiedNow = ranges.some(([lo, hi]) => lo < s + 30 * 60_000 && hi > s);
    return { i, label: slotTime(i), ok: !tooSoon && !taken, occupied: occupiedNow, past: tooSoon };
  }), [day, minutes, ranges, now, p.advanceMin]);

  const week = mondayOf(day);
  const u = p.usage[week] ?? { atendDays: 0, distinctGuests: 0, guestCpfs: [], atendDayList: [] };
  const newCpfs = purpose === "atendimento" ? guests.map((g) => onlyDigits(g.cpf)).filter((c) => c.length === 11 && !u.guestCpfs.includes(c)) : [];
  const projDays = purpose === "atendimento" && !u.atendDayList.includes(day) ? u.atendDays + 1 : u.atendDays;
  const projGuests = u.distinctGuests + new Set(newCpfs).size;
  const limitHit = state.data?.limit as string | undefined;

  if (state.ok) {
    const pending = !!state.data?.pending;
    return (
      <div className="card flex flex-col items-center px-8 py-14 text-center">
        <div className={`check-pop grid h-16 w-16 place-items-center rounded-full text-3xl text-white ${pending ? "bg-amarelo" : "bg-verde"}`}>{pending ? "…" : "✓"}</div>
        <h2 className="h1 mt-5">{pending ? "Pedido enviado" : "Reserva confirmada"}</h2>
        <p className="mt-2 max-w-sm text-noite-70">
          {roomInfo.name} · {day.split("-").reverse().slice(0, 2).join("/")} às {slot !== null ? slotTime(slot) : ""} · {durLabel(minutes)}
          {pending ? ". A administração vai analisar o pedido de exceção." : "."}
        </p>
        <Corujinha pose={pending ? "dica" : "festa"} size={120} className="owl-bob mt-6" alt="" />
      </div>
    );
  }

  return (
    <form action={action} className="space-y-8">
      <input type="hidden" name="room" value={room} />
      <input type="hidden" name="day" value={day} />
      <input type="hidden" name="start" value={slot !== null ? slotTime(slot) : ""} />
      <input type="hidden" name="minutes" value={minutes} />
      <input type="hidden" name="purpose" value={purpose} />
      <input type="hidden" name="guests" value={JSON.stringify(purpose === "atendimento" ? guests.map((g) => ({ ...g, cpf: onlyDigits(g.cpf) })) : [])} />
      {p.units.length === 1 && <input type="hidden" name="unit_id" value={p.units[0].id} />}

      <section>
        <h2 className="mb-4 text-sm font-medium text-noite-50">Escolha a sala</h2>
        <div className="grid grid-cols-2 gap-4">
          {p.rooms.map((r) => {
            const on = r.code === room;
            return (
              <button type="button" key={r.code} onClick={() => { setRoom(r.code); setSlot(null); if (r.capacity <= 2) setGuests((g) => g.slice(0, 1)); }}
                className={`rounded-[22px] bg-white p-3 text-left ring-1 transition duration-300 sm:p-4 ${on ? "-translate-y-1 shadow-xl ring-2 ring-turquesa" : "ring-linha hover:-translate-y-0.5 hover:shadow-md"}`}>
                <CoworkArt kind={r.code === "cw-mini" ? "mini" : "reunioes"} className="w-full" />
                <div className="mt-3 flex items-center justify-between gap-1 px-1">
                  <p className="whitespace-nowrap text-[0.9rem] font-semibold sm:text-base">{r.name}</p>
                  <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full text-[10px] text-white transition ${on ? "scale-100 bg-turquesa" : "scale-0"}`}>✓</span>
                </div>
                <p className="px-1 text-xs text-noite-50">Até {r.capacity} pessoas</p>
              </button>
            );
          })}
        </div>
      </section>

      <section className="card p-5 sm:p-7">
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-2">
          {p.days.map((d, i) => {
            const [a, b] = dayChip(d, i);
            const on = d === day;
            return (
              <button type="button" key={d} onClick={() => { setDay(d); setSlot(null); }}
                className={`flex min-w-[64px] flex-col items-center rounded-2xl px-3 py-2 transition ${on ? "bg-turquesa text-white shadow-md" : "bg-fundo text-noite-70 hover:bg-turquesa-50"}`}>
                <span className="text-xs capitalize">{a}</span><span className="text-lg font-semibold">{b}</span>
              </button>
            );
          })}
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-2">
          <span className="mr-1 text-sm text-noite-50">Duração</span>
          {DUR.map((m) => (
            <button type="button" key={m} onClick={() => { setMinutes(m); setSlot(null); }}
              className={`rounded-full px-4 py-1.5 text-sm transition ${minutes === m ? "bg-noite text-white" : "bg-fundo text-noite-70 hover:bg-violeta-50"}`}>{durLabel(m)}</button>
          ))}
        </div>

        <div key={`${day}-${room}-${minutes}`} className="month-in-right mt-5 grid grid-cols-4 gap-2 sm:grid-cols-8">
          {slots.filter((s) => at(day, s.label) + 30 * 60_000 > now).map((s) => {
            const sel = slot !== null && s.i >= slot && s.i < slot + minutes / 30;
            const first = slot === s.i;
            return (
              <button type="button" key={s.i} disabled={!s.ok && !sel} onClick={() => setSlot(s.i)}
                className={`h-10 rounded-xl text-sm transition duration-200
                  ${first ? "scale-105 bg-turquesa font-semibold text-white shadow-md" : sel ? "bg-turquesa-50 text-[#0e7f74]" : ""}
                  ${!sel && s.occupied ? "bg-coral-50/60 text-noite-50/60 line-through decoration-coral/60" : ""}
                  ${!sel && !s.occupied && s.past ? "text-noite-50/35" : ""}
                  ${!sel && s.ok ? "bg-fundo hover:bg-turquesa-50" : ""}
                  ${!sel && !s.ok && !s.occupied && !s.past ? "text-noite-50/45" : ""}`}>
                {s.label}
              </button>
            );
          })}
        </div>
        <p className="mt-4 text-xs text-noite-50">Funciona 24 horas · até 2 horas por reserva · prorrogável por mais 1 hora se o horário seguinte estiver livre.</p>
      </section>

      {slot !== null && (
        <section className="card p-5 sm:p-7">
          <div className="grid grid-cols-2 gap-2 rounded-full bg-fundo p-1">
            {([["uso_pessoal", "Uso pessoal"], ["atendimento", "Receber convidados"]] as const).map(([k, l]) => (
              <button type="button" key={k} onClick={() => setPurpose(k)}
                className={`rounded-full py-2.5 text-sm font-medium transition ${purpose === k ? "bg-white text-noite shadow" : "text-noite-50"}`}>{l}</button>
            ))}
          </div>

          {purpose === "atendimento" && (
            <>
              <div className="mt-6 space-y-4">
                {guests.map((g, i) => {
                  const bad = onlyDigits(g.cpf).length === 11 && !isValidCpf(g.cpf);
                  return (
                    <div key={i} className="grid gap-3 sm:grid-cols-[1.4fr_1fr_auto] sm:items-end">
                      <div><label className="field-label">Convidado {i + 1}</label>
                        <input className="input" placeholder="Nome completo" value={g.name} onChange={(e) => setGuests((gs) => gs.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} /></div>
                      <div><label className="field-label">CPF</label>
                        <input className={`input ${bad ? "border-coral" : ""}`} inputMode="numeric" value={formatCpf(g.cpf)}
                          onChange={(e) => setGuests((gs) => gs.map((x, j) => (j === i ? { ...x, cpf: onlyDigits(e.target.value).slice(0, 11) } : x)))} /></div>
                      {guests.length > 1 && <button type="button" className="min-h-12 text-sm text-noite-50" onClick={() => setGuests((gs) => gs.filter((_, j) => j !== i))}>Remover</button>}
                    </div>
                  );
                })}
              </div>
              {guests.length < maxGuests && (
                <button type="button" className="mt-3 text-sm font-medium text-violeta-700" onClick={() => setGuests((g) => [...g, { name: "", cpf: "" }])}>+ Adicionar convidado</button>
              )}
              <p className="mt-2 text-xs text-noite-50">{roomInfo.name}: até {maxGuests} {maxGuests === 1 ? "convidado" : "convidados"}.</p>

              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                <Meter label="Dias de atendimento nesta semana" value={projDays} max={3} />
                <Meter label="Convidados diferentes nesta semana" value={projGuests} max={10} />
              </div>
            </>
          )}

          {p.units.length > 1 && (
            <div className="mt-6 max-w-xs"><label className="field-label">Apartamento</label>
              <select name="unit_id" className="input">{p.units.map((x) => <option key={x.id} value={x.id}>{x.code}</option>)}</select></div>
          )}

          {limitHit ? (
            <div className="mt-6 rounded-2xl bg-fundo p-5 ring-1 ring-linha">
              <div className="flex items-center gap-4">
                <SadOwl size={90} />
                <div><p className="font-semibold">{state.message}</p>
                  <p className="text-sm text-noite-70">Você pode pedir uma exceção à administração. Se aprovada, a reserva é confirmada.</p></div>
              </div>
              <label className="field-label mt-4">Motivo do pedido</label>
              <textarea name="exception_reason" rows={2} className="input" required minLength={10} placeholder="Explique por que precisa desta reserva" />
              <SubmitButton className="btn-primary mt-4" pendingText="Enviando…">Pedir exceção</SubmitButton>
            </div>
          ) : (
            <div className="mt-7 space-y-3">
              <SubmitButton className="btn-primary w-full bg-turquesa hover:bg-[#13a091] sm:w-auto sm:px-10" pendingText="Reservando…">
                Reservar {slotTime(slot)}–{slotTime((slot + minutes / 30) % 48)}
              </SubmitButton>
              <FormMessage state={state} />
            </div>
          )}
        </section>
      )}
    </form>
  );
}

function Meter({ label, value, max }: { label: string; value: number; max: number }) {
  const over = value > max;
  return (
    <div className="rounded-2xl bg-fundo p-4">
      <div className="flex items-center justify-between text-sm"><span className="text-noite-70">{label}</span><span className={`font-semibold ${over ? "text-[#c23a2b]" : ""}`}>{value}/{max}</span></div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-white">
        <div className={`grow-x h-full rounded-full ${over ? "bg-coral" : value === max ? "bg-amarelo" : "bg-turquesa"}`} style={{ width: `${Math.min(100, (value / max) * 100)}%` }} />
      </div>
    </div>
  );
}
