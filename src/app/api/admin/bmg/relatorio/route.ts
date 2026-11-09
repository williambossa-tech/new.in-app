import { getSessionUser } from "@/lib/auth";
import { addDays, todayIso } from "@/lib/bmg/rules";
import { bmgAdminData } from "@/lib/bmg/queries";
import { csvResponse, toCsv } from "@/lib/csv";
import { fmtDateTime } from "@/lib/format";

export async function GET(req: Request) {
  const me = await getSessionUser();
  if (!me || me.status !== "ativo" || !me.roles.includes("admin")) return new Response("Acesso negado", { status: 403 });
  const u = new URL(req.url);
  const from = u.searchParams.get("de") || addDays(todayIso(), -30);
  const to = u.searchParams.get("ate") || addDays(todayIso(), 30);
  const { report } = await bmgAdminData(me.id, { from, to, room: u.searchParams.get("quarto") ?? "", status: u.searchParams.get("situacao") ?? "" });
  return csvResponse(`be-my-guest-${from}-a-${to}.csv`, toCsv(
    ["Reserva", "Suíte", "Apartamento", "Responsável", "Entrada", "Saída", "Diárias", "Hóspedes", "Situação", "Origem", "Solicitada em",
     "Vistoria", "Tag", "Devolução da tag", "Ocorrência", "Valor da ocorrência", "Observações"],
    report.map((r) => [r.code, r.room, r.unit, r.responsible_name, fmtDateTime(r.checkin_at), fmtDateTime(r.checkout_at), r.nights,
      (r.guests as { name: string }[]).map((g) => g.name).join(" | "), r.status, r.origin, fmtDateTime(r.created_at),
      r.inspection_ok === null ? "" : r.inspection_ok ? "OK" : `Com apontamentos: ${r.inspection_note ?? ""}`,
      r.tag_code ?? "", r.tag_returned ?? "", r.occurrence_status ?? "", r.occurrence_amount ?? "", r.checkout_note ?? r.cancel_reason ?? ""]),
  ));
}
