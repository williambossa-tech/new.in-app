import { redirect } from "next/navigation";
import { Corujinha } from "@/components/Corujinha";
import { getSessionUser } from "@/lib/auth";

export const metadata = { title: "Cadastro em análise" };

export default async function Aguardando() {
  const me = await getSessionUser();
  if (!me) redirect("/entrar");
  if (me.status === "ativo") redirect("/");
  return (
    <div className="text-center">
      <Corujinha pose="descanso" size={120} className="mx-auto" alt="" />
      <h1 className="h2 mt-3">Cadastro em análise</h1>
      <p className="mt-2 muted">
        Olá, {me.fullName.split(" ")[0]}! Recebemos seu cadastro
        {me.pendingUnits.length ? <> para o apartamento <b>{me.pendingUnits.map((u) => u.code).join(", ")}</b></> : null}.
        A administração vai conferir e aprovar o vínculo. Volte mais tarde ou aguarde o aviso da administração.
      </p>
      <form action="/sair" method="post" className="mt-6">
        <button className="btn-secondary w-full">Sair</button>
      </form>
    </div>
  );
}
