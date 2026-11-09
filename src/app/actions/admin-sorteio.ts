"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/lib/action";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth";
import { asUser, friendlyDbError } from "@/lib/db";
import { localToInstant } from "@/lib/format";
import * as engine from "@/lib/lottery/engine";

const fail = (message: string): ActionState => ({ ok: false, message });
const rule = (m: string) => Object.assign(new Error(m), { code: "P0001" });

async function run(code: string, fn: (actor: { id: string; label: string }) => Promise<unknown>, okMsg: string): Promise<ActionState> {
  const me = await requireRole("admin");
  try {
    await fn({ id: me.id, label: me.fullName });
  } catch (e) {
    return fail(e instanceof engine.RuleError ? e.message : friendlyDbError(e));
  }
  revalidatePath(`/admin/sorteios/${code}`);
  revalidatePath(`/sorteios/${code}`);
  revalidatePath(`/telao/${code}`);
  return { ok: true, message: okMsg };
}

export async function situacaoInscricoesAction(_: ActionState, f: FormData) {
  const code = String(f.get("campaign"));
  const to = String(f.get("to")) as "inscricoes_abertas" | "inscricoes_encerradas";
  return run(code, (a) => engine.setRegistrationState(a, code, to), to === "inscricoes_abertas" ? "Inscrições abertas no aplicativo." : "Inscrições encerradas.");
}

export async function horarioAction(_: ActionState, f: FormData): Promise<ActionState> {
  const me = await requireRole("admin");
  const code = String(f.get("campaign"));
  const which = String(f.get("which")) as "prazo" | "sorteio";
  const time = String(f.get("time") ?? "");
  const source = String(f.get("source") ?? "").trim();
  if (!/^\d{2}:\d{2}$/.test(time)) return fail("Informe o horário no formato HH:MM.");
  if (source.length < 5) return fail("Informe a fonte da definição (ex.: comunicado retificado de 09/11/2026).");
  try {
    await asUser(me.id, async (tx) => {
      const [c] = await tx`select id, status, registration_deadline_date, draw_date from lottery_campaigns where code = ${code}`;
      if (!c) throw rule("Campanha não encontrada.");
      const iso = (d: Date) => d.toISOString().slice(0, 10);
      if (which === "prazo") {
        if (!["rascunho", "inscricoes_abertas", "inscricoes_encerradas"].includes(c.status)) throw rule("A lista já foi congelada.");
        const at = localToInstant(iso(c.registration_deadline_date), time);
        await tx`update lottery_campaigns set registration_deadline = ${at} where id = ${c.id}`;
        await tx`update parameters set status = 'definido', value = ${tx.json({ texto: `${time} de ${iso(c.registration_deadline_date).split("-").reverse().join("/")}` } as never)},
                 source = ${source}, updated_by = ${me.id}, updated_at = now() where key = 'sorteio.horario_encerramento'`;
      } else {
        const at = localToInstant(iso(c.draw_date), time);
        await tx`update lottery_campaigns set draw_at = ${at} where id = ${c.id}`;
        await tx`update parameters set status = 'definido', value = ${tx.json({ texto: `${time} de ${iso(c.draw_date).split("-").reverse().join("/")}` } as never)},
                 source = ${source}, updated_by = ${me.id}, updated_at = now() where key = 'sorteio.horario_sorteio'`;
      }
      await audit(tx, { actorId: me.id, actorLabel: me.fullName, action: "sorteio.horario_prazo", entity: "lottery_campaign", entityId: code,
        data: { tipo: which, horario: time, fonte: source } });
    });
  } catch (e) { return fail(friendlyDbError(e)); }
  revalidatePath(`/admin/sorteios/${code}`);
  revalidatePath(`/sorteios/${code}`);
  return { ok: true, message: "Horário registrado." };
}

export async function ordemAction(_: ActionState, f: FormData) {
  const code = String(f.get("campaign"));
  const method = String(f.get("method")) as "fixa" | "sorteada";
  const note = String(f.get("note") ?? "");
  let fixed: Record<string, string[]> | null = null;
  if (method === "fixa") {
    fixed = {};
    for (const p of ["natal", "ano_novo"]) {
      fixed[p] = [1, 2, 3].map((i) => String(f.get(`${p}_${i}`) ?? "")).filter(Boolean);
    }
  }
  return run(code, (a) => engine.setOrderMethod(a, code, method, fixed, note), "Método de ordem registrado.");
}

export async function congelarAction(_: ActionState, f: FormData) {
  const code = String(f.get("campaign"));
  return run(code, (a) => engine.freeze(a, code), "Lista congelada e chave lacrada. Divulgue a impressão digital e o lacre antes do sorteio.");
}

export async function iniciarAction(_: ActionState, f: FormData) {
  const code = String(f.get("campaign"));
  return run(code, (a) => engine.startRound(a, code, String(f.get("entropy") ?? "")), "Sorteio iniciado. Sorteie as etapas na ordem.");
}

export async function sortearEtapaAction(_: ActionState, f: FormData) {
  const code = String(f.get("campaign"));
  return run(code, (a) => engine.drawStage(a, code, String(f.get("stage_id"))), "Etapa sorteada e gravada.");
}

export async function concluirAction(_: ActionState, f: FormData) {
  const code = String(f.get("campaign"));
  return run(code, (a) => engine.concludeRound(a, code), "Sorteio concluído. Chave revelada e reservas geradas.");
}

export async function anularAction(_: ActionState, f: FormData) {
  const code = String(f.get("campaign"));
  return run(code, (a) => engine.annulRound(a, code, String(f.get("reason") ?? "")), "Rodada anulada e registrada. Uma nova chave foi lacrada.");
}

export async function simularAction(_: ActionState, f: FormData): Promise<ActionState> {
  const me = await requireRole("admin");
  const code = String(f.get("campaign"));
  try {
    const r = await engine.simulate({ id: me.id, label: me.fullName }, code);
    revalidatePath(`/admin/sorteios/${code}`);
    return { ok: true, message: "Simulação executada (sem validade oficial).", data: { simId: r.id } };
  } catch (e) {
    return fail(e instanceof engine.RuleError ? e.message : friendlyDbError(e));
  }
}

export async function lancarEmailAction(_: ActionState, f: FormData): Promise<ActionState> {
  const me = await requireRole("admin");
  const code = String(f.get("campaign"));
  const unit = String(f.get("unit") ?? "").trim();
  const name = String(f.get("applicant_name") ?? "").trim();
  const contact = String(f.get("contact") ?? "").trim();
  const received = String(f.get("received_at") ?? "");
  const subject = String(f.get("subject") ?? "").trim();
  const combos = f.getAll("combo").map(String);
  const accepted = f.get("accepted") === "on";
  if (!/^\d{3,4}$/.test(unit)) return fail("Informe o apartamento.");
  if (name.split(/\s+/).length < 2) return fail("Informe o nome completo do interessado.");
  if (contact.length < 5) return fail("Informe o contato.");
  if (!received) return fail("Informe data e hora de recebimento do e-mail.");
  if (!combos.length) return fail("Marque os salões e períodos pedidos no e-mail.");
  if (!accepted) return fail("Confirme que o e-mail contém o aceite das regras.");
  const receivedAt = new Date(`${received}:00-03:00`);
  try {
    const n = await asUser(me.id, async (tx) => {
      const [c] = await tx`select id, terms_version from lottery_campaigns where code = ${code}`;
      const [u] = await tx`select id from units where code = ${unit}`;
      if (!u) throw rule("Apartamento não encontrado.");
      const existing = new Set((await tx`select period_id, space_id from lottery_entries where campaign_id = ${c.id} and unit_id = ${u.id} and status = 'ativa'`)
        .map((r) => `${r.period_id}|${r.space_id}`));
      const todo = combos.filter((k) => !existing.has(k));
      const sub = crypto.randomUUID();
      for (const k of todo) {
        const [periodId, spaceId] = k.split("|");
        await tx`insert into lottery_entries (campaign_id, submission_id, unit_id, period_id, space_id, applicant_name, contact,
                   terms_version, terms_accepted_at, origin, email_received_at, email_subject, launched_by)
                 values (${c.id}, ${sub}, ${u.id}, ${periodId}, ${spaceId}, ${name}, ${contact}, ${c.terms_version}, ${receivedAt},
                         'email', ${receivedAt}, ${subject || null}, ${me.id})`;
      }
      if (todo.length) await audit(tx, { actorId: me.id, actorLabel: me.fullName, action: "sorteio.inscricao_email", entity: "lottery_campaign", entityId: code,
        data: { apartamento: unit, interessado: name, recebido_em: receivedAt.toISOString(), assunto: subject, inscricoes: todo.length, ja_existentes: combos.length - todo.length } });
      return { added: todo.length, skipped: combos.length - todo.length };
    });
    revalidatePath(`/admin/sorteios/${code}`);
    if (!n.added) return fail("O apartamento já estava inscrito em todas as opções marcadas.");
    return { ok: true, message: `Lançadas ${n.added} inscrição(ões) do apto ${unit}.${n.skipped ? ` ${n.skipped} já existia(m).` : ""}` };
  } catch (e) { return fail(friendlyDbError(e)); }
}

export async function invalidarInscricaoAction(_: ActionState, f: FormData): Promise<ActionState> {
  const me = await requireRole("admin");
  const code = String(f.get("campaign"));
  const id = String(f.get("entry_id"));
  const reason = String(f.get("reason") ?? "").trim();
  if (reason.length < 10) return fail("Informe o motivo (mínimo de 10 caracteres).");
  try {
    await asUser(me.id, async (tx) => {
      const [e] = await tx`update lottery_entries set status = 'invalidada', status_reason = ${reason}, status_changed_at = now(), status_changed_by = ${me.id}
                           where id = ${id} returning (select code from units where id = unit_id) as unit`;
      await audit(tx, { actorId: me.id, actorLabel: me.fullName, action: "sorteio.inscricao_invalidada", entity: "lottery_entry", entityId: id,
        data: { apartamento: e?.unit, motivo: reason } });
    });
    revalidatePath(`/admin/sorteios/${code}`);
    return { ok: true, message: "Inscrição invalidada." };
  } catch (e) { return fail(friendlyDbError(e)); }
}

export async function desistenciaAdminAction(_: ActionState, f: FormData) {
  const code = String(f.get("campaign"));
  return run(code, (a) => engine.withdraw(a, code, String(f.get("stage_id")), String(f.get("reason") ?? ""), "administracao", String(f.get("unit"))),
    "Desistência registrada e novo sorteio realizado.");
}

export async function revelarReservaAction(_: ActionState, f: FormData) {
  const code = String(f.get("campaign"));
  return run(code, (a) => engine.revealReserve(a, code), "Período de desistências encerrado e chave reserva revelada.");
}
