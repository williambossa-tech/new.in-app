import "server-only";
import { asUser } from "../db";

export async function cwAdminData(userId: string, f: { from: string; to: string; day: string }) {
  return asUser(userId, async (tx) => {
    const base = tx`
      select b.id, b.code, b.status, b.created_at, s.code as room_code, s.name as room, u.code as unit, b.responsible_name,
             b.local_day, lower(b.period) as ini, upper(b.period) as fim, d.purpose, d.extended, d.exception_status, d.exception_reason,
             d.exception_limit, d.exception_note, b.cancel_reason,
             coalesce((select json_agg(json_build_object('name', g.full_name, 'cpf', g.cpf) order by g.created_at) from cw_guests g where g.booking_id = b.id), '[]') as guests
      from bookings b join cw_details d on d.booking_id = b.id join spaces s on s.id = b.space_id join units u on u.id = b.unit_id`;
    const pending = await tx`${base} where b.kind = 'coworking' and d.exception_status = 'pendente' and b.status = 'solicitada' order by lower(b.period)`;
    const dayRows = await tx`${base} where b.kind = 'coworking' and b.local_day = ${f.day} and b.status not in ('cancelada', 'recusada') order by lower(b.period)`;
    const report = await tx`${base} where b.kind = 'coworking' and b.local_day between ${f.from} and ${f.to} order by lower(b.period)`;
    const weekly = await tx`
      select x.unit, x.week,
             count(*) filter (where x.status in ('confirmada','em_uso','concluida'))::int as reservas,
             count(distinct x.local_day) filter (where x.purpose = 'atendimento' and x.status in ('confirmada','em_uso','concluida'))::int as dias_atendimento,
             (select count(distinct g.cpf)::int from cw_guests g join bookings b2 on b2.id = g.booking_id
              where b2.unit_id = x.unit_id and b2.kind = 'coworking' and b2.status in ('confirmada','em_uso','concluida')
                and date_trunc('week', b2.local_day)::date = x.week) as convidados,
             round(sum(x.hours) filter (where x.status in ('confirmada','em_uso','concluida'))::numeric, 1) as horas
      from (select b.unit_id, b.status, b.local_day, d.purpose, u.code as unit, date_trunc('week', b.local_day)::date as week,
                   extract(epoch from upper(b.period) - lower(b.period)) / 3600 as hours
            from bookings b join cw_details d on d.booking_id = b.id join units u on u.id = b.unit_id
            where b.kind = 'coworking' and b.local_day between ${f.from} and ${f.to}) x
      group by x.unit, x.unit_id, x.week order by x.week desc, horas desc nulls last`;
    const rooms = await tx`select code, name, capacity from spaces where kind in ('cowork_reunioes', 'cowork_mini') order by sort_order`;
    return { pending, dayRows, report, weekly, rooms };
  });
}
