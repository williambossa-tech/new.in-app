"use client";

import { useActionState, useMemo, useState } from "react";
import { solicitarBmgAction } from "@/app/actions/bmg";
import { Corujinha } from "@/components/Corujinha";
import { FormMessage, SubmitButton } from "@/components/forms";
import { RoomArt } from "@/components/RoomArt";
import { SimpleMarkdown } from "@/components/ui";
import { addDays, formatCpf, isValidCpf, MAX_NIGHTS, nightsBetween, onlyDigits } from "@/lib/bmg/rules";

type Room = { code: string; name: string; busyTonight: boolean };
type Props = {
  rooms: Room[];
  busy: Record<string, string[]>;
  minStart: string;
  maxDate: string;
  units: { id: string; code: string }[];
  termsMd: string;
  termsVersion: number;
};

const WEEK = ["seg", "ter", "qua", "qui", "sex", "sáb", "dom"];
const monthName = (y: number, m: number) =>
  new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(y, m, 1)));
const longDay = (iso: string) =>
  new Intl.DateTimeFormat("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit", timeZone: "UTC" }).format(new Date(`${iso}T12:00:00Z`)).replace(".", "");

export function BmgPlanner(props: Props) {
  const [state, action] = useActionState(solicitarBmgAction, {});
  const [room, setRoom] = useState(props.rooms[0]?.code ?? "bmg-1");
  const [start, setStart] = useState<string | null>(null);
  const [end, setEnd] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [shakeKey, setShakeKey] = useState(0);
  const [cursor, setCursor] = useState(() => {
    const d = new Date(`${props.minStart}T12:00:00Z`);
    return { y: d.getUTCFullYear(), m: d.getUTCMonth(), dir: "right" as "left" | "right" };
  });
  const [guests, setGuests] = useState([{ name: "", cpf: "", minor: false }]);
  const busy = useMemo(() => new Set(props.busy[room] ?? []), [props.busy, room]);

  const days = useMemo(() => {
    const first = new Date(Date.UTC(cursor.y, cursor.m, 1));
    const offset = (first.getUTCDay() + 6) % 7; // segunda = 0
    const total = new Date(Date.UTC(cursor.y, cursor.m + 1, 0)).getUTCDate();
    const cells: (string | null)[] = Array(offset).fill(null);
    for (let d = 1; d <= total; d++) cells.push(new Date(Date.UTC(cursor.y, cursor.m, d)).toISOString().slice(0, 10));
    return cells;
  }, [cursor]);

  const nights = start && end ? nightsBetween(start, end) : 0;
  const canGoBack = new Date(Date.UTC(cursor.y, cursor.m, 1)).toISOString().slice(0, 7) > props.minStart.slice(0, 7);
  const canGoNext = new Date(Date.UTC(cursor.y, cursor.m + 1, 1)).toISOString().slice(0, 10) <= props.maxDate;

  function fail(msg: string) { setHint(msg); setShakeKey((k) => k + 1); }

  function pick(d: string) {
    setHint(null);
    if (!start || end || d <= start) {
      if (busy.has(d) || d < props.minStart || d > props.maxDate) return fail("Escolha uma noite disponível para a entrada.");
      setStart(d); setEnd(null); return;
    }
    const n = nightsBetween(start, d);
    if (n > MAX_NIGHTS) return fail("O período máximo é de 7 diárias.");
    for (let x = start; x < d; x = addDays(x, 1)) if (busy.has(x)) return fail("Há noites ocupadas no meio do período.");
    setEnd(d);
  }

  function switchRoom(code: string) {
    setRoom(code);
    const b = new Set(props.busy[code] ?? []);
    if (start && end) {
      for (let x = start; x < end; x = addDays(x, 1)) if (b.has(x)) { setStart(null); setEnd(null); setHint("Este quarto está ocupado no período escolhido. Selecione novas datas."); return; }
    } else if (start && b.has(start)) { setStart(null); }
  }

  const guestsOk = guests.every((g) => g.name.trim().split(/\s+/).length >= 2 && isValidCpf(g.cpf)) && !guests.every((g) => g.minor);

  if (state.ok) {
    return (
      <div className="card flex flex-col items-center px-8 py-14 text-center">
        <div className="check-pop grid h-16 w-16 place-items-center rounded-full bg-verde text-3xl text-white">✓</div>
        <h2 className="h1 mt-5">Reserva confirmada</h2>
        <p className="mt-2 max-w-sm text-noite-70">
          {props.rooms.find((r) => r.code === room)?.name} · {start && longDay(start)} a {end && longDay(end)}.
          O comprovante fica em Minhas reservas.
        </p>
        <Corujinha pose="festa" size={120} className="mt-6 owl-bob" alt="" />
      </div>
    );
  }

  return (
    <form action={action} className="space-y-8">
      <input type="hidden" name="room" value={room} />
      <input type="hidden" name="start" value={start ?? ""} />
      <input type="hidden" name="end" value={end ?? ""} />
      <input type="hidden" name="guests" value={JSON.stringify(guests.map((g) => ({ ...g, cpf: onlyDigits(g.cpf) })))} />

      {/* 1. Suíte */}
      <section>
        <h2 className="mb-4 text-sm font-medium text-noite-50">Escolha a suíte</h2>
        <div className="grid grid-cols-2 gap-4">
          {props.rooms.map((r, i) => {
            const on = r.code === room;
            return (
              <button type="button" key={r.code} onClick={() => switchRoom(r.code)}
                className={`group relative overflow-hidden rounded-[22px] bg-white p-3 text-left ring-1 transition duration-300 sm:p-4 ${on ? "-translate-y-1 shadow-xl ring-2 ring-violeta" : "ring-linha hover:-translate-y-0.5 hover:shadow-md"}`}>
                <RoomArt n={(i + 1) as 1 | 2} busy={r.busyTonight} className="w-full" />
                <div className="mt-3 flex items-center justify-between gap-1 px-1">
                  <p className="whitespace-nowrap text-[0.9rem] font-semibold sm:text-base">{r.name}</p>
                  <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full text-[10px] text-white transition ${on ? "scale-100 bg-violeta" : "scale-0"}`}>✓</span>
                </div>
                <p className="flex items-center gap-2 px-1 text-xs text-noite-50">
                  <span className={`inline-block h-2 w-2 rounded-full ${r.busyTonight ? "bg-coral" : "pulse-dot bg-verde"}`} />
                  {r.busyTonight ? "Ocupada hoje" : "Livre hoje"}
                </p>
              </button>
            );
          })}
        </div>
      </section>

      {/* 2. Datas */}
      <section className="card p-5 sm:p-7">
        <div className="mb-5 flex items-center justify-between">
          <button type="button" disabled={!canGoBack} onClick={() => setCursor((c) => ({ y: c.m === 0 ? c.y - 1 : c.y, m: (c.m + 11) % 12, dir: "left" }))}
            className="grid h-10 w-10 place-items-center rounded-full text-xl text-noite-70 hover:bg-violeta-50 disabled:opacity-25" aria-label="Mês anterior">‹</button>
          <p className="font-semibold first-letter:uppercase">{monthName(cursor.y, cursor.m)}</p>
          <button type="button" disabled={!canGoNext} onClick={() => setCursor((c) => ({ y: c.m === 11 ? c.y + 1 : c.y, m: (c.m + 1) % 12, dir: "right" }))}
            className="grid h-10 w-10 place-items-center rounded-full text-xl text-noite-70 hover:bg-violeta-50 disabled:opacity-25" aria-label="Próximo mês">›</button>
        </div>
        <div className="grid grid-cols-7 text-center text-xs text-noite-50">
          {WEEK.map((w) => <span key={w} className="pb-2">{w}</span>)}
        </div>
        <div key={`${cursor.y}-${cursor.m}-${room}`} className={`grid grid-cols-7 gap-y-1.5 ${cursor.dir === "right" ? "month-in-right" : "month-in-left"}`}>
          {days.map((d, i) => {
            if (!d) return <span key={`e${i}`} />;
            const out = d < props.minStart || d > props.maxDate;
            const isBusy = busy.has(d);
            const isStart = d === start;
            const isEnd = d === end;
            const inRange = start && end && d > start && d < end;
            const selectable = !out && (!isBusy || (start && !end && d > start));
            const dayNum = Number(d.slice(8));
            return (
              <div key={d} className={`relative flex h-11 items-center justify-center ${inRange ? "bg-violeta-50" : ""} ${isStart && end ? "rounded-l-full bg-violeta-50" : ""} ${isEnd ? "rounded-r-full bg-violeta-50" : ""}`}>
                <button type="button" disabled={!selectable} onClick={() => pick(d)}
                  className={`relative h-10 w-10 rounded-full text-[0.95rem] transition duration-200
                    ${isStart || isEnd ? "scale-105 bg-violeta font-semibold text-white shadow-md" : ""}
                    ${!isStart && !isEnd && isBusy ? "text-noite-50/60 line-through decoration-coral/70" : ""}
                    ${!isStart && !isEnd && out ? "text-noite-50/35" : ""}
                    ${!isStart && !isEnd && !isBusy && !out ? "hover:bg-violeta-100" : ""}`}>
                  {dayNum}
                </button>
              </div>
            );
          })}
        </div>
        <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-xs text-noite-50">
          <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-full bg-violeta" /> Sua escolha</span>
          <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-full ring-1 ring-linha" /> Disponível</span>
          <span className="flex items-center gap-1.5"><span className="text-noite-50/60 line-through decoration-coral">12</span> Ocupado</span>
        </div>

        <div key={shakeKey} className={`mt-6 rounded-2xl bg-fundo p-4 ${hint ? "shake" : ""}`}>
          {hint ? <p className="text-sm text-[#c23a2b]">{hint}</p>
            : !start ? <p className="text-sm text-noite-70">Toque no dia da <b className="font-semibold">entrada</b>.</p>
            : !end ? <p className="text-sm text-noite-70">Entrada {longDay(start)}. Agora toque no dia da <b className="font-semibold">saída</b>.</p>
            : (
              <div className="flex items-center justify-between gap-4">
                <div className="text-sm">
                  <p><span className="text-noite-50">Entrada</span> <b className="font-semibold">{longDay(start)}</b> · a partir das 18h</p>
                  <p><span className="text-noite-50">Saída</span> <b className="font-semibold">{longDay(end)}</b> · até 12h</p>
                </div>
                <div key={nights} className="check-pop text-right">
                  <p className="text-2xl font-semibold text-violeta-700">{nights}</p>
                  <p className="text-xs text-noite-50">{nights === 1 ? "diária" : "diárias"}</p>
                </div>
              </div>
            )}
        </div>
      </section>

      {/* 3. Hóspedes */}
      {start && end && (
        <section className="card p-5 sm:p-7">
          <h2 className="h2">Hóspedes</h2>
          <p className="mt-1 text-sm text-noite-50">Até 2 pessoas.</p>
          <div className="mt-5 space-y-5">
            {guests.map((g, i) => {
              const cpfBad = g.cpf.length >= 11 && !isValidCpf(g.cpf);
              return (
                <div key={i} className="grid gap-3 sm:grid-cols-[1.4fr_1fr_auto] sm:items-end">
                  <div>
                    <label className="field-label">Nome completo</label>
                    <input className="input" value={g.name} onChange={(e) => setGuests((gs) => gs.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
                  </div>
                  <div>
                    <label className="field-label">CPF</label>
                    <input className={`input ${cpfBad ? "border-coral" : ""}`} inputMode="numeric" value={formatCpf(g.cpf)}
                      onChange={(e) => setGuests((gs) => gs.map((x, j) => (j === i ? { ...x, cpf: onlyDigits(e.target.value).slice(0, 11) } : x)))} />
                  </div>
                  <label className="flex min-h-12 items-center gap-2 text-sm text-noite-70">
                    <input type="checkbox" checked={g.minor} className="h-5 w-5 accent-violeta"
                      onChange={(e) => setGuests((gs) => gs.map((x, j) => (j === i ? { ...x, minor: e.target.checked } : x)))} />
                    Menor de 18
                  </label>
                </div>
              );
            })}
          </div>
          <div className="mt-4 flex gap-4 text-sm">
            {guests.length < 2 && <button type="button" className="font-medium text-violeta-700" onClick={() => setGuests((g) => [...g, { name: "", cpf: "", minor: false }])}>+ Adicionar hóspede</button>}
            {guests.length > 1 && <button type="button" className="text-noite-50" onClick={() => setGuests((g) => g.slice(0, 1))}>Remover segundo hóspede</button>}
          </div>
          {guests.every((g) => g.minor) && <p className="mt-3 text-sm text-[#c23a2b]">Menores precisam estar acompanhados do responsável legal.</p>}

          {props.units.length > 1 && (
            <div className="mt-6 max-w-xs">
              <label className="field-label">Apartamento</label>
              <select name="unit_id" className="input">{props.units.map((u) => <option key={u.id} value={u.id}>{u.code}</option>)}</select>
            </div>
          )}
          {props.units.length === 1 && <input type="hidden" name="unit_id" value={props.units[0].id} />}

          <div className="mt-7">
            <details>
              <summary className="cursor-pointer list-none text-sm font-medium text-violeta-700">Termo de responsabilidade ›</summary>
              <SimpleMarkdown text={props.termsMd} className="mt-3 rounded-2xl bg-fundo p-5 text-[0.93rem] text-noite-70" />
            </details>
            <label className="mt-4 flex items-start gap-3">
              <input type="checkbox" name="accept" className="mt-1 h-5 w-5 accent-violeta" />
              <span>Li e aceito o termo de responsabilidade.</span>
            </label>
          </div>

          <div className="mt-7 space-y-3">
            <SubmitButton className="btn-primary w-full sm:w-auto sm:px-10" pendingText="Reservando…">Reservar</SubmitButton>
            {!guestsOk && <p className="text-xs text-noite-50">Preencha nome completo e CPF válido de cada hóspede.</p>}
            <FormMessage state={state} />
          </div>
        </section>
      )}
    </form>
  );
}
