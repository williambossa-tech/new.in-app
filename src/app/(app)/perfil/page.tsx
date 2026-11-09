import { PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { RELATION_LABEL, ROLE_LABEL } from "@/lib/format";

export const metadata = { title: "Meu cadastro" };

export default async function Perfil() {
  const me = await requireUser();
  return (
    <>
      <PageHeader eyebrow="Conta" title="Meu cadastro">Para alterar apartamento ou vínculo, fale com a administração.</PageHeader>
      <div className="card space-y-4 p-6">
        <Row label="Nome">{me.fullName}</Row>
        <Row label="E-mail">{me.email}</Row>
        <Row label="Telefone">{me.phone ?? "—"}</Row>
        <Row label="Perfis">{me.roles.map((r) => ROLE_LABEL[r]).join(", ") || "—"}</Row>
        <Row label="Apartamentos">
          {me.units.length ? me.units.map((u) => (
            <div key={u.id}>Apto <b>{u.code}</b> · {RELATION_LABEL[u.relation]} · {u.resides ? "reside" : "não reside"}</div>
          )) : "Nenhum vínculo ativo"}
          {me.pendingUnits.map((u) => <div key={u.id} className="text-sm text-noite-50">Apto {u.code} · aguardando aprovação</div>)}
        </Row>
      </div>
    </>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1 sm:grid-cols-[160px_1fr]">
      <p className="text-sm font-black uppercase tracking-wide text-noite-50">{label}</p>
      <div>{children}</div>
    </div>
  );
}
