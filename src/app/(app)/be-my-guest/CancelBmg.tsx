"use client";
import { useActionState } from "react";
import { cancelarBmgAction } from "@/app/actions/bmg";
import { FormMessage, SubmitButton } from "@/components/forms";

export function CancelBmg({ id }: { id: string }) {
  const [state, action] = useActionState(cancelarBmgAction, {});
  return (
    <form action={action}>
      <input type="hidden" name="booking_id" value={id} />
      <SubmitButton className="btn-ghost btn-sm px-0 text-noite-50 hover:text-[#c23a2b]" pendingText="Cancelando…" confirm="Cancelar esta reserva?">
        Cancelar reserva
      </SubmitButton>
      {!state.ok && <FormMessage state={state} />}
    </form>
  );
}
