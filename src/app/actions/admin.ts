"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/lib/action";
import { audit } from "@/lib/audit";
import { hashPassword, requireRole, tempPassword, type Role } from "@/lib/auth";
import { asSystem, asUser, friendlyDbError } from "@/lib/db";

const fail = (message: string): ActionState => ({ ok: false, message });
const rule = (m: string) => Object.assign(new Error(m), { code: "P0001" });

export async function aprovarCadastroAction(_: ActionState, f: FormData): Promise<ActionState> {
  const me = await requireRole("admin");
  const userId = String(f.get("user_id"));
  const membershipId = String(f.get("membership_id") ?? "");
  try {
    await asUser(me.id, async (tx) => {
      const [u] = await tx`update users set status = 'ativo', decided_at = now(), decided_by = ${me.id}
                           where id = ${userId} and status in ('pendente', 'ativo') returning full_name`;
      if (!u) throw rule("Cadastro não encontrado ou já decidido.");
      let unit: string | null = null;
      if (membershipId) {
        const [m] = await tx`update unit_memberships set status = 'ativo', decided_at = now(), decided_by = ${me.id}
                             where id = ${membershipId} and user_id = ${userId} and status = 'solicitado'
                             returning (select code from units where id = unit_id) as code`;
        unit = m?.code ?? null;
      }
      await tx`insert into user_roles (user_id, role, granted_by) values (${userId}, 'morador', ${me.id}) on conflict do nothing`;
      await audit(tx, { actorId: me.id, actorLabel: me.fullName, action: "admin.aprovar_cadastro", entity: "user", entityId: userId,
        data: { nome: u.full_name, apartamento: unit } });
    });
    revalidatePath("/admin/cadastros");
    return { ok: true, message: "Cadastro aprovado." };
  } catch (e) { return fail(friendlyDbError(e)); }
}

export async function recusarCadastroAction(_: ActionState, f: FormData): Promise<ActionState> {
  const me = await requireRole("admin");
  const userId = String(f.get("user_id"));
  const membershipId = String(f.get("membership_id") ?? "");
  const note = String(f.get("note") ?? "").trim();
  if (note.length < 5) return fail("Informe o motivo da recusa.");
  try {
    await asUser(me.id, async (tx) => {
      const [u] = await tx`select status, full_name from users where id = ${userId}`;
      if (!u) throw rule("Cadastro não encontrado.");
      if (membershipId) {
        await tx`update unit_memberships set status = 'recusado', decided_at = now(), decided_by = ${me.id}, notes = ${note}
                 where id = ${membershipId} and status = 'solicitado'`;
      }
      if (u.status === "pendente") {
        await tx`update users set status = 'recusado', decided_at = now(), decided_by = ${me.id}, decision_note = ${note} where id = ${userId}`;
      }
      await audit(tx, { actorId: me.id, actorLabel: me.fullName, action: "admin.recusar_cadastro", entity: "user", entityId: userId,
        data: { nome: u.full_name, motivo: note, somente_vinculo: u.status !== "pendente" } });
    });
    revalidatePath("/admin/cadastros");
    return { ok: true, message: "Solicitação recusada." };
  } catch (e) { return fail(friendlyDbError(e)); }
}

export async function situacaoUsuarioAction(_: ActionState, f: FormData): Promise<ActionState> {
  const me = await requireRole("admin");
  const userId = String(f.get("user_id"));
  const to = String(f.get("to")) as "bloqueado" | "ativo";
  if (userId === me.id) return fail("Você não pode bloquear o próprio acesso.");
  try {
    await asUser(me.id, async (tx) => {
      const [u] = await tx`update users set status = ${to}, decided_at = now(), decided_by = ${me.id} where id = ${userId} returning full_name`;
      await audit(tx, { actorId: me.id, actorLabel: me.fullName, action: to === "bloqueado" ? "admin.bloquear_usuario" : "admin.reativar_usuario",
        entity: "user", entityId: userId, data: { nome: u?.full_name } });
    });
    if (to === "bloqueado") await asSystem((tx) => tx`update sessions set revoked_at = now() where user_id = ${userId} and revoked_at is null`);
    revalidatePath("/admin/cadastros");
    return { ok: true, message: to === "bloqueado" ? "Usuário bloqueado." : "Usuário reativado." };
  } catch (e) { return fail(friendlyDbError(e)); }
}

export async function redefinirSenhaAction(_: ActionState, f: FormData): Promise<ActionState> {
  const me = await requireRole("admin");
  const userId = String(f.get("user_id"));
  const temp = tempPassword();
  try {
    const name = await asSystem(async (tx) => {
      const [u] = await tx`update users set password_hash = ${await hashPassword(temp)}, must_change_password = true
                           where id = ${userId} returning full_name`;
      if (!u) throw rule("Usuário não encontrado.");
      await tx`update sessions set revoked_at = now() where user_id = ${userId} and revoked_at is null`;
      await audit(tx, { actorId: me.id, actorLabel: me.fullName, action: "admin.redefinir_senha", entity: "user", entityId: userId, data: { nome: u.full_name } });
      return u.full_name as string;
    }, me.id);
    return { ok: true, message: `Senha provisória de ${name}: ${temp} — informe pessoalmente. Ela será trocada no primeiro acesso e não será exibida de novo.` };
  } catch (e) { return fail(friendlyDbError(e)); }
}

const ROLES: Role[] = ["morador", "admin", "portaria", "administradora"];

export async function perfisAction(_: ActionState, f: FormData): Promise<ActionState> {
  const me = await requireRole("admin");
  const userId = String(f.get("user_id"));
  const roles = f.getAll("role").map(String).filter((r): r is Role => ROLES.includes(r as Role));
  if (userId === me.id && !roles.includes("admin")) return fail("Você não pode remover o próprio perfil de administração.");
  try {
    await asUser(me.id, async (tx) => {
      const before = (await tx`select role from user_roles where user_id = ${userId}`).map((r) => r.role as string);
      for (const r of before.filter((r) => !roles.includes(r as Role))) await tx`delete from user_roles where user_id = ${userId} and role = ${r}`;
      for (const r of roles.filter((r) => !before.includes(r))) await tx`insert into user_roles (user_id, role, granted_by) values (${userId}, ${r}, ${me.id})`;
      await audit(tx, { actorId: me.id, actorLabel: me.fullName, action: "admin.perfil", entity: "user", entityId: userId, data: { antes: before, depois: roles } });
    });
    revalidatePath("/admin/cadastros");
    return { ok: true, message: "Perfis atualizados." };
  } catch (e) { return fail(friendlyDbError(e)); }
}

export async function vinculoAction(_: ActionState, f: FormData): Promise<ActionState> {
  const me = await requireRole("admin");
  const userId = String(f.get("user_id"));
  const op = String(f.get("op"));
  try {
    await asUser(me.id, async (tx) => {
      if (op === "encerrar") {
        const id = String(f.get("membership_id"));
        const [m] = await tx`update unit_memberships set status = 'encerrado', decided_at = now(), decided_by = ${me.id}
                             where id = ${id} and status = 'ativo' returning (select code from units where id = unit_id) as code`;
        await audit(tx, { actorId: me.id, actorLabel: me.fullName, action: "admin.vinculo", entity: "user", entityId: userId, data: { encerrado: m?.code } });
      } else {
        const unit = String(f.get("unit")).trim();
        const relation = String(f.get("relation"));
        const resides = f.get("resides") === "sim";
        const [u] = await tx`select id from units where code = ${unit}`;
        if (!u) throw rule("Apartamento não encontrado.");
        await tx`insert into unit_memberships (user_id, unit_id, relation, resides, status, decided_at, decided_by)
                 values (${userId}, ${u.id}, ${relation}, ${resides}, 'ativo', now(), ${me.id})`;
        await tx`insert into user_roles (user_id, role, granted_by) values (${userId}, 'morador', ${me.id}) on conflict do nothing`;
        await audit(tx, { actorId: me.id, actorLabel: me.fullName, action: "admin.vinculo", entity: "user", entityId: userId,
          data: { incluido: unit, vinculo: relation, reside: resides } });
      }
    });
    revalidatePath("/admin/cadastros");
    return { ok: true, message: "Vínculo atualizado." };
  } catch (e) { return fail(friendlyDbError(e)); }
}

export async function adimplenciaAction(_: ActionState, f: FormData): Promise<ActionState> {
  const me = await requireRole("admin");
  const unit = String(f.get("unit")).trim();
  const standing = String(f.get("standing"));
  const ref = String(f.get("reference_date"));
  const source = String(f.get("source") ?? "").trim();
  if (!["adimplente", "inadimplente"].includes(standing)) return fail("Selecione a situação.");
  if (source.length < 5) return fail("Informe a fonte (ex.: relatório da administradora de 10/11/2026).");
  try {
    await asUser(me.id, async (tx) => {
      const [u] = await tx`select id from units where code = ${unit}`;
      if (!u) throw rule("Apartamento não encontrado.");
      await tx`insert into unit_standing (unit_id, standing, reference_date, source, recorded_by)
               values (${u.id}, ${standing}, ${ref}, ${source}, ${me.id})`;
      await audit(tx, { actorId: me.id, actorLabel: me.fullName, action: "admin.adimplencia", entity: "unit", entityId: unit,
        data: { situacao: standing, referencia: ref, fonte: source } });
    });
    revalidatePath("/admin/cadastros");
    return { ok: true, message: `Situação do apto ${unit} registrada.` };
  } catch (e) { return fail(friendlyDbError(e)); }
}

export async function criarUsuarioAction(_: ActionState, f: FormData): Promise<ActionState> {
  const me = await requireRole("admin");
  const name = String(f.get("full_name") ?? "").trim();
  const email = String(f.get("email") ?? "").trim().toLowerCase();
  const phone = String(f.get("phone") ?? "").trim() || null;
  const roles = f.getAll("role").map(String).filter((r): r is Role => ROLES.includes(r as Role));
  if (name.length < 5 || !email.includes("@")) return fail("Informe nome completo e e-mail válido.");
  if (!roles.length) return fail("Selecione pelo menos um perfil.");
  const temp = tempPassword();
  try {
    await asSystem(async (tx) => {
      const [u] = await tx`insert into users (email, full_name, phone, password_hash, status, must_change_password, decided_at, decided_by)
                           values (${email}, ${name}, ${phone}, ${await hashPassword(temp)}, 'ativo', true, now(), ${me.id}) returning id`;
      for (const r of roles) await tx`insert into user_roles (user_id, role, granted_by) values (${u.id}, ${r}, ${me.id})`;
      await audit(tx, { actorId: me.id, actorLabel: me.fullName, action: "admin.usuario_criado", entity: "user", entityId: u.id, data: { nome: name, perfis: roles } });
    }, me.id);
    revalidatePath("/admin/cadastros");
    return { ok: true, message: `Usuário criado. Senha provisória: ${temp} — informe pessoalmente; será trocada no primeiro acesso.` };
  } catch (e) { return fail(friendlyDbError(e)); }
}

export async function parametroAction(_: ActionState, f: FormData): Promise<ActionState> {
  const me = await requireRole("admin");
  const key = String(f.get("key"));
  const text = String(f.get("value") ?? "").trim();
  const source = String(f.get("source") ?? "").trim();
  const toPending = f.get("pending") === "1";
  if (!toPending && (text.length < 1 || source.length < 5)) return fail("Informe o valor/definição e a fonte (deliberação, ata ou comunicado).");
  try {
    await asUser(me.id, async (tx) => {
      const [before] = await tx`select status, value, source from parameters where key = ${key}`;
      if (!before) throw rule("Parâmetro não encontrado.");
      if (toPending) {
        await tx`update parameters set status = 'pendente', value = null, source = null, updated_by = ${me.id}, updated_at = now() where key = ${key}`;
      } else {
        await tx`update parameters set status = 'definido', value = ${tx.json({ texto: text } as never)}, source = ${source},
                 updated_by = ${me.id}, updated_at = now() where key = ${key}`;
      }
      await audit(tx, { actorId: me.id, actorLabel: me.fullName, action: "admin.parametro", entity: "parameter", entityId: key,
        data: { antes: before, depois: toPending ? { status: "pendente" } : { status: "definido", texto: text, fonte: source } } });
    });
    revalidatePath("/admin/parametros");
    return { ok: true, message: toPending ? "Parâmetro voltou para pendente." : "Parâmetro registrado." };
  } catch (e) { return fail(friendlyDbError(e)); }
}
