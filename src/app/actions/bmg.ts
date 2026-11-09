"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/lib/action";
import { requireRole, requireUser } from "@/lib/auth";
import * as bmg from "@/lib/bmg/service";
import { friendlyDbError } from "@/lib/db";
import { RuleError } from "@/lib/lottery/engine";

function errMsg(e: unknown) {
  const c = (e as { constraint_name?: string })?.constraint_name;
  if (c === "bookings_bmg_one_active_per_unit") return "Seu apartamento já tem uma reserva ativa do Be My Guest.";
  if ((e as { code?: string })?.code === "23P01") return "Essas datas acabaram de ser reservadas. Escolha outro período.";
  return e instanceof RuleError ? e.message : friendlyDbError(e);
}

function refresh() {
  revalidatePath("/be-my-guest");
  revalidatePath("/admin/be-my-guest");
  revalidatePath("/minhas-reservas");
}

export async function solicitarBmgAction(_: ActionState, f: FormData): Promise<ActionState> {
  const me = await requireUser();
  let guests: bmg.GuestInput[] = [];
  try { guests = JSON.parse(String(f.get("guests") ?? "[]")); } catch { /* ignora */ }
  try {
    const r = await bmg.requestBmg({ id: me.id, label: me.fullName }, {
      spaceCode: String(f.get("room") ?? ""),
      unitId: String(f.get("unit_id") ?? ""),
      startDate: String(f.get("start") ?? ""),
      endDate: String(f.get("end") ?? ""),
      guests,
      accepted: f.get("accept") === "on",
    });
    refresh();
    return { ok: true, message: "Solicitação enviada.", data: { code: r.code } };
  } catch (e) {
    return { message: errMsg(e) };
  }
}

export async function cancelarBmgAction(_: ActionState, f: FormData): Promise<ActionState> {
  const me = await requireUser();
  try {
    await bmg.cancelBmg({ id: me.id, label: me.fullName }, String(f.get("booking_id")), String(f.get("reason") ?? ""));
    refresh();
    return { ok: true, message: "Reserva cancelada." };
  } catch (e) { return { message: errMsg(e) }; }
}

export async function decidirBmgAction(_: ActionState, f: FormData): Promise<ActionState> {
  const me = await requireRole("admin");
  const decision = String(f.get("decision")) as "confirmar" | "recusar";
  try {
    await bmg.decideBmg({ id: me.id, label: me.fullName }, String(f.get("booking_id")), decision, String(f.get("note") ?? ""));
    refresh();
    return { ok: true, message: decision === "confirmar" ? "Reserva confirmada." : "Solicitação recusada." };
  } catch (e) { return { message: errMsg(e) }; }
}

export async function entradaBmgAction(_: ActionState, f: FormData): Promise<ActionState> {
  const me = await requireRole("admin", "portaria");
  try {
    await bmg.checkInBmg({ id: me.id, label: me.fullName }, String(f.get("booking_id")), {
      inspectionOk: f.get("inspection_ok") === "sim", inspectionNote: String(f.get("inspection_note") ?? ""), tagCode: String(f.get("tag_code") ?? ""),
    });
    refresh();
    return { ok: true, message: "Entrada registrada." };
  } catch (e) { return { message: errMsg(e) }; }
}

export async function saidaBmgAction(_: ActionState, f: FormData): Promise<ActionState> {
  const me = await requireRole("admin", "portaria");
  try {
    await bmg.checkOutBmg({ id: me.id, label: me.fullName }, String(f.get("booking_id")), {
      tagReturned: String(f.get("tag_returned")) as "sem_tag", note: String(f.get("note") ?? ""),
    });
    refresh();
    return { ok: true, message: "Saída registrada." };
  } catch (e) { return { message: errMsg(e) }; }
}

export async function ocorrenciaBmgAction(_: ActionState, f: FormData): Promise<ActionState> {
  const me = await requireRole("admin");
  try {
    await bmg.validateOccurrence({ id: me.id, label: me.fullName }, String(f.get("booking_id")), String(f.get("decision")) as "validada", String(f.get("note") ?? ""));
    refresh();
    return { ok: true, message: "Ocorrência registrada." };
  } catch (e) { return { message: errMsg(e) }; }
}

export async function ausenciaBmgAction(_: ActionState, f: FormData): Promise<ActionState> {
  const me = await requireRole("admin");
  try {
    await bmg.markAbsence({ id: me.id, label: me.fullName }, String(f.get("booking_id")), String(f.get("note") ?? ""));
    refresh();
    return { ok: true, message: "Ausência registrada." };
  } catch (e) { return { message: errMsg(e) }; }
}

export async function excecaoBmgAction(_: ActionState, f: FormData): Promise<ActionState> {
  const me = await requireRole("admin");
  try {
    await bmg.timeException({ id: me.id, label: me.fullName }, String(f.get("booking_id")), {
      checkin: String(f.get("checkin") ?? ""), checkout: String(f.get("checkout") ?? ""),
      reason: String(f.get("reason") ?? ""), chargeNote: String(f.get("charge_note") ?? ""),
    });
    refresh();
    return { ok: true, message: "Exceção registrada." };
  } catch (e) { return { message: errMsg(e) }; }
}

export async function configBmgAction(_: ActionState, f: FormData): Promise<ActionState> {
  const me = await requireRole("admin");
  const h = String(f.get("advance_hours") ?? "").trim();
  try {
    await bmg.setBmgSettings({ id: me.id, label: me.fullName }, {
      advanceHours: h === "" ? null : Number(h), open: f.get("open") === "on", source: String(f.get("source") ?? ""),
    });
    refresh();
    return { ok: true, message: "Configuração salva." };
  } catch (e) { return { message: errMsg(e) }; }
}
