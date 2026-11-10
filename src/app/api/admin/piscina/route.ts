import { csvResponse, toCsv } from "@/lib/csv";
import { apiAdmin } from "@/lib/api-auth";
import { poolAdminList } from "@/lib/piscina/service";

/** Relatório cadastral (não é registro de presença). Documento não é exportado (LGPD). */
export async function GET(req: Request) {
  const me = await apiAdmin();
  if (!me) return new Response("Acesso negado", { status: 403 });
  const u = new URL(req.url);
  const f = { from: u.searchParams.get("de") || undefined, to: u.searchParams.get("ate") || undefined, unit: u.searchParams.get("unidade") || undefined,
    q: u.searchParams.get("nome") || undefined, status: u.searchParams.get("situacao") || undefined };
  const rows = await poolAdminList(me.id, f);
  return csvResponse(`piscina-convidados-cadastrados.csv`, toCsv(
    ["Data prevista", "Apartamento", "Convidado", "Menor de idade", "Documento", "Responsável", "Situação", "Motivo do cancelamento", "Cadastrado em", "Aceite do termo", "Versão do termo"],
    rows.map((r) => [r.date.split("-").reverse().join("/"), r.unit, r.full_name, r.is_minor ? "sim" : "", r.document ? "informado" : "", r.responsavel,
      r.status === "ativo" ? "Cadastrado" : "Cancelado", r.cancel_reason ?? "", r.created, r.aceite, r.termo_versao]),
  ));
}
