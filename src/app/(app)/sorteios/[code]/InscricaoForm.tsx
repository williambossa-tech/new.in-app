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
    <form action={action} className="space-y-5">
      <input type="hidden" name="campaign" value={props.campaign} />
      <div className="grid gap-4 sm:grid-cols-3">
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
        <legend className="field-label">Marque os salões e períodos de interesse</legend>
        <p className="field-hint -mt-1 mb-3">Pode marcar todos. Se o apartamento ganhar um salão em um período, ele sai dos outros sorteios daquele período.</p>
        <div className="grid gap-4 md:grid-cols-2">
          {props.periods.map((p) => (
            <div key={p.id} className="rounded-2xl border border-linha p-4">
              <p className="mb-3 font-black">{p.label}</p>
              <div className="space-y-2">
                {props.venues.map((v) => {
                  const k = `${p.id}|${v.id}`;
                  const done = taken.has(k);
                  return (
                    <label key={k} className={`flex items-center gap-3 rounded-xl px-3 py-3 ring-1 ${done ? "bg-turquesa-50 ring-[#bfeee8]" : "cursor-pointer ring-linha has-[:checked]:bg-violeta-50 has-[:checked]:ring-violeta"}`}>
                      <input type="checkbox" name="combo" value={k} disabled={done} defaultChecked={false} className="h-5 w-5 accent-violeta" />
                      <span className="flex-1 font-bold">{v.label}</span>
                      {done ? <span className="badge-turquesa">✓ inscrito</span> : v.capacity ? <span className="text-xs text-noite-50">até {v.capacity} pessoas</span> : null}
                    </label>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        <FieldError state={state} name="combo" />
      </fieldset>

      <div className="rounded-2xl bg-fundo p-4 ring-1 ring-linha">
        <p className="font-black">Termo de participação (versão {props.termsVersion})</p>
        <SimpleMarkdown text={props.termsMd} className="mt-1 text-[0.95rem] text-noite-70" />
        <label className="mt-3 flex items-start gap-3 font-bold">
          <input type="checkbox" name="accept" className="mt-0.5 h-5 w-5 accent-violeta" />
          Li e aceito as regras do sorteio e o termo acima.
        </label>
        <FieldError state={state} name="accept" />
      </div>

      <SubmitButton className="btn-primary w-full sm:w-auto" pendingText="Registrando…">Confirmar inscrição</SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}
