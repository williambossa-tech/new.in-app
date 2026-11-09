"use client";
import { useActionState } from "react";
import { desistirAction } from "@/app/actions/sorteio";
import { FormMessage, SubmitButton } from "@/components/forms";

export function Desistir({ campaign, stageId, unit }: { campaign: string; stageId: string; unit: string }) {
  const [state, action] = useActionState(desistirAction, {});
  if (state.ok) return <FormMessage state={state} />;
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="campaign" value={campaign} />
      <input type="hidden" name="stage_id" value={stageId} />
      <input type="hidden" name="unit" value={unit} />
      <SubmitButton className="btn-ghost btn-sm px-0 text-noite-50 hover:text-[#c23a2b]" pendingText="Registrando…"
        confirm="Desistir desta reserva? Um novo sorteio será feito entre os demais inscritos e a desistência não pode ser desfeita.">
        Desistir da reserva
      </SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}
