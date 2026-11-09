import { BookingBadge, Empty } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { asUser } from "@/lib/db";
import { Desistir } from "./Desistir";

export const metadata = { title: "Minhas reservas" };

const fmt = (d: Date, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", ...o }).format(d);
const dayNum = (d: Date) => fmt(d, { day: "2-digit" });
const mon = (d: Date) => fmt(d, { month: "short" }).replace(".", "");
const dm = (d: Date) => fmt(d, { day: "2-digit", month: "2-digit" });

export default async function MinhasReservas() {
  const me = await requireUser();
  const rows = await asUser(me.id, (tx) => tx`
    select b.code, b.status, b.kind, b.origin, lower(b.period) as ini, upper(b.period) as fim, b.lottery_stage_id,
           s.name as space, u.code as unit, b.responsible_name,
           c.code as campaign_code, c.status as campaign_status, r.reserve_revealed
    from bookings b join spaces s on s.id = b.space_id join units u on u.id = b.unit_id
    left join lottery_stages x on x.id = b.lottery_stage_id
    left join lottery_campaigns c on c.id = x.campaign_id
    left join lottery_rounds r on r.campaign_id = x.campaign_id and r.round = x.round
    where b.status not in ('cancelada', 'recusada')
    order by lower(b.period)`);
  return (
    <div className="space-y-8">
      <div>
        <h1 className="h1">Minhas reservas</h1>
        <p className="mt-2 text-noite-70">Reservas do seu apartamento.</p>
      </div>
      {rows.length === 0 ? (
        <div className="card"><Empty title="Nenhuma reserva por aqui" /></div>
      ) : (
        <div className="space-y-4">
          {rows.map((r) => {
            const last = new Date(+r.fim - 1);
            const canWithdraw = r.origin === "sorteio" && r.status === "confirmada" && r.campaign_status === "concluida" && !r.reserve_revealed && +r.ini > Date.now();
            return (
              <div key={r.code} className="card flex gap-5 p-6">
                <div className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-violeta-50 text-center leading-tight">
                  <span className="text-xs text-violeta-700">{mon(r.ini)}</span>
                  <span className="text-xl font-semibold text-violeta-700">{dayNum(r.ini)}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold">{r.space.split(" (")[0]}</p>
                    <BookingBadge status={r.status} />
                  </div>
                  <p className="mt-0.5 text-sm text-noite-50">
                    {dm(r.ini)} a {dm(last)} · Apto {r.unit}{r.origin === "sorteio" ? " · Sorteio de fim de ano" : ""}
                  </p>
                  {canWithdraw && <div className="mt-3"><Desistir campaign={r.campaign_code} stageId={r.lottery_stage_id} unit={r.unit} /></div>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
