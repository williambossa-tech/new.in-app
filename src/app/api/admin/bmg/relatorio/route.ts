import { getSessionUser } from "@/lib/auth";
import { bmgPdf, bmgXlsx } from "@/lib/bmg/export";
import { bmgAdminData } from "@/lib/bmg/queries";
import { bmgCharts, bmgStats, STATUS_LABEL } from "@/lib/bmg/report";
import { addDays, todayIso } from "@/lib/bmg/rules";
import { csvResponse, toCsv } from "@/lib/csv";
import { fmtDateTime } from "@/lib/format";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const me = await getSessionUser();
  if (!me || me.status !== "ativo" || !me.roles.includes("admin")) return new Response("Acesso negado", { status: 403 });
  const u = new URL(req.url);
  const from = u.searchParams.get("de") || addDays(todayIso(), -30);
  const to = u.searchParams.get("ate") || addDays(todayIso(), 30);
  const room = u.searchParams.get("quarto") ?? "";
  const status = u.searchParams.get("situacao") ?? "";
  const format = u.searchParams.get("formato") ?? "csv";
  const { report, rooms } = await bmgAdminData(me.id, { from, to, room, status });
  const name = `be-my-guest-${from}-a-${to}`;
  if (format === "xlsx" || format === "pdf") {
    const rs = rooms.filter((r) => !room || r.code === room).map((r) => ({ code: r.code as string, name: r.name as string }));
    const stats = bmgStats(report, rs, from, to);
    const charts = bmgCharts(stats, rs);
    const meta = { from, to, roomLabel: rs.length === 1 && room ? rs[0].name : "Todas", statusLabel: status ? STATUS_LABEL[status] ?? status : "Todas", generatedBy: me.fullName };
    if (format === "xlsx") {
      const buf = await bmgXlsx(report, stats, charts, meta);
      return new Response(new Uint8Array(buf), { headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${name}.xlsx"`, "Cache-Control": "no-store" } });
    }
    const buf = await bmgPdf(report, stats, charts, meta);
    return new Response(new Uint8Array(buf), { headers: {
      "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${name}.pdf"`, "Cache-Control": "no-store" } });
  }
  return csvResponse(`${name}.csv`, toCsv(
    ["Reserva", "Suíte", "Apartamento", "Responsável", "Entrada", "Saída", "Diárias", "Hóspedes", "Situação", "Origem", "Solicitada em",
     "Vistoria", "Tag", "Devolução da tag", "Ocorrência", "Valor da ocorrência", "Observações"],
    report.map((r) => [r.code, r.room, r.unit, r.responsible_name, fmtDateTime(r.checkin_at), fmtDateTime(r.checkout_at), r.nights,
      (r.guests as { name: string }[]).map((g) => g.name).join(" | "), STATUS_LABEL[r.status] ?? r.status, r.origin, fmtDateTime(r.created_at),
      r.inspection_ok === null ? "" : r.inspection_ok ? "OK" : `Com apontamentos: ${r.inspection_note ?? ""}`,
      r.tag_code ?? "", r.tag_returned ?? "", r.occurrence_status ?? "", r.occurrence_amount ?? "", r.checkout_note ?? r.cancel_reason ?? ""]),
  ));
}
