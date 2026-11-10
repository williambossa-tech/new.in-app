"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/lib/action";
import { requireRole, requireUser } from "@/lib/auth";
import { friendlyDbError } from "@/lib/db";
import { RuleError } from "@/lib/lottery/engine";
import * as pool from "@/lib/piscina/service";

const errMsg = (e: unknown) => (e instanceof RuleError ? e.message : friendlyDbError(e));
const refresh = () => { revalidatePath("/piscina"); revalidatePath("/admin/piscina"); revalidatePath("/avisos"); };

export async function salvarConvidadosAction(_: ActionState, f: FormData): Promise<ActionState> {
  const me = await requireUser();
  let guests: pool.GuestInput[] = [];
  try { guests = JSON.parse(String(f.get("guests") ?? "[]")); } catch { /* ignora */ }
  try {
    const r = await pool.savePoolGuests({ id: me.id, label: me.fullName }, { unitId: String(f.get("unit_id")), date: String(f.get("date")), guests, accept: f.get("accept") === "on" });
    refresh();
    return { ok: true, message: r.created || r.updated ? "Cadastro salvo." : "Nada foi alterado.", data: { date: String(f.get("date")), at: Date.now() } };
  } catch (e) { return { message: errMsg(e) }; }
}

export async function cancelarConvidadoAction(_: ActionState, f: FormData): Promise<ActionState> {
  const me = await requireUser();
  try { await pool.cancelPoolGuest({ id: me.id, label: me.fullName }, String(f.get("booking_id")), String(f.get("reason") ?? "")); refresh(); return { ok: true, message: "Cadastro cancelado." }; }
  catch (e) { return { message: errMsg(e) }; }
}

export async function corrigirConvidadoAction(_: ActionState, f: FormData): Promise<ActionState> {
  const me = await requireRole("admin");
  try {
    await pool.correctPoolGuest({ id: me.id, label: me.fullName }, String(f.get("id")), { name: String(f.get("name") ?? ""), document: String(f.get("document") ?? ""), minor: f.get("minor") === "on", reason: String(f.get("reason") ?? "") });
    refresh(); return { ok: true, message: "Correção registrada." };
  } catch (e) { return { message: errMsg(e) }; }
}

export async function configPiscinaAction(_: ActionState, f: FormData): Promise<ActionState> {
  const me = await requireRole("admin");
  const ret = String(f.get("retencao") ?? "").trim();
  try {
    await pool.setPoolConfig({ id: me.id, label: me.fullName }, { limiteAtivo: f.get("limite_ativo") === "on", limiteQtd: Number(f.get("limite_qtd") ?? 2),
      documento: String(f.get("documento")) as pool.DocMode, retencaoDias: ret ? Number(ret) : null, source: String(f.get("source") ?? "") });
    refresh(); return { ok: true, message: "Configuração salva." };
  } catch (e) { return { message: errMsg(e) }; }
}
