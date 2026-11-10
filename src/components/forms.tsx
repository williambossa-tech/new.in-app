"use client";

import { createContext, useActionState, useContext, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import type { ActionState } from "@/lib/action";

/** Somente visualização (síndico e conselheiros): botões de ação ficam desativados. */
const ReadOnly = createContext(false);
export function ReadOnlyProvider({ value, children }: { value: boolean; children: React.ReactNode }) {
  return <ReadOnly.Provider value={value}>{children}</ReadOnly.Provider>;
}
export const useReadOnly = () => useContext(ReadOnly);

export function SubmitButton({ children, className = "btn-primary", pendingText = "Aguarde…", confirm }: { children: React.ReactNode; className?: string; pendingText?: string; confirm?: string }) {
  const { pending } = useFormStatus();
  const ro = useReadOnly();
  return (
    <button
      type="submit"
      className={`${className} ${ro ? "cursor-not-allowed opacity-45" : ""}`}
      disabled={pending || ro}
      title={ro ? "Somente visualização" : undefined}
      onClick={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
    >
      {pending ? pendingText : children}
    </button>
  );
}

export function FormMessage({ state }: { state: ActionState }) {
  if (!state.message) return null;
  return (
    <div role={state.ok ? "status" : "alert"}
      className={`rounded-2xl px-4 py-3 text-[0.97rem] ring-1 ${state.ok ? "bg-turquesa-50 text-[#0b6158] ring-[#bfeee8]" : "bg-coral-50 text-[#9e2c1f] ring-[#ffd0ca]"}`}>
      {state.message}
    </div>
  );
}

export function FieldError({ state, name }: { state: ActionState; name: string }) {
  const m = state.fieldErrors?.[name];
  return m ? <p className="mt-1 text-sm font-bold text-[#c23a2b]">{m}</p> : null;
}

/** Formulário ligado a uma server action, com mensagem de retorno. */
export function ActionForm({
  action, children, className = "space-y-4", resetOnSuccess = false,
}: {
  action: (s: ActionState, f: FormData) => Promise<ActionState>;
  children: React.ReactNode | ((state: ActionState) => React.ReactNode);
  className?: string;
  resetOnSuccess?: boolean;
}) {
  const [state, formAction] = useActionState(action, {});
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok && resetOnSuccess) ref.current?.reset();
  }, [state, resetOnSuccess]);
  const ro = useReadOnly();
  return (
    <form ref={ref} action={formAction} className={className}>
      <fieldset disabled={ro} className="contents">{typeof children === "function" ? children(state) : children}</fieldset>
      <FormMessage state={state} />
    </form>
  );
}
