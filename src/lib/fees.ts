import "server-only";
import type { Tx } from "./db";

export const COMPONENT_LABEL: Record<string, string> = {
  taxa_uso: "Taxa de uso",
  taxa_limpeza: "Taxa de limpeza",
  fundo_manutencao: "Fundo de manutenção",
  taxa_reserva: "Taxa de reserva",
};
export const BASIS_LABEL: Record<string, string> = { por_diaria: "por diária", por_reserva: "por reserva" };
export const REQUIRED: Record<string, string[]> = {
  bmg: ["taxa_uso", "taxa_limpeza", "fundo_manutencao"],
  salao_festivo: ["taxa_reserva"],
  coworking: [],
};

export type FeeLine = { component: string; label: string; amount: number; basis: string; qty: number; subtotal: number; valid_from: string; source: string };
export type FeeSnapshot = { lines: FeeLine[]; missing: string[]; total: number; computed_at: string };

/** Valores vigentes na data de início (ou na data informada) para o módulo. */
export async function computeFees(tx: Tx, module: string, onDate: string, units: number): Promise<FeeSnapshot> {
  const rows = await tx`
    select distinct on (component) component, amount, basis, valid_from, source
    from fee_schedules where module = ${module} and valid_from <= ${onDate}
    order by component, valid_from desc`;
  const lines: FeeLine[] = rows.map((r) => {
    const qty = r.basis === "por_diaria" ? units : 1;
    const amount = Number(r.amount);
    return { component: r.component, label: COMPONENT_LABEL[r.component] ?? r.component, amount, basis: r.basis, qty,
      subtotal: Math.round(amount * qty * 100) / 100, valid_from: new Date(r.valid_from).toISOString().slice(0, 10), source: r.source };
  });
  const missing = (REQUIRED[module] ?? []).filter((c) => !lines.some((l) => l.component === c)).map((c) => COMPONENT_LABEL[c]);
  return { lines, missing, total: Math.round(lines.reduce((a, l) => a + l.subtotal, 0) * 100) / 100, computed_at: new Date().toISOString() };
}
