import { getSessionUser } from "@/lib/auth";
import { addDays, todayIso } from "@/lib/bmg/rules";
import { csvResponse, toCsv } from "@/lib/csv";
import { cwAdminData } from "@/lib/cw/queries";
import { fmtDateTime } from "@/lib/format";

export async function GET(req: Request) {
  const me = await getSessionUser();
  if (!me || me.status !== "ativo" || !me.roles.includes("admin")) return new Response("Acesso negado", { status: 403 });
  const u = new URL(req.url);
  const from = u.searchParams.get("de") || addDays(todayIso(), -30);
  const to = u.searchParams.get("ate") || addDays(todayIso(), 14);
  const { report } = await cwAdminData(me.id, { from, to, day: todayIso() });
  return csvResponse(`coworking-${from}-a-${to}.csv`, toCsv(
    ["Reserva", "Sala", "Apartamento", "Responsável", "Início", "Fim", "Finalidade", "Convidados", "Situação", "Prorrogada", "Exceção", "Motivo da exceção", "Observações"],
    report.map((r) => [r.code, r.room, r.unit, r.responsible_name, fmtDateTime(r.ini), fmtDateTime(r.fim), r.purpose === "atendimento" ? "Atendimento" : "Uso pessoal",
      (r.guests as { name: string }[]).map((g) => g.name).join(" | "), r.status, r.extended ? "sim" : "", r.exception_status ?? "", r.exception_reason ?? "", r.cancel_reason ?? ""]),
  ));
}
