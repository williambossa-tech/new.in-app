"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/lib/action";
import { audit } from "@/lib/audit";
import { requireUser } from "@/lib/auth";
import { asUser, friendlyDbError } from "@/lib/db";

/** Inscrição feita pelo morador no aplicativo (validada também pelas regras do banco). */
export async function inscreverAction(_: ActionState, f: FormData): Promise<ActionState> {
  const me = await requireUser();
  const code = String(f.get("campaign") ?? "");
  const unitId = String(f.get("unit_id") ?? "");
  const name = String(f.get("applicant_name") ?? "").trim();
  const contact = String(f.get("contact") ?? "").trim();
  const combos = f.getAll("combo").map(String);
  const accepted = f.get("accept") === "on";
  const fieldErrors: Record<string, string> = {};
  if (name.split(/\s+/).length < 2) fieldErrors.applicant_name = "Informe nome e sobrenome.";
  if (contact.length < 8) fieldErrors.contact = "Informe um telefone ou e-mail para contato.";
  if (!combos.length) fieldErrors.combo = "Marque pelo menos um salão e período.";
  if (!accepted) fieldErrors.accept = "É preciso aceitar as regras e o termo.";
  if (!me.units.some((u) => u.id === unitId)) fieldErrors.unit_id = "Selecione um apartamento vinculado ao seu cadastro.";
  if (Object.keys(fieldErrors).length) return { message: "Confira os campos destacados.", fieldErrors };

  try {
    const result = await asUser(me.id, async (tx) => {
      const [c] = await tx`select id, terms_version from lottery_campaigns where code = ${code}`;
      if (!c) throw Object.assign(new Error("Campanha não encontrada."), { code: "P0001" });
      const existing = await tx`select period_id, space_id from lottery_entries
                                where campaign_id = ${c.id} and unit_id = ${unitId} and status = 'ativa'`;
      const have = new Set(existing.map((r) => `${r.period_id}|${r.space_id}`));
      const todo = combos.filter((k) => !have.has(k));
      const skipped = combos.length - todo.length;
      const submission = crypto.randomUUID();
      for (const k of todo) {
        const [periodId, spaceId] = k.split("|");
        await tx`insert into lottery_entries (campaign_id, submission_id, unit_id, period_id, space_id, applicant_name, applicant_user_id,
                   contact, terms_version, terms_accepted_at, origin)
                 values (${c.id}, ${submission}, ${unitId}, ${periodId}, ${spaceId}, ${name}, ${me.id}, ${contact},
                         ${c.terms_version}, now(), 'app')`;
      }
      if (todo.length) {
        const [u] = await tx`select code from units where id = ${unitId}`;
        await audit(tx, { actorId: me.id, actorLabel: me.fullName, action: "sorteio.inscricao", entity: "lottery_campaign", entityId: code,
          data: { apartamento: u.code, inscricoes: todo.length, termo_versao: c.terms_version, envio: submission } });
      }
      return { added: todo.length, skipped };
    });
    revalidatePath(`/sorteios/${code}`);
    if (!result.added) return { ok: false, message: "Seu apartamento já estava inscrito em todas as opções marcadas. Nada foi alterado." };
    return {
      ok: true,
      message: `Inscrição registrada: ${result.added} ${result.added === 1 ? "opção" : "opções"}.` +
        (result.skipped ? ` ${result.skipped} já estava(m) inscrita(s) pelo seu apartamento e não gera(m) chance extra.` : ""),
    };
  } catch (e) {
    return { message: friendlyDbError(e) };
  }
}

export async function cancelarInscricaoAction(_: ActionState, f: FormData): Promise<ActionState> {
  const me = await requireUser();
  const id = String(f.get("entry_id") ?? "");
  const code = String(f.get("campaign") ?? "");
  try {
    await asUser(me.id, async (tx) => {
      const [e] = await tx`select e.id, c.status, u.code as unit, s.code as space, p.code as period
        from lottery_entries e join lottery_campaigns c on c.id = e.campaign_id join units u on u.id = e.unit_id
        join spaces s on s.id = e.space_id join lottery_periods p on p.id = e.period_id where e.id = ${id}`;
      if (!e) throw Object.assign(new Error("Inscrição não encontrada."), { code: "P0001" });
      const staff = me.roles.includes("admin");
      if (!staff && e.status !== "inscricoes_abertas")
        throw Object.assign(new Error("As inscrições estão encerradas; procure a administração."), { code: "P0001" });
      await tx`update lottery_entries set status = 'cancelada', status_reason = ${staff ? "Cancelada pela administração" : "Cancelada pelo morador"},
               status_changed_at = now(), status_changed_by = ${me.id} where id = ${id}`;
      await audit(tx, { actorId: me.id, actorLabel: me.fullName, action: "sorteio.inscricao_cancelada", entity: "lottery_entry", entityId: id,
        data: { apartamento: e.unit, periodo: e.period, salao: e.space } });
    });
    revalidatePath(`/sorteios/${code}`);
    return { ok: true, message: "Inscrição cancelada." };
  } catch (e) {
    return { message: friendlyDbError(e) };
  }
}
