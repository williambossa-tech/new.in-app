import "server-only";
import { asUser } from "../db";

export type BmgFilter = { from: string; to: string; room?: string; status?: string };

export async function bmgAdminData(userId: string, f: BmgFilter) {
  return asUser(userId, async (tx) => {
    const base = tx`
      select b.id, b.code, b.status, b.origin, b.created_at, s.code as room_code, s.name as room, u.code as unit,
             b.responsible_name, d.start_date, d.end_date, d.nights, d.terms_version, b.cancel_reason,
             lower(b.period) as checkin_at, upper(b.period) as checkout_at,
             o.inspection_ok, o.inspection_note, o.tag_code, o.checked_in_at, o.checked_out_at, o.tag_returned, o.checkout_note,
             o.occurrence_status, o.occurrence_amount, o.occurrence_note,
             coalesce((select json_agg(json_build_object('name', g.full_name, 'cpf', g.cpf, 'minor', g.is_minor) order by g.created_at)
                       from bmg_guests g where g.booking_id = b.id), '[]') as guests,
             (select count(*)::int from bmg_exceptions e where e.booking_id = b.id) as exceptions
      from bookings b join bmg_details d on d.booking_id = b.id join spaces s on s.id = b.space_id join units u on u.id = b.unit_id
      left join bmg_operations o on o.booking_id = b.id`;
    const pending = await tx`${base} where b.kind = 'bmg' and b.status = 'solicitada' order by d.start_date`;
    const ops = await tx`${base} where b.kind = 'bmg' and (b.status = 'em_uso' or (b.status = 'confirmada' and d.start_date <= current_date + 1)) order by d.start_date`;
    const occurrences = await tx`${base} where b.kind = 'bmg' and o.occurrence_status = 'pendente_validacao' order by o.checked_out_at`;
    const timeline = await tx`${base} where b.kind = 'bmg' and b.status not in ('cancelada', 'recusada')
                              and d.end_date >= current_date - 3 and d.start_date <= current_date + 45 order by d.start_date`;
    const report = await tx`${base} where b.kind = 'bmg' and d.start_date <= ${f.to} and d.end_date >= ${f.from}
                            and (${f.room ?? ""} = '' or s.code = ${f.room ?? ""})
                            and (${f.status ?? ""} = '' or b.status = ${f.status ?? ""})
                            order by d.start_date, s.sort_order`;
    const rooms = await tx`select code, name from spaces where kind = 'bmg_quarto' order by sort_order`;
    return { pending, ops, occurrences, timeline, report, rooms };
  });
}
