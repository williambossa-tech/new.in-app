"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/lib/action";
import { requireRole, requireUser } from "@/lib/auth";
import * as cw from "@/lib/cw/service";
import { friendlyDbError } from "@/lib/db";
import { RuleError } from "@/lib/lottery/engine";

function errMsg(e: unknown) {
  const c = (e as { constraint_name?: string })?.constraint_name;
  if (c === "bookings_cw_one_per_day") return "Seu apartamento já tem uma reserva de coworking neste dia.";
  if ((e as { code?: string })?.code === "23P01") return "Esse horário acabou de ser reservado. Escolha outro.";
  return e instanceof RuleError ? e.message : friendlyDbError(e);
}
const refresh = () => { revalidatePath("/coworking"); revalidatePath("/admin/coworking"); revalidatePath("/minhas-reservas"); };

export async function reservarCwAction(_: ActionState, f: FormData): Promise<ActionState> {
  const me = await requireUser();
  let guests: cw.CwGuest[] = [];
  try { guests = JSON.parse(String(f.get("guests") ?? "[]")); } catch { /* ignora */ }
  try {
    const r = await cw.requestCw({ id: me.id, label: me.fullName }, {
      spaceCode: String(f.get("room")), unitId: String(f.get("unit_id")), day: String(f.get("day")), start: String(f.get("start")),
      minutes: Number(f.get("minutes")), purpose: String(f.get("purpose")) as "uso_pessoal", guests,
      exceptionReason: String(f.get("exception_reason") ?? "") || undefined,
    });
    refresh();
    return { ok: true, message: r.pending ? "Pedido de exceção enviado à administração." : "Reserva confirmada.", data: { pending: r.pending, code: r.code } };
  } catch (e) {
    if (e instanceof cw.LimitError) return { message: e.message, data: { limit: e.limit } };
    return { message: errMsg(e) };
  }
}

export async function cancelarCwAction(_: ActionState, f: FormData): Promise<ActionState> {
  const me = await requireUser();
  try { await cw.cancelCw({ id: me.id, label: me.fullName }, String(f.get("booking_id")), String(f.get("reason") ?? "")); refresh(); return { ok: true, message: "Reserva cancelada." }; }
  catch (e) { return { message: errMsg(e) }; }
}

export async function prorrogarCwAction(_: ActionState, f: FormData): Promise<ActionState> {
  const me = await requireUser();
  try { await cw.extendCw({ id: me.id, label: me.fullName }, String(f.get("booking_id"))); refresh(); return { ok: true, message: "Reserva prorrogada por 1 hora." }; }
  catch (e) { return { message: (e as { code?: string })?.code === "23P01" ? "Não dá para prorrogar: há outra reserva logo em seguida." : errMsg(e) }; }
}

export async function excecaoCwAction(_: ActionState, f: FormData): Promise<ActionState> {
  const me = await requireRole("admin");
  try {
    await cw.decideCwException({ id: me.id, label: me.fullName }, String(f.get("booking_id")), String(f.get("decision")) as "aprovada", String(f.get("note") ?? ""));
    refresh(); return { ok: true, message: "Decisão registrada." };
  } catch (e) { return { message: errMsg(e) }; }
}

export async function configCwAction(_: ActionState, f: FormData): Promise<ActionState> {
  const me = await requireRole("admin");
  const m = String(f.get("advance_min") ?? "").trim();
  try {
    await cw.setCwSettings({ id: me.id, label: me.fullName }, { open: f.get("open") === "on", advanceMin: m === "" ? null : Number(m), source: String(f.get("source") ?? "") });
    refresh(); return { ok: true, message: "Configuração salva." };
  } catch (e) { return { message: errMsg(e) }; }
}
