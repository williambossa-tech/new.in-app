// Indicadores do Be My Guest a partir das linhas do relatório.
import { barChart, hBarChart } from "../charts";
import { addDays } from "./rules";

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export const STATUS_LABEL: Record<string, string> = {
  solicitada: "Solicitada", confirmada: "Confirmada", em_uso: "Em uso", concluida: "Concluída",
  cancelada: "Cancelada", recusada: "Recusada", ausencia: "Ausência",
};
const USED = ["confirmada", "em_uso", "concluida"];
const iso = (d: Date | string) => new Date(d).toISOString().slice(0, 10);
const days = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86400_000);
const overlapNights = (s: string, e: string, from: string, toExcl: string) =>
  Math.max(0, days(s < from ? from : s, e > toExcl ? toExcl : e));

export function bmgStats(rows: Row[], rooms: { code: string; name: string }[], from: string, to: string) {
  const toExcl = addDays(to, 1);
  const periodDays = Math.max(1, days(from, toExcl));
  const used = rows.filter((r) => USED.includes(r.status));
  const nightsIn = (r: Row) => overlapNights(iso(r.start_date), iso(r.end_date), from, toExcl);
  const totalNights = used.reduce((n, r) => n + nightsIn(r), 0);

  const byRoom = rooms.map((room) => {
    const n = used.filter((r) => r.room_code === room.code).reduce((a, r) => a + nightsIn(r), 0);
    return { code: room.code, name: room.name, nights: n, occupancy: Math.round((n / periodDays) * 1000) / 10,
      bookings: used.filter((r) => r.room_code === room.code).length };
  });

  // meses do período
  const months: { key: string; label: string; from: string; to: string }[] = [];
  let m = from.slice(0, 7) + "-01";
  while (m < toExcl) {
    const next = new Date(`${m}T12:00:00Z`); next.setUTCMonth(next.getUTCMonth() + 1);
    const nm = next.toISOString().slice(0, 10);
    months.push({ key: m.slice(0, 7), label: new Intl.DateTimeFormat("pt-BR", { month: "short", year: "2-digit", timeZone: "UTC" }).format(new Date(`${m}T12:00:00Z`)).replace(". de ", "/").replace(".", ""), from: m < from ? from : m, to: nm > toExcl ? toExcl : nm });
    m = nm;
  }
  const byMonth = months.map((mo) => ({
    ...mo,
    perRoom: Object.fromEntries(rooms.map((room) => [room.code,
      used.filter((r) => r.room_code === room.code).reduce((a, r) => a + overlapNights(iso(r.start_date), iso(r.end_date), mo.from, mo.to), 0)])),
    days: days(mo.from, mo.to),
  }));

  const units = [...new Set(rows.map((r) => r.unit as string))].sort((a, b) => Number(a) - Number(b));
  const byUnit = units.map((u) => {
    const ur = rows.filter((r) => r.unit === u);
    const uu = ur.filter((r) => USED.includes(r.status));
    const last = uu.map((r) => iso(r.start_date)).sort().pop() ?? null;
    return {
      unit: u,
      bookings: ur.length,
      used: uu.length,
      nights: uu.reduce((a, r) => a + nightsIn(r), 0),
      cancelled: ur.filter((r) => r.status === "cancelada").length,
      refused: ur.filter((r) => r.status === "recusada").length,
      absences: ur.filter((r) => r.status === "ausencia").length,
      occurrences: ur.filter((r) => ["pendente_validacao", "validada"].includes(r.occurrence_status)).length,
      lastStart: last,
    };
  }).sort((a, b) => b.nights - a.nights || b.bookings - a.bookings);

  const byStatus = Object.keys(STATUS_LABEL).map((s) => ({ status: s, label: STATUS_LABEL[s], count: rows.filter((r) => r.status === s).length }))
    .filter((x) => x.count > 0);
  const leads = used.map((r) => days(iso(r.created_at), iso(r.start_date))).filter((x) => x >= 0);
  const kpis = {
    bookings: rows.length,
    used: used.length,
    nights: totalNights,
    occupancy: Math.round((totalNights / (periodDays * Math.max(1, rooms.length))) * 1000) / 10,
    avgNights: used.length ? Math.round((used.reduce((a, r) => a + r.nights, 0) / used.length) * 10) / 10 : 0,
    avgLead: leads.length ? Math.round((leads.reduce((a, b) => a + b, 0) / leads.length) * 10) / 10 : 0,
    cancelRate: rows.length ? Math.round((rows.filter((r) => r.status === "cancelada").length / rows.length) * 1000) / 10 : 0,
    absences: rows.filter((r) => r.status === "ausencia").length,
    occurrences: rows.filter((r) => ["pendente_validacao", "validada"].includes(r.occurrence_status)).length,
    units: byUnit.filter((u) => u.used > 0).length,
    periodDays,
  };
  return { kpis, byRoom, byMonth, byUnit, byStatus };
}

export type BmgStats = ReturnType<typeof bmgStats>;

export function bmgCharts(s: BmgStats, rooms: { code: string; name: string }[]) {
  return {
    occupancy: barChart({ title: "Ocupação por suíte no período", categories: s.byRoom.map((r) => r.name), series: [{ name: "Ocupação", values: s.byRoom.map((r) => r.occupancy) }], unit: "%", max: 100, height: 280 }),
    monthly: barChart({
      title: "Diárias utilizadas por mês", categories: s.byMonth.map((m) => m.label),
      series: rooms.map((r) => ({ name: r.name, values: s.byMonth.map((m) => m.perRoom[r.code] ?? 0) })), height: 300,
    }),
    units: hBarChart({ title: "Diárias por apartamento (top 10)", labels: s.byUnit.filter((u) => u.nights > 0).slice(0, 10).map((u) => `Apto ${u.unit}`),
      values: s.byUnit.filter((u) => u.nights > 0).slice(0, 10).map((u) => u.nights) }),
    status: hBarChart({ title: "Reservas por situação", labels: s.byStatus.map((x) => x.label), values: s.byStatus.map((x) => x.count), color: "#17b5a6" }),
  };
}
