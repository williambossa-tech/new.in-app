import { describe, it, expect } from "vitest";
import { bmgCharts, bmgStats } from "@/lib/bmg/report";
import { bmgPdf, bmgXlsx, svgToPng } from "@/lib/bmg/export";

const rooms = [{ code: "bmg-1", name: "Be My Guest 1" }, { code: "bmg-2", name: "Be My Guest 2" }];
const row = (o: Record<string, unknown>) => ({ id: Math.random().toString(), code: "AB12CD34", room: "Be My Guest 1", room_code: "bmg-1", unit: "1103",
  responsible_name: "Fulano de Tal", status: "confirmada", nights: 2, start_date: new Date("2026-11-12"), end_date: new Date("2026-11-14"),
  checkin_at: new Date("2026-11-12T21:00:00Z"), checkout_at: new Date("2026-11-14T15:00:00Z"), created_at: new Date("2026-11-09T10:00:00Z"),
  guests: [{ name: "Ana", cpf: "52998224725", minor: false }], occurrence_status: "sem_ocorrencia", ...o });

describe("relatório do Be My Guest", () => {
  const rows = [row({}), row({ unit: "502", room_code: "bmg-2", room: "Be My Guest 2", start_date: new Date("2026-12-01"), end_date: new Date("2026-12-05"), nights: 4 }),
    row({ unit: "1103", status: "cancelada" })];
  const stats = bmgStats(rows, rooms, "2026-11-01", "2026-12-31");
  it("calcula indicadores por suíte, mês e apartamento", () => {
    expect(stats.kpis.nights).toBe(6);
    expect(stats.byRoom.find((r) => r.code === "bmg-1")?.nights).toBe(2);
    expect(stats.byMonth.map((m) => m.label)).toEqual(["nov/26", "dez/26"]);
    expect(stats.byUnit[0]).toMatchObject({ unit: "502", nights: 4 });
    expect(stats.byUnit.find((u) => u.unit === "1103")).toMatchObject({ bookings: 2, cancelled: 1 });
  });
  it("gera PNG, XLSX e PDF", async () => {
    const charts = bmgCharts(stats, rooms);
    expect(svgToPng(charts.monthly).subarray(1, 4).toString()).toBe("PNG");
    const meta = { from: "2026-11-01", to: "2026-12-31", roomLabel: "Todas", statusLabel: "Todas", generatedBy: "Teste" };
    const x = await bmgXlsx(rows, stats, charts, meta);
    expect(x.subarray(0, 2).toString()).toBe("PK");
    const p = await bmgPdf(rows, stats, charts, meta);
    expect(p.subarray(0, 4).toString()).toBe("%PDF");
    require("node:fs").writeFileSync("/tmp/claude-0/-home-claude/a6717e6d-ba28-5343-a186-ba81b45d78a0/scratchpad/teste-relatorio.pdf", p);
    require("node:fs").writeFileSync("/tmp/claude-0/-home-claude/a6717e6d-ba28-5343-a186-ba81b45d78a0/scratchpad/teste-relatorio.xlsx", x);
  });
});
