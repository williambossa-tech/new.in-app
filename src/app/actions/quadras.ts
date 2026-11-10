"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/lib/action";
import { requireRole, requireUser } from "@/lib/auth";
import { friendlyDbError } from "@/lib/db";
import { RuleError } from "@/lib/lottery/engine";
import * as q from "@/lib/quadras/service";

function errMsg(e: unknown) {
  if ((e as { code?: string })?.code === "23P01") return "Esse horário já está ocupado. Escolha outro.";
  if ((e as { code?: string })?.code === "P0001") return (e as Error).message;
  return e instanceof RuleError ? e.message : friendlyDbError(e);
}
const refresh = () => { revalidatePath("/quadras", "layout"); revalidatePath("/admin/quadras"); revalidatePath("/minhas-reservas"); revalidatePath("/avisos"); };
const court = (f: FormData) => { const c = String(f.get("court")); if (!q.isCourt(c)) throw new RuleError("Quadra inválida."); return c; };

export async function agendarQuadraAction(_: ActionState, f: FormData): Promise<ActionState> {
  const me = await requireUser();
  try {
    const r = await q.requestCourt({ id: me.id, label: me.fullName }, {
      court: court(f), unitId: String(f.get("unit_id")), day: String(f.get("day")), start: String(f.get("start")), end: String(f.get("end")),
      modality: String(f.get("modality") ?? ""), participants: Number(f.get("participants")), visitors: Number(f.get("visitors") ?? 0),
      activity: String(f.get("activity")) as "recreativo", activityNote: String(f.get("activity_note") ?? ""), acceptTerms: f.get("accept") === "on",
    });
    refresh();
    const msg = r.status === "confirmada" ? "Agendamento confirmado." : r.status === "pendente_aprovacao" ? "Pedido enviado para aprovação da administração." : "Agendamento solicitado. A administração vai confirmar.";
    return { ok: true, message: msg, data: { status: r.status, code: r.code } };
  } catch (e) { return { message: errMsg(e) }; }
}

export async function cancelarQuadraAction(_: ActionState, f: FormData): Promise<ActionState> {
  const me = await requireUser();
  try { await q.cancelCourt({ id: me.id, label: me.fullName }, String(f.get("booking_id")), String(f.get("reason") ?? "")); refresh(); return { ok: true, message: "Agendamento cancelado." }; }
  catch (e) { return { message: errMsg(e) }; }
}

export async function decidirQuadraAction(_: ActionState, f: FormData): Promise<ActionState> {
  const me = await requireRole("admin");
  try {
    await q.decideCourt({ id: me.id, label: me.fullName }, String(f.get("booking_id")), String(f.get("decision")) === "rejeitar" ? "rejeitar" : "confirmar", String(f.get("note") ?? ""));
    refresh(); return { ok: true, message: "Decisão registrada e morador avisado." };
  } catch (e) { return { message: errMsg(e) }; }
}

export async function alterarQuadraAction(_: ActionState, f: FormData): Promise<ActionState> {
  const me = await requireRole("admin");
  try {
    await q.rescheduleCourt({ id: me.id, label: me.fullName }, String(f.get("booking_id")), String(f.get("day")), String(f.get("start")), String(f.get("end")), String(f.get("note") ?? ""));
    refresh(); return { ok: true, message: "Horário alterado e morador avisado." };
  } catch (e) { return { message: errMsg(e) }; }
}

export async function programacaoQuadraAction(_: ActionState, f: FormData): Promise<ActionState> {
  const me = await requireRole("admin");
  try {
    const weekdays = f.getAll("weekdays").map(Number).filter(Boolean);
    const r = await q.createSchedule({ id: me.id, label: me.fullName }, {
      court: court(f), kind: String(f.get("kind")) === "bloqueio" ? "bloqueio" : "programacao", title: String(f.get("title") ?? ""),
      audience: String(f.get("audience") ?? ""), startDate: String(f.get("start_date")), endDate: String(f.get("end_date") ?? "") || null,
      weekdays: f.get("recorrente") === "on" ? weekdays : null, startTime: String(f.get("start_time")), endTime: String(f.get("end_time")),
      cancelAffected: f.get("cancel_affected") === "on",
    });
    refresh();
    return { ok: true, message: r.cancelled ? `Salvo. ${r.cancelled} agendamento(s) cancelado(s) e moradores avisados.` : "Salvo." };
  } catch (e) { return { message: errMsg(e) }; }
}

export async function encerrarProgramacaoAction(_: ActionState, f: FormData): Promise<ActionState> {
  const me = await requireRole("admin");
  try { await q.cancelSchedule({ id: me.id, label: me.fullName }, String(f.get("booking_id")), String(f.get("reason") ?? "")); refresh(); return { ok: true, message: "Encerrado." }; }
  catch (e) { return { message: errMsg(e) }; }
}

export async function configQuadraAction(_: ActionState, f: FormData): Promise<ActionState> {
  const me = await requireRole("admin");
  const g = (k: string) => String(f.get(k) ?? "");
  try {
    await q.setCourtConfig({ id: me.id, label: me.fullName }, court(f), {
      confirmacao: g("confirmacao") as "", duracao: g("duracao"), antecedenciaMinH: g("antecedencia_min"), antecedenciaMaxD: g("antecedencia_max"),
      maxQtd: g("max_qtd"), maxPeriodo: g("max_periodo"), intervaloMin: g("intervalo"), consecutivosMin: g("consecutivos"),
      prioridade: g("prioridade"), cancelamentoH: g("cancelamento"), modalidades: g("modalidades"), source: g("source"),
    });
    refresh(); return { ok: true, message: "Configuração salva." };
  } catch (e) { return { message: errMsg(e) }; }
}
