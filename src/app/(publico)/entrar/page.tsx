import Link from "next/link";
import { redirect } from "next/navigation";
import { loginAction } from "@/app/actions/auth";
import { ActionForm, SubmitButton } from "@/components/forms";
import { getSessionUser } from "@/lib/auth";
import { currentEnv } from "@/lib/db";

export const metadata = { title: "Entrar" };

export default async function Entrar({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const me = await getSessionUser();
  if (me) redirect(me.status === "ativo" ? "/" : "/aguardando");
  const { next } = await searchParams;
  const demo = (await currentEnv()) === "demonstracao";
  return (
    <>
      <h1 className="h2">Entrar</h1>
      <p className="mb-5 mt-1 muted">Use o e-mail e a senha do seu cadastro.</p>
      <ActionForm action={loginAction}>
        <input type="hidden" name="next" value={next ?? "/"} />
        <div>
          <label className="field-label" htmlFor="email">E-mail</label>
          <input className="input" id="email" name="email" type="email" autoComplete="email" required />
        </div>
        <div>
          <label className="field-label" htmlFor="password">Senha</label>
          <input className="input" id="password" name="password" type="password" autoComplete="current-password" required />
        </div>
        <SubmitButton className="btn-primary w-full">Entrar</SubmitButton>
      </ActionForm>
      <div className="mt-6 border-t border-linha pt-5 text-center">
        <p className="muted">Ainda não tem cadastro?</p>
        <Link href="/cadastro" className="btn-secondary mt-2 w-full">Criar meu cadastro</Link>
        <p className="mt-4 text-sm muted">Esqueceu a senha? Peça à administração para redefini-la.</p>
      </div>
      {demo && (
        <div className="mt-6 rounded-2xl bg-amarelo-50 p-4 text-sm ring-1 ring-[#ffe39a]">
          <p className="font-black">Acessos de demonstração</p>
          <p className="mt-1">Administração: <b>admin@demo.newin</b> · Morador: <b>morador@demo.newin</b></p>
          <p>Senha de ambos: <b>demo2026</b></p>
        </div>
      )}
    </>
  );
}
