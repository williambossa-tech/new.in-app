import Link from "next/link";
import { AdminTabs } from "@/components/AppShell";
import { Corujinha } from "@/components/Corujinha";
import { CampaignBadge, PageHeader, Stat } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { asUser } from "@/lib/db";

export const metadata = { title: "Administração" };

export default async function AdminHome() {
  const me = await requireRole("admin");
  const d = await asUser(me.id, async (tx) => {
    const [a] = await tx`select
      (select count(*)::int from users where status = 'pendente') + (select count(*)::int from unit_memberships m join users u on u.id = m.user_id where m.status = 'solicitado' and u.status = 'ativo') as pendentes,
      (select count(*)::int from users where status = 'ativo') as ativos,
      (select count(distinct unit_id)::int from unit_memberships where status = 'ativo') as unidades,
      (select count(*)::int from parameters where status = 'pendente') as params_pendentes`;
    const camps = await tx`select code, title, status from lottery_campaigns order by created_at desc`;
    const [v] = await tx`select ok, total from app.audit_verify()`;
    return { pendentes: a.pendentes as number, ativos: a.ativos as number, unidades: a.unidades as number, params_pendentes: a.params_pendentes as number, camps, chainOk: v.ok as boolean, events: Number(v.total) };
  });
  return (
    <>
      <AdminTabs active="/admin" />
      <PageHeader eyebrow="Administração" title="Painel" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Link href="/admin/cadastros"><Stat label="Cadastros pendentes" value={d.pendentes} hint="aguardando aprovação" /></Link>
        <Stat label="Usuários ativos" value={d.ativos} />
        <Stat label="Aptos com morador" value={`${d.unidades}/192`} />
        <Link href="/admin/parametros"><Stat label="Parâmetros pendentes" value={d.params_pendentes} hint="sem definição oficial" /></Link>
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {d.camps.map((c) => (
          <Link key={c.code} href={`/admin/sorteios/${c.code}`} className="card flex items-center gap-4 p-5 hover:ring-violeta">
            <Corujinha pose="festa" size={72} alt="" />
            <div><CampaignBadge status={c.status} /><p className="mt-1 text-lg font-black">{c.title}</p></div>
          </Link>
        ))}
        <Link href="/admin/auditoria" className="card flex items-center gap-4 p-5 hover:ring-violeta">
          <Corujinha pose="aponta" size={72} alt="" />
          <div>
            {d.chainOk ? <span className="badge-verde">Trilha íntegra</span> : <span className="badge-coral">Trilha com divergência</span>}
            <p className="mt-1 text-lg font-black">Auditoria</p>
            <p className="text-sm muted">{d.events} eventos registrados e encadeados</p>
          </div>
        </Link>
      </div>
    </>
  );
}
