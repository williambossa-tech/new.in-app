import { apiAdmin } from "@/lib/api-auth";
import { csvResponse, toCsv } from "@/lib/csv";
import { asUser } from "@/lib/db";
import { fmtDateTime } from "@/lib/format";

export async function GET(_: Request, { params }: { params: Promise<{ code: string }> }) {
  const me = await apiAdmin();
  if (!me) return new Response("Acesso negado", { status: 403 });
  const { code } = await params;
  const rows = await asUser(me.id, (tx) => tx`
    select u.code as unit, p.label as period, s.name as space, e.applicant_name, e.contact, e.origin, e.created_at, e.email_received_at,
           e.terms_version, e.status, e.status_reason, l.full_name as launched_by
    from lottery_entries e join lottery_campaigns c on c.id = e.campaign_id join units u on u.id = e.unit_id
    join lottery_periods p on p.id = e.period_id join spaces s on s.id = e.space_id left join users l on l.id = e.launched_by
    where c.code = ${code} order by u.floor, u.final, p.sort, s.sort_order`);
  return csvResponse(`inscricoes-${code}.csv`, toCsv(
    ["Apartamento", "Período", "Salão", "Interessado", "Contato", "Origem", "Registrada em", "E-mail recebido em", "Versão do termo", "Situação", "Motivo", "Lançada por"],
    rows.map((r) => [r.unit, r.period, r.space, r.applicant_name, r.contact, r.origin === "email" ? "E-mail" : "Aplicativo",
      fmtDateTime(r.created_at), r.email_received_at ? fmtDateTime(r.email_received_at) : "", r.terms_version, r.status, r.status_reason, r.launched_by]),
  ));
}
