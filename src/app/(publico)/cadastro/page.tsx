"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signupAction } from "@/app/actions/auth";
import { FieldError, FormMessage, SubmitButton } from "@/components/forms";

export default function Cadastro() {
  const [state, action] = useActionState(signupAction, {});
  return (
    <>
      <h1 className="h2">Criar cadastro</h1>
      <p className="mb-5 mt-1 muted">
        Depois de enviar, a administração confere seus dados e aprova o vínculo com o apartamento.
        Até lá, você não consegue fazer reservas nem inscrições.
      </p>
      <form action={action} className="space-y-4">
        <div>
          <label className="field-label" htmlFor="full_name">Nome completo</label>
          <input className="input" id="full_name" name="full_name" autoComplete="name" required />
          <FieldError state={state} name="full_name" />
        </div>
        <div>
          <label className="field-label" htmlFor="email">E-mail</label>
          <input className="input" id="email" name="email" type="email" autoComplete="email" required />
          <FieldError state={state} name="email" />
        </div>
        <div>
          <label className="field-label" htmlFor="phone">Telefone (com DDD)</label>
          <input className="input" id="phone" name="phone" type="tel" autoComplete="tel" placeholder="(41) 9 9999-9999" required />
          <FieldError state={state} name="phone" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="field-label" htmlFor="unit">Apartamento</label>
            <input className="input" id="unit" name="unit" inputMode="numeric" placeholder="ex.: 1204" required />
            <FieldError state={state} name="unit" />
          </div>
          <div>
            <label className="field-label" htmlFor="relation">Vínculo</label>
            <select className="input" id="relation" name="relation" required defaultValue="">
              <option value="" disabled>Selecione</option>
              <option value="proprietario">Proprietário(a)</option>
              <option value="locatario">Locatário(a)</option>
              <option value="morador_autorizado">Morador(a) autorizado(a)</option>
            </select>
            <FieldError state={state} name="relation" />
          </div>
        </div>
        <fieldset>
          <legend className="field-label">Você mora nesse apartamento?</legend>
          <div className="flex gap-3">
            {[["sim", "Sim, moro"], ["nao", "Não moro"]].map(([v, l]) => (
              <label key={v} className="flex flex-1 cursor-pointer items-center gap-2 rounded-2xl border border-linha px-4 py-3 font-bold has-[:checked]:border-violeta has-[:checked]:bg-violeta-50">
                <input type="radio" name="resides" value={v} required className="accent-violeta" /> {l}
              </label>
            ))}
          </div>
          <FieldError state={state} name="resides" />
        </fieldset>
        <div>
          <label className="field-label" htmlFor="password">Senha</label>
          <input className="input" id="password" name="password" type="password" autoComplete="new-password" required />
          <p className="field-hint">Mínimo de 8 caracteres, com letras e números.</p>
          <FieldError state={state} name="password" />
        </div>
        <div>
          <label className="field-label" htmlFor="password2">Repita a senha</label>
          <input className="input" id="password2" name="password2" type="password" autoComplete="new-password" required />
          <FieldError state={state} name="password2" />
        </div>
        <label className="flex items-start gap-3 text-sm">
          <input type="checkbox" name="lgpd" className="mt-1 h-5 w-5 accent-violeta" required />
          <span>Concordo que meus dados sejam usados pela administração do condomínio somente para cadastro, reservas e sorteios.</span>
        </label>
        <FieldError state={state} name="lgpd" />
        <SubmitButton className="btn-primary w-full">Enviar cadastro</SubmitButton>
        <FormMessage state={state} />
      </form>
      <p className="mt-5 text-center text-sm"><Link className="font-bold text-violeta-700 hover:underline" href="/entrar">Já tenho cadastro</Link></p>
    </>
  );
}
