"use client";
import { useActionState, useState } from "react";
import type { ActionState } from "@/lib/action";
import { FormMessage, SubmitButton, useReadOnly } from "./forms";
import { SadOwl } from "./SadOwl";

export function CancelWithReason({ id, action, label = "Cancelar reserva", hint = "O espaço fica livre para outros moradores." }: {
  id: string; action: (s: ActionState, f: FormData) => Promise<ActionState>; label?: string; hint?: string;
}) {
  const [state, act] = useActionState(action, {});
  const [open, setOpen] = useState(false);
  const ro = useReadOnly();
  if (ro) return null;
  if (!open) return <button type="button" onClick={() => setOpen(true)} className="btn-ghost btn-sm px-0 text-noite-50 hover:text-[#c23a2b]">{label}</button>;
  return (
    <form action={act} className="w-full rounded-2xl bg-fundo p-5 ring-1 ring-linha">
      <input type="hidden" name="booking_id" value={id} />
      <div className="flex items-center gap-4">
        <SadOwl size={96} />
        <div><p className="font-semibold">Que pena! Quer mesmo cancelar?</p><p className="text-sm text-noite-70">{hint}</p></div>
      </div>
      <label className="field-label mt-4" htmlFor={`r-${id}`}>Motivo do cancelamento</label>
      <textarea id={`r-${id}`} name="reason" rows={2} className="input" placeholder="Ex.: mudança de planos" required minLength={5} />
      <div className="mt-4 flex flex-wrap gap-3">
        <SubmitButton className="btn-danger btn-sm" pendingText="Cancelando…">Confirmar cancelamento</SubmitButton>
        <button type="button" className="btn-secondary btn-sm" onClick={() => setOpen(false)}>Manter reserva</button>
      </div>
      <div className="mt-3"><FormMessage state={state} /></div>
    </form>
  );
}
