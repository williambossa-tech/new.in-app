"use client";

import { useActionState, useState } from "react";
import { inscreverAction } from "@/app/actions/sorteio";
import { FieldError, FormMessage, SubmitButton } from "@/components/forms";
import { SimpleMarkdown } from "@/components/ui";

type Opt = { id: string; code: string; label: string };
export function InscricaoForm(props: {
  campaign: string;
  units: { id: string; code: string }[];
  periods: Opt[];
  venues: (Opt & { capacity: number | null })[];
  taken: Record<string, string[]>; // unitId → "period|space" já inscritos
  defaultName: string;
  defaultContact: string;
  termsMd: string;
  termsVersion: number;
}) {
  const [state, action] = useActionState(inscreverAction, {});
  const [unitId, setUnitId] = useState(props.units[0]?.id ?? "");
  const taken = new Set(props.taken[unitId] ?? []);
  return (
    <form action={action} className="space-y-7">
      <input type="hidden" name="campaign" value={props.campaign} />
      <div className="grid gap-5 sm:grid-cols-3">
        <div>
          <label className="field-label" htmlFor="unit_id">Apartamento</label>
          <select className="input" id="unit_id" name="unit_id" value={unitId} onChange={(e) => setUnitId(e.target.value)}>
            {props.units.map((u) => <option key={u.id} value={u.id}>{u.code}</option>)}
          </select>
          <FieldError state={state} name="unit_id" />
        </div>
        <div>
          <label className="field-label" htmlFor="applicant_name">Nome completo</label>
          <input className="input" id="applicant_name" name="applicant_name" defaultValue={props.defaultName} required />
          <FieldError state={state} name="applicant_name" />
        </div>
        <div>
          <label className="field-label" htmlFor="contact">Contato</label>
          <input className="input" id="contact" name="contact" defaultValue={props.defaultContact} placeholder="Telefone ou e-mail" required />
          <FieldError state={state} name="contact" />
        </div>
      </div>

      <fieldset>
        <legend className="field-label">Salões de interesse</legend>
        <div className="grid gap-4 md:grid-cols-2">
          {props.periods.map((p) => (
            <div key={p.id} className="rounded-2xl bg-fundo p-5">
              <p className="font-semibold">{p.code === "natal" ? "Natal" : "Ano Novo"}</p>
              <p className="mb-4 text-sm text-noite-50">{p.label.split(" — ")[1]}</p>
              <div className="space-y-2">
                {props.venues.map((v) => {
                  const k = `${p.id}|${v.id}`;
                  const done = taken.has(k);
                  return (
                    <label key={k} className={`flex items-center gap-3 rounded-xl bg-white px-4 py-3.5 ring-1 ${done ? "ring-[#bfeee8]" : "cursor-pointer ring-linha has-[:checked]:ring-2 has-[:checked]:ring-violeta"}`}>
                      <input type="checkbox" name="combo" value={k} disabled={done} defaultChecked={false} className="h-5 w-5 accent-violeta" />
                      <span className="flex-1 font-medium">{v.label}</span>
                      {done ? <span className="text-sm font-medium text-[#0e7f74]">Inscrito ✓</span> : v.capacity ? <span className="text-xs text-noite-50">{v.capacity} pessoas</span> : null}
                    </label>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        <FieldError state={state} name="combo" />
      </fieldset>

      <div>
        <details className="group">
          <summary className="cursor-pointer list-none text-sm font-medium text-violeta-700">Termo de participação ›</summary>
          <SimpleMarkdown text={props.termsMd} className="mt-3 rounded-2xl bg-fundo p-5 text-[0.93rem] text-noite-70" />
        </details>
        <label className="mt-4 flex items-start gap-3">
          <input type="checkbox" name="accept" className="mt-1 h-5 w-5 accent-violeta" />
          <span>Li e aceito as regras e o termo de participação.</span>
        </label>
        <FieldError state={state} name="accept" />
      </div>

      <SubmitButton className="btn-primary w-full sm:w-auto sm:px-10" pendingText="Enviando…">Confirmar inscrição</SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}
