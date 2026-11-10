import { addDays, todayIso } from "@/lib/bmg/rules";
import { csvResponse, toCsv } from "@/lib/csv";
import { apiAdmin } from "@/lib/api-auth";
import { courtReport, isCourt } from "@/lib/quadras/service";

const ST: Record<string, string> = { confirmada: "Confirmado", solicitada: "Solicitado", recusada: "Rejeitado", cancelada: "Cancelado", em_uso: "Em uso", concluida: "Concluído" };

export async function GET(req: Request) {
  const me = await apiAdmin();
  if (!me) return new Response("Acesso negado", { status: 403 });
  const u = new URL(req.url);
  const q = u.searchParams.get("q") ?? "poli";
  if (!isCourt(q)) return new Response("Quadra inválida", { status: 400 });
  const from = u.searchParams.get("de") || addDays(todayIso(), -30), to = u.searchParams.get("ate") || addDays(todayIso(), 30);
  const r = await courtReport(me.id, q, from, to);
  return csvResponse(`quadra-${q}-${from}-a-${to}.csv`, toCsv(
    ["Código", "Data", "Início", "Fim", "Apartamento", "Responsável", "Modalidade", "Participantes", "Visitantes", "Atividade", "Situação", "Aprovação", "Observação"],
    r.linhas.map((x) => [x.code, x.dia, x.inicio, x.fim, x.unidade, x.responsavel, x.modalidade, x.participantes, x.visitantes,
      x.atividade === "jogo" ? "Jogo amistoso/organizado" : "Uso recreativo", x.status === "solicitada" && x.aprovacao === "pendente" ? "Pendente de aprovação" : ST[x.status] ?? x.status,
      x.aprovacao === "nao_requer" ? "" : x.aprovacao, x.observacao ?? ""]),
  ));
}
