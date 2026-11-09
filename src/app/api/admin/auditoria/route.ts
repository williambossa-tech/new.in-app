import { apiAdmin } from "@/lib/api-auth";
import { csvResponse, toCsv } from "@/lib/csv";
import { asUser } from "@/lib/db";
import { fmtDateTimeSec } from "@/lib/format";

export async function GET() {
  const me = await apiAdmin();
  if (!me) return new Response("Acesso negado", { status: 403 });
  const rows = await asUser(me.id, (tx) => tx`select * from audit_log order by id`);
  return csvResponse("trilha-auditoria.csv", toCsv(
    ["#", "Data/hora (Curitiba)", "UTC", "Autor", "Ação", "Entidade", "Id", "Dados", "Hash anterior", "Hash"],
    rows.map((r) => [r.id, fmtDateTimeSec(r.at), new Date(r.at).toISOString(), r.actor_label, r.action, r.entity, r.entity_id, JSON.stringify(r.data), r.prev_hash, r.hash]),
  ));
}
