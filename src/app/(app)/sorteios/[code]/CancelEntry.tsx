"use client";
import { useActionState } from "react";
import { cancelarInscricaoAction } from "@/app/actions/sorteio";
import { SubmitButton } from "@/components/forms";

export function CancelEntry({ id, campaign }: { id: string; campaign: string }) {
  const [state, action] = useActionState(cancelarInscricaoAction, {});
  return (
    <form action={action} className="inline">
      <input type="hidden" name="entry_id" value={id} />
      <input type="hidden" name="campaign" value={campaign} />
      <SubmitButton className="btn-ghost btn-sm text-noite-50 hover:text-[#c23a2b]" pendingText="…" confirm="Cancelar esta inscrição?">Cancelar</SubmitButton>
      {state.message && !state.ok && <span className="ml-2 text-sm text-[#c23a2b]">{state.message}</span>}
    </form>
  );
}
