import { redirect } from "next/navigation";
import { changePasswordAction } from "@/app/actions/auth";
import { ActionForm, SubmitButton } from "@/components/forms";
import { getSessionUser } from "@/lib/auth";

export const metadata = { title: "Trocar senha" };

export default async function TrocarSenha() {
  const me = await getSessionUser();
  if (!me) redirect("/entrar");
  return (
    <>
      <h1 className="h2">Trocar senha</h1>
      {me.mustChangePassword && <p className="mt-1 muted">Por segurança, defina uma senha pessoal antes de continuar.</p>}
      <ActionForm action={changePasswordAction} className="mt-5 space-y-4">
        <div>
          <label className="field-label" htmlFor="current">Senha atual {me.mustChangePassword && "(a provisória que você recebeu)"}</label>
          <input className="input" id="current" name="current" type="password" autoComplete="current-password" required />
        </div>
        <div>
          <label className="field-label" htmlFor="password">Nova senha</label>
          <input className="input" id="password" name="password" type="password" autoComplete="new-password" required />
          <p className="field-hint">Mínimo de 8 caracteres, com letras e números.</p>
        </div>
        <div>
          <label className="field-label" htmlFor="password2">Repita a nova senha</label>
          <input className="input" id="password2" name="password2" type="password" autoComplete="new-password" required />
        </div>
        <SubmitButton className="btn-primary w-full">Salvar nova senha</SubmitButton>
      </ActionForm>
    </>
  );
}
