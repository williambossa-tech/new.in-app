import { AdminTabs } from "@/components/AppShell";
import { PageHeader } from "@/components/ui";
import { ACTION_LABELS } from "@/lib/audit";
import { requireRole } from "@/lib/auth";
import { asUser } from "@/lib/db";
import { fmtDateTimeSec, shortHash } from "@/lib/format";

export const metadata = { title: "Auditoria" };

export default async function Auditoria({ searchParams }: { searchParams: Promise<{ tipo?: string }> }) {
  const me = await requireRole("admin", "sindico", "conselheiro");
  const { tipo = "" } = await searchParams;
  const d = await asUser(me.id, async (tx) => {
    const [v] = await tx`select * from app.audit_verify()`;
    const rows = await tx`select * from audit_log where (${tipo} = '' or action like ${tipo + "%"}) order by id desc limit 300`;
    return { v, rows };
  });
  return (
    <>
      <AdminTabs active="/admin/auditoria" />
      <PageHeader eyebrow="Administração" title="Trilha de auditoria">
        Cada evento guarda a impressão digital do anterior. Qualquer alteração ou exclusão feita fora do sistema quebra a corrente e aparece aqui.
      </PageHeader>
      <div className={`card mb-6 p-5 ${d.v.ok ? "" : "ring-2 ring-coral"}`}>
        <p className="text-lg font-black">{d.v.ok ? "✓ Corrente íntegra" : `✗ Corrente quebrada a partir do evento #${d.v.first_broken}`}</p>
        <p className="text-sm muted">{Number(d.v.total)} eventos · último hash <span className="mono">{d.v.head_hash}</span></p>
        <div className="mt-3 flex flex-wrap gap-2">
          {[["", "Todos"], ["sorteio.", "Sorteio"], ["admin.", "Administração"], ["auth.", "Acessos"]].map(([k, l]) => (
            <a key={k} href={`?tipo=${k}`} className={`rounded-full px-3 py-1.5 text-sm font-bold ring-1 ${tipo === k ? "bg-noite text-white ring-noite" : "ring-linha"}`}>{l}</a>
          ))}
          <a href={`/api/admin/auditoria`} className="btn-secondary btn-sm ml-auto">Exportar CSV completo</a>
        </div>
      </div>
      <div className="card p-2 sm:p-4">
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr><th>#</th><th>Quando</th><th>Quem</th><th>Evento</th><th>Detalhes</th><th>Hash</th></tr></thead>
            <tbody>
              {d.rows.map((r) => (
                <tr key={r.id}>
                  <td className="text-noite-50">{r.id}</td>
                  <td className="whitespace-nowrap">{fmtDateTimeSec(r.at)}</td>
                  <td>{r.actor_label}</td>
                  <td className="font-bold">{ACTION_LABELS[r.action] ?? r.action}<div className="text-xs font-normal text-noite-50">{r.entity} {r.entity_id ?? ""}</div></td>
                  <td className="max-w-[420px]"><code className="block whitespace-pre-wrap break-words text-xs text-noite-70">{JSON.stringify(r.data)}</code></td>
                  <td className="mono text-noite-50">{shortHash(r.hash, 8)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
