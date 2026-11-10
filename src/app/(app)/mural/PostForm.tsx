"use client";
import { useActionState, useState } from "react";
import { FormMessage, SubmitButton } from "@/components/forms";
import type { ActionState } from "@/lib/action";

type Opt = [string, string];
export function PostForm({ action, asOptions, categories, initial, submitLabel }: {
  action: (s: ActionState, f: FormData) => Promise<ActionState>;
  asOptions?: Opt[]; categories: Opt[]; submitLabel: string;
  initial?: { id: string; category: string; title: string; body: string; pinned: boolean; expiresOn: string; attachmentName: string | null };
}) {
  const [state, act] = useActionState(action, {});
  const [body, setBody] = useState(initial?.body ?? "");
  return (
    <form action={act} className="card space-y-5 p-6 sm:p-8">
      {initial && <input type="hidden" name="id" value={initial.id} />}
      {asOptions && (
        <div><p className="field-label">Publicar como</p>
          <div className="flex flex-wrap gap-2">
            {asOptions.map(([k, l], i) => (
              <label key={k} className="flex cursor-pointer items-center gap-2 rounded-full bg-fundo px-4 py-2 text-sm font-medium has-[:checked]:bg-violeta has-[:checked]:text-white">
                <input type="radio" name="as" value={k} defaultChecked={i === 0} className="sr-only" /> {l}
              </label>
            ))}
          </div></div>
      )}
      <div className="grid gap-4 sm:grid-cols-[1fr_220px]">
        <div><label className="field-label" htmlFor="title">Título</label><input id="title" name="title" className="input" maxLength={140} required defaultValue={initial?.title} /></div>
        <div><label className="field-label" htmlFor="category">Categoria</label>
          <select id="category" name="category" className="input" defaultValue={initial?.category ?? "comunicado"}>{categories.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
      </div>
      <div><label className="field-label" htmlFor="body">Texto</label>
        <textarea id="body" name="body" rows={9} className="input" maxLength={8000} required value={body} onChange={(e) => setBody(e.target.value)} />
        <p className="field-hint">Dica: use **negrito**, e listas começando a linha com “- ”. {body.length}/8000</p></div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div><label className="field-label" htmlFor="expires_on">Mostrar até (opcional)</label><input id="expires_on" name="expires_on" type="date" className="input" defaultValue={initial?.expiresOn} /></div>
        <div><label className="field-label" htmlFor="attachment">Anexo (PDF ou imagem, até 5 MB)</label>
          <input id="attachment" name="attachment" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" className="input py-2.5" />
          {initial?.attachmentName && <label className="mt-2 flex items-center gap-2 text-sm text-noite-70"><input type="checkbox" name="remove_attachment" className="accent-coral" /> Remover anexo atual ({initial.attachmentName})</label>}</div>
      </div>
      <div className="flex flex-wrap gap-x-6 gap-y-2">
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="pinned" defaultChecked={initial?.pinned} className="h-5 w-5 accent-violeta" /> Fixar no topo do mural</label>
        {!initial && <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="notify" defaultChecked className="h-5 w-5 accent-violeta" /> Avisar todos no sino 🔔</label>}
      </div>
      <SubmitButton pendingText="Publicando…">{submitLabel}</SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}
