import { BookingBadge, Empty, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { asUser } from "@/lib/db";
import { fmtDateTime } from "@/lib/format";

export const metadata = { title: "Minhas reservas" };

export default async function MinhasReservas() {
  const me = await requireUser();
  const rows = await asUser(me.id, (tx) => tx`
    select b.code, b.status, b.kind, b.origin, lower(b.period) as ini, upper(b.period) as fim, b.fee_status, b.notes,
           s.name as space, u.code as unit, b.responsible_name
    from bookings b join spaces s on s.id = b.space_id join units u on u.id = b.unit_id
    order by lower(b.period) desc`);
  return (
    <>
      <PageHeader eyebrow="Seu apartamento" title="Minhas reservas">Reservas de todos os moradores vinculados ao seu apartamento.</PageHeader>
      {rows.length === 0 ? (
        <div className="card"><Empty title="Nenhuma reserva por enquanto">Quando houver reservas do seu apartamento, elas aparecem aqui.</Empty></div>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => (
            <div key={r.code} className="card p-5">
              <div className="flex flex-wrap items-center gap-2">
                <BookingBadge status={r.status} />
                {r.origin === "sorteio" && <span className="badge-violeta">Sorteio</span>}
                <span className="ml-auto text-xs text-noite-50">Reserva {r.code}</span>
              </div>
              <p className="mt-2 text-lg font-black">{r.space}</p>
              <p className="muted">Apto {r.unit} · {fmtDateTime(r.ini)} até {fmtDateTime(r.fim)}</p>
              {r.responsible_name && <p className="text-sm muted">Responsável: {r.responsible_name}</p>}
              {r.fee_status === "pendente_definicao" && <p className="mt-2 text-sm"><span className="badge-amarelo">Taxa pendente de definição</span></p>}
              {r.notes && <p className="mt-2 text-sm text-noite-50">{r.notes}</p>}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
