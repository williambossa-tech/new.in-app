"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { ActionState } from "@/lib/action";
import { audit } from "@/lib/audit";
import {
  createSession, getSessionUser, hashPassword, loginFailed, loginOk, loginThrottle, passwordProblem, verifyPassword,
} from "@/lib/auth";
import { asSystem, friendlyDbError } from "@/lib/db";

export async function loginAction(_: ActionState, f: FormData): Promise<ActionState> {
  const email = String(f.get("email") ?? "").trim().toLowerCase();
  const password = String(f.get("password") ?? "");
  if (!email || !password) return { message: "Informe e-mail e senha." };
  const t = loginThrottle(email);
  if (t) return { message: t };
  const user = await asSystem(async (tx) => {
    const [u] = await tx`select id, full_name, status, password_hash, must_change_password from users where lower(email) = ${email}`;
    return u;
  });
  if (!user || !(await verifyPassword(password, user.password_hash))) {
    loginFailed(email);
    return { message: "E-mail ou senha incorretos." };
  }
  if (user.status === "recusado") return { message: "Seu cadastro não foi aprovado. Procure a administração do condomínio." };
  if (user.status === "bloqueado") return { message: "Seu acesso está bloqueado. Procure a administração do condomínio." };
  loginOk(email);
  const ua = (await headers()).get("user-agent");
  await createSession(user.id, ua);
  await asSystem(async (tx) => {
    await audit(tx, { actorId: user.id, actorLabel: user.full_name, action: "auth.login", entity: "user", entityId: user.id });
  });
  if (user.must_change_password) redirect("/trocar-senha");
  if (user.status === "pendente") redirect("/aguardando");
  const next = String(f.get("next") ?? "/");
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/");
}

const signupSchema = z.object({
  full_name: z.string().trim().min(5, "Informe o nome completo.").max(120),
  email: z.string().trim().toLowerCase().email("E-mail inválido."),
  phone: z.string().trim().min(8, "Informe um telefone com DDD.").max(30),
  unit: z.string().trim().regex(/^\d{3,4}$/, "Informe só o número do apartamento (ex.: 1204)."),
  relation: z.enum(["proprietario", "locatario", "morador_autorizado"], { message: "Selecione o vínculo com a unidade." }),
  resides: z.enum(["sim", "nao"], { message: "Informe se reside na unidade." }),
  password: z.string(),
  password2: z.string(),
  lgpd: z.literal("on", { message: "É preciso concordar com o uso dos dados para o cadastro." }),
});

export async function signupAction(_: ActionState, f: FormData): Promise<ActionState> {
  const parsed = signupSchema.safeParse(Object.fromEntries(f));
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of parsed.error.issues) fieldErrors[String(i.path[0])] ??= i.message;
    return { message: "Confira os campos destacados.", fieldErrors };
  }
  const d = parsed.data;
  const pw = passwordProblem(d.password);
  if (pw) return { message: pw, fieldErrors: { password: pw } };
  if (d.password !== d.password2) return { message: "As senhas não conferem.", fieldErrors: { password2: "As senhas não conferem." } };
  let userId: string;
  try {
    userId = await asSystem(async (tx) => {
      const [unit] = await tx`select id from units where code = ${d.unit} and active`;
      if (!unit) throw Object.assign(new Error("Apartamento não encontrado. Confira o número (ex.: 301 a 2608)."), { code: "P0001" });
      const [u] = await tx`insert into users (email, full_name, phone, password_hash, status)
        values (${d.email}, ${d.full_name}, ${d.phone}, ${await hashPassword(d.password)}, 'pendente') returning id`;
      await tx`insert into unit_memberships (user_id, unit_id, relation, resides, status)
        values (${u.id}, ${unit.id}, ${d.relation}, ${d.resides === "sim"}, 'solicitado')`;
      await audit(tx, { actorId: u.id, actorLabel: d.full_name, action: "auth.cadastro", entity: "user", entityId: u.id,
        data: { apartamento: d.unit, vinculo: d.relation, reside: d.resides === "sim" } });
      return u.id as string;
    });
  } catch (e) {
    return { message: friendlyDbError(e) };
  }
  await createSession(userId, (await headers()).get("user-agent"));
  redirect("/aguardando");
}

export async function changePasswordAction(_: ActionState, f: FormData): Promise<ActionState> {
  const me = await getSessionUser();
  if (!me) redirect("/entrar");
  const current = String(f.get("current") ?? "");
  const next = String(f.get("password") ?? "");
  const next2 = String(f.get("password2") ?? "");
  const pw = passwordProblem(next);
  if (pw) return { message: pw };
  if (next !== next2) return { message: "As senhas novas não conferem." };
  const ok = await asSystem(async (tx) => {
    const [u] = await tx`select password_hash from users where id = ${me.id}`;
    if (!(await verifyPassword(current, u.password_hash))) return false;
    await tx`update users set password_hash = ${await hashPassword(next)}, must_change_password = false where id = ${me.id}`;
    await tx`update sessions set revoked_at = now() where user_id = ${me.id} and revoked_at is null`;
    await audit(tx, { actorId: me.id, actorLabel: me.fullName, action: "auth.troca_senha", entity: "user", entityId: me.id });
    return true;
  });
  if (!ok) return { message: "A senha atual está incorreta." };
  await createSession(me.id, (await headers()).get("user-agent"));
  redirect(me.status === "ativo" ? "/" : "/aguardando");
}
