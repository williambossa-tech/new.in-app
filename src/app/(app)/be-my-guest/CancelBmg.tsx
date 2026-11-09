"use client";
import { useActionState, useState } from "react";
import { cancelarBmgAction } from "@/app/actions/bmg";
import { FormMessage, SubmitButton } from "@/components/forms";
import { SadOwl } from "@/components/SadOwl";

export function CancelBmg({ id }: { id: string }) {
  const [state, action] = useActionState(cancelarBmgAction, {});
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="btn-ghost btn-sm px-0 text-noite-50 hover:text-[#c23a2b]">
        Cancelar reserva
      </button>
    );
  }
  return (
    <form action={action} className="w-full rounded-2xl bg-fundo p-5 ring-1 ring-linha">
      <input type="hidden" name="booking_id" value={id} />
      <div className="flex items-center gap-4">
        <SadOwl size={96} />
        <div>
          <p className="font-semibold">Que pena! Quer mesmo cancelar?</p>
          <p className="text-sm text-noite-70">A suíte fica livre para outros moradores.</p>
        </div>
      </div>
      <label className="field-label mt-4" htmlFor={`reason-${id}`}>Motivo do cancelamento</label>
      <textarea id={`reason-${id}`} name="reason" rows={2} className="input" placeholder="Ex.: mudança de planos dos convidados" required minLength={5} />
      <div className="mt-4 flex flex-wrap gap-3">
        <SubmitButton className="btn-danger btn-sm" pendingText="Cancelando…">Confirmar cancelamento</SubmitButton>
        <button type="button" className="btn-secondary btn-sm" onClick={() => setOpen(false)}>Manter reserva</button>
      </div>
      <div className="mt-3"><FormMessage state={state} /></div>
    </form>
  );
}
