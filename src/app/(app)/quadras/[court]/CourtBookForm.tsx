"use client";

import { useActionState, useMemo, useState } from "react";
import { agendarQuadraAction } from "@/app/actions/quadras";
import { Corujinha } from "@/components/Corujinha";
import { FormMessage, SubmitButton } from "@/components/forms";

type Busy = { day: string; start: string; end: string; kind: string; title: string };
type Props = {
  court: "poli" | "areia"; courtName: string; today: string; initialDay: string; initialStart?: string;
  modalidades: string[]; duracao: number | null; consecutivos: number | null; busy: Busy[];
  units: { id: string; code: string }[]; terms: string;
};

const pad = (n: number) => String(n).padStart(2, "0");
const toMin = (h: string) => Number(h.slice(0, 2)) * 60 + Number(h.slice(3, 5));
const fmt = (m: number) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
const OPEN = 8 * 60, CLOSE = 22 * 60;

export function CourtBookForm(p: Props) {
  const [state, action] = useActionState(agendarQuadraAction, {});
  const [day, setDay] = useState(p.initialDay);
  const [start, setStart] = useState(p.initialStart ?? "");
  const [end, setEnd] = useState("");
  const [modality, setModality] = useState("");
  const [participants, setParticipants] = useState(2);
  const [visitors, setVisitors] = useState(0);
  const [activity, setActivity] = useState<"recreativo" | "jogo">("recreativo");

  const dayBusy = useMemo(() => p.busy.filter((b) => b.day === day), [p.busy, day]);
  const nowMin = day === p.today ? (() => { const d = new Date(); const h = Number(new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", hour12: false }).format(d)); return h * 60 + d.getMinutes(); })() : -1;
  const isBusy = (a: number, b: number) => dayBusy.some((x) => toMin(x.start) < b && toMin(x.end) > a);
  const starts = Array.from({ length: (CLOSE - OPEN) / 30 }, (_, k) => OPEN + k * 30).filter((m) => m > nowMin);
  const sMin = start ? toMin(start) : null;
  const maxLen = p.duracao ?? p.consecutivos ?? CLOSE - OPEN;
  const ends = sMin === null ? [] : (p.duracao ? [sMin + p.duracao] : Array.from({ length: maxLen / 30 }, (_, k) => sMin + (k + 1) * 30))
    .filter((m) => m <= CLOSE).filter((m) => !isBusy(sMin, m));
  const endVal = p.duracao && sMin !== null ? fmt(sMin + p.duracao) : end;
  const needsApproval = activity === "jogo" && visitors > 4;

  if (state.ok) {
    const st = state.data?.status as string;
    return (
      <div className="card flex flex-col items-center px-8 py-12 text-center">
        <div className={`check-pop grid h-16 w-16 place-items-center rounded-full text-3xl text-white ${st === "confirmada" ? "bg-verde" : "bg-amarelo"}`}>{st === "confirmada" ? "✓" : "…"}</div>
        <h2 className="h1 mt-5">{st === "confirmada" ? "Agendado!" : st === "pendente_aprovacao" ? "Pedido enviado" : "Solicitado"}</h2>
        <p className="mt-2 max-w-sm text-noite-70">{p.courtName} · {day.split("-").reverse().slice(0, 2).join("/")} · {start}–{endVal}</p>
        <p className="mt-1 max-w-sm text-sm text-noite-50">{state.message}</p>
        <Corujinha pose={st === "confirmada" ? "festa" : "dica"} size={110} className="owl-bob mt-6" alt="" />
        <a href={`/quadras/${p.court}`} className="btn-secondary btn-sm mt-6">Fazer outro agendamento</a>
      </div>
    );
  }

  return (
    <form action={action} id="agendar" className="card scroll-mt-24 space-y-6 p-5 sm:p-7">
      <input type="hidden" name="court" value={p.court} />
      <input type="hidden" name="activity" value={activity} />
      <input type="hidden" name="modality" value={modality} />
      {p.units.length === 1 && <input type="hidden" name="unit_id" value={p.units[0].id} />}
      <h2 className="h2">Agendar</h2>

      <div className="grid gap-4 sm:grid-cols-3">
        <div><label className="field-label" htmlFor="day">Data</label>
          <input id="day" name="day" type="date" className="input" min={p.today} value={day} onChange={(e) => { setDay(e.target.value); setStart(""); setEnd(""); }} required /></div>
        <div><label className="field-label" htmlFor="start">Início</label>
          <select id="start" name="start" className="input" value={start} onChange={(e) => { setStart(e.target.value); setEnd(""); }} required>
            <option value="">—</option>
            {starts.map((m) => <option key={m} value={fmt(m)} disabled={isBusy(m, m + 30)}>{fmt(m)}{isBusy(m, m + 30) ? " · ocupado" : ""}</option>)}
          </select></div>
        <div><label className="field-label" htmlFor="end">Término</label>
          {p.duracao ? <><input type="hidden" name="end" value={endVal} /><input id="end" className="input" value={sMin !== null ? endVal : ""} readOnly /></> : (
            <select id="end" name="end" className="input" value={end} onChange={(e) => setEnd(e.target.value)} required disabled={sMin === null}>
              <option value="">—</option>
              {ends.map((m) => <option key={m} value={fmt(m)}>{fmt(m)}</option>)}
            </select>)}
        </div>
      </div>
      {dayBusy.length > 0 && (
        <p className="-mt-2 text-xs text-noite-50">Ocupado neste dia: {dayBusy.map((b) => `${b.start}–${b.end}${b.kind !== "agendamento" ? ` (${b.title})` : ""}`).join(" · ")}</p>
      )}

      <div>
        <p className="field-label">Modalidade</p>
        <div className="flex flex-wrap gap-2">
          {p.modalidades.map((m) => (
            <button type="button" key={m} onClick={() => setModality(m)}
              className={`rounded-full px-4 py-2 text-sm transition ${modality === m ? "bg-noite text-white" : "bg-fundo text-noite-70 hover:bg-violeta-50"}`}>{m}</button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div><label className="field-label" htmlFor="participants">Participantes (estimado)</label>
          <input id="participants" name="participants" type="number" inputMode="numeric" min={1} max={60} className="input" value={participants}
            onChange={(e) => setParticipants(Math.max(1, Number(e.target.value) || 1))} required /></div>
        <div><label className="field-label" htmlFor="visitors">Visitantes</label>
          <input id="visitors" name="visitors" type="number" inputMode="numeric" min={0} max={Math.max(0, participants - 1)} className="input" value={visitors}
            onChange={(e) => setVisitors(Math.max(0, Number(e.target.value) || 0))} /></div>
      </div>

      <div>
        <p className="field-label">Atividade</p>
        <div className="grid grid-cols-2 gap-2 rounded-full bg-fundo p-1">
          {([["recreativo", "Uso recreativo"], ["jogo", "Jogo amistoso ou organizado"]] as const).map(([k, l]) => (
            <button type="button" key={k} onClick={() => setActivity(k)}
              className={`rounded-full px-2 py-2.5 text-sm font-medium transition ${activity === k ? "bg-white text-noite shadow" : "text-noite-50"}`}>{l}</button>
          ))}
        </div>
        <input name="activity_note" className="input mt-3" maxLength={140} placeholder="Descrição (opcional) — ex.: treino em família, jogo com amigos" />
      </div>

      {needsApproval && (
        <div className="flex items-center gap-3 rounded-2xl bg-amarelo/15 p-4 text-sm text-noite-70 ring-1 ring-amarelo/40">
          <Corujinha pose="dica" size={48} alt="" />
          Jogos com mais de 4 visitantes dependem de autorização da administração. Seu pedido segue para aprovação.
        </div>
      )}

      {p.units.length > 1 && (
        <div className="max-w-xs"><label className="field-label">Apartamento</label>
          <select name="unit_id" className="input">{p.units.map((u) => <option key={u.id} value={u.id}>{u.code}</option>)}</select></div>
      )}

      {visitors > 0 && (
        <label className="flex items-start gap-3 rounded-2xl bg-fundo p-4 text-sm text-noite-70">
          <input type="checkbox" name="accept" required className="mt-0.5 h-5 w-5 accent-violeta" />
          <span>{p.terms}</span>
        </label>
      )}

      <div className="space-y-3">
        <SubmitButton className="btn-primary w-full sm:w-auto sm:px-10" pendingText="Agendando…">
          {needsApproval ? "Enviar para aprovação" : `Agendar${start && endVal ? ` ${start}–${endVal}` : ""}`}
        </SubmitButton>
        <p className="text-xs text-noite-50">Programação organizada de utilização da quadra, sujeita ao Regimento Interno. A quadra é de uso compartilhado.</p>
        <FormMessage state={state} />
      </div>
    </form>
  );
}
