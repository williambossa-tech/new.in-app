"use client";

import { useActionState, useState } from "react";
import { salvarConvidadosAction } from "@/app/actions/piscina";
import { Corujinha } from "@/components/Corujinha";
import { FormMessage, SubmitButton } from "@/components/forms";

type G = { id?: string; name: string; document: string; minor: boolean };
type Props = {
  today: string; initialDate: string; docMode: "nao_solicitar" | "opcional" | "obrigatorio"; limiteDiario: number | null; terms: string;
  units: { id: string; code: string }[]; existing: (G & { id: string; date: string })[];
};

export function PoolForm(p: Props) {
  const [state, action] = useActionState(salvarConvidadosAction, {});
  const [date, setDate] = useState(p.initialDate);
  const fromDb = (d: string) => p.existing.filter((e) => e.date === d).map(({ id, name, document, minor }) => ({ id, name, document, minor }));
  const [guests, setGuests] = useState<G[]>(() => { const e = fromDb(p.initialDate); return e.length ? e : [{ name: "", document: "", minor: false }]; });
  const set = (i: number, k: keyof G, v: string | boolean) => setGuests((gs) => gs.map((g, j) => (j === i ? { ...g, [k]: v } : g)));
  const newCount = guests.filter((g) => !g.id && g.name.trim()).length;
  const canAdd = !p.limiteDiario || guests.length < p.limiteDiario;

  if (state.ok) {
    return (
      <div className="card flex flex-col items-center px-8 py-12 text-center">
        <div className="check-pop grid h-16 w-16 place-items-center rounded-full bg-verde text-3xl text-white">✓</div>
        <h2 className="h1 mt-5">Convidados cadastrados</h2>
        <p className="mt-2 max-w-sm text-noite-70">{date.split("-").reverse().join("/")} · lembre-se: até 2 convidados por vez, sempre com você.</p>
        <Corujinha pose="festa" size={110} className="owl-bob mt-6" alt="" />
        <a href="/piscina#meus" className="btn-secondary btn-sm mt-6">Ver meus cadastros</a>
      </div>
    );
  }

  return (
    <form action={action} id="cadastro" className="card scroll-mt-24 space-y-6 p-5 sm:p-7">
      <input type="hidden" name="date" value={date} />
      <input type="hidden" name="guests" value={JSON.stringify(guests)} />
      {p.units.length === 1 && <input type="hidden" name="unit_id" value={p.units[0].id} />}
      <h2 className="h2">Cadastrar convidados</h2>

      <div className="grid gap-4 sm:grid-cols-[220px_1fr] sm:items-end">
        <div><label className="field-label" htmlFor="pdate">Data prevista</label>
          <input id="pdate" type="date" className="input" min={p.today} value={date} required
            onChange={(e) => { setDate(e.target.value); const ex = fromDb(e.target.value); setGuests(ex.length ? ex : [{ name: "", document: "", minor: false }]); }} /></div>
        {p.units.length > 1 && (
          <div className="max-w-xs"><label className="field-label">Apartamento</label>
            <select name="unit_id" className="input">{p.units.map((u) => <option key={u.id} value={u.id}>{u.code}</option>)}</select></div>
        )}
      </div>

      <div className="space-y-4">
        {guests.map((g, i) => (
          <div key={g.id ?? `n${i}`} className="rounded-2xl bg-fundo p-4">
            <div className={`grid gap-3 ${p.docMode !== "nao_solicitar" ? "sm:grid-cols-[1.4fr_1fr]" : ""}`}>
              <div><label className="field-label">Convidado {i + 1}{g.id ? " · já cadastrado" : ""}</label>
                <input className="input bg-white" placeholder="Nome completo" value={g.name} onChange={(e) => set(i, "name", e.target.value)} maxLength={120} /></div>
              {p.docMode !== "nao_solicitar" && (
                <div><label className="field-label">Documento{p.docMode === "opcional" ? " (opcional)" : ""}</label>
                  <input className="input bg-white" placeholder="RG ou CPF" value={g.document} onChange={(e) => set(i, "document", e.target.value)} maxLength={30} /></div>
              )}
            </div>
            <div className="mt-3 flex items-center justify-between gap-3">
              <label className="flex items-center gap-2 text-sm text-noite-70">
                <input type="checkbox" className="h-5 w-5 accent-violeta" checked={g.minor} onChange={(e) => set(i, "minor", e.target.checked)} /> Menor de idade
              </label>
              {!g.id && guests.length > 1 && <button type="button" className="text-sm text-noite-50 hover:text-[#c23a2b]" onClick={() => setGuests((gs) => gs.filter((_, j) => j !== i))}>Remover</button>}
            </div>
            {g.minor && <p className="mt-2 text-xs text-noite-50">Menores só ficam na piscina acompanhados do responsável que você indicar.</p>}
          </div>
        ))}
        {canAdd && <button type="button" className="text-sm font-medium text-violeta-700" onClick={() => setGuests((gs) => [...gs, { name: "", document: "", minor: false }])}>+ Adicionar convidado</button>}
        {p.limiteDiario && <p className="text-xs text-noite-50">Configuração da administração: até {p.limiteDiario} convidados cadastrados por dia.</p>}
      </div>

      <label className="flex items-start gap-3 rounded-2xl bg-turquesa-50 p-4 text-sm text-noite-70 ring-1 ring-turquesa/30">
        <input type="checkbox" name="accept" required className="mt-0.5 h-5 w-5 shrink-0 accent-violeta" />
        <span>{p.terms}</span>
      </label>

      <div className="space-y-3">
        <SubmitButton className="btn-primary w-full sm:w-auto sm:px-10" pendingText="Salvando…">
          {guests.some((g) => g.id) ? "Salvar alterações" : `Cadastrar${newCount ? ` ${newCount} ${newCount === 1 ? "convidado" : "convidados"}` : ""}`}
        </SubmitButton>
        <FormMessage state={state} />
      </div>
    </form>
  );
}
