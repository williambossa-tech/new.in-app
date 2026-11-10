import { parametroAction } from "@/app/actions/admin";
import { AdminTabs } from "@/components/AppShell";
import { ActionForm, SubmitButton } from "@/components/forms";
import { PageHeader } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { asUser } from "@/lib/db";
import { fmtDateTime } from "@/lib/format";

export const metadata = { title: "Parâmetros" };

const MODULES: Record<string, string> = { geral: "Geral", sorteio: "Sorteio dos salões", bmg: "Be My Guest", coworking: "Coworking" };

export default async function Parametros() {
  const me = await requireRole("admin", "sindico", "conselheiro");
  const rows = await asUser(me.id, (tx) => tx`
    select p.*, u.full_name as updated_by_name from parameters p left join users u on u.id = p.updated_by order by module, key`);
  return (
    <>
      <AdminTabs active="/admin/parametros" />
      <PageHeader eyebrow="Administração" title="Parâmetros e pendências">
        Nenhum valor é presumido: o que não foi definido aparece como <b>pendente</b> e bloqueia a operação que depende dele.
        Cada definição exige a fonte (deliberação, ata, comunicado).
      </PageHeader>
      <div className="space-y-6">
        {Object.entries(MODULES).map(([m, label]) => (
          <section key={m} className="card p-6">
            <h2 className="h2">{label}</h2>
            <ul className="mt-3 divide-y divide-linha">
              {rows.filter((r) => r.module === m).map((p) => (
                <li key={p.key} className="py-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-black">{p.label}</p>
                      {p.description && <p className="text-sm muted">{p.description}</p>}
                      {p.blocks && p.status === "pendente" && <p className="mt-1 text-xs font-bold text-[#c23a2b]">Bloqueia: {p.blocks}</p>}
                      {p.status === "definido" && (
                        <div className="mt-2 rounded-xl bg-verde-50 p-3 text-sm">
                          <p><b>Definição:</b> {p.value?.texto ?? JSON.stringify(p.value)}</p>
                          <p className="text-xs text-noite-50">Fonte: {p.source} · {p.updated_by_name} em {fmtDateTime(p.updated_at)}</p>
                        </div>
                      )}
                    </div>
                    {p.status === "pendente" ? <span className="badge-amarelo">Pendente</span> : <span className="badge-verde">Definido</span>}
                  </div>
                  {!["sorteio.ordem_saloes", "sorteio.horario_encerramento", "sorteio.horario_sorteio"].includes(p.key) ? (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-sm font-bold text-violeta-700">{p.status === "pendente" ? "Registrar definição" : "Alterar"}</summary>
                      <ActionForm action={parametroAction} className="mt-2 space-y-2">
                        <input type="hidden" name="key" value={p.key} />
                        <textarea className="input" name="value" rows={2} placeholder="Definição aprovada (texto exato)" defaultValue={p.value?.texto ?? ""} />
                        <input className="input" name="source" placeholder="Fonte (ex.: AGE de 15/11/2026, item 3)" defaultValue={p.source ?? ""} />
                        <div className="flex flex-wrap gap-2">
                          <SubmitButton className="btn-secondary btn-sm">Salvar definição</SubmitButton>
                          {p.status === "definido" && <button name="pending" value="1" className="btn-ghost btn-sm">Voltar para pendente</button>}
                        </div>
                      </ActionForm>
                    </details>
                  ) : <p className="mt-2 text-xs text-noite-50">Definido na tela do sorteio.</p>}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </>
  );
}
