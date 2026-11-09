import { cancelarCwAction, prorrogarCwAction } from "@/app/actions/cw";
import { CancelWithReason } from "@/components/CancelWithReason";
import { ComingSoon } from "@/components/ComingSoon";
import { ActionForm, SubmitButton } from "@/components/forms";
import { OwlAtWork } from "@/components/OwlAtWork";
import { BookingBadge } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { addDays, todayIso } from "@/lib/bmg/rules";
import { cwAvailability, cwSettings, weekUsage } from "@/lib/cw/service";
import { asUser } from "@/lib/db";
import { CwPlanner } from "./CwPlanner";

export const metadata = { title: "Coworking" };

const hm = (d: Date) => new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" }).format(d);
const dLong = (d: Date) => new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "short", day: "2-digit", month: "2-digit" }).format(d).replace(".", "");
const mondayOf = (d: string) => { const x = new Date(`${d}T12:00:00Z`); x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7)); return x.toISOString().slice(0, 10); };

export default async function Coworking() {
  const me = await requireUser();
  const admin = me.roles.includes("admin");
  const today = todayIso();
  const days = Array.from({ length: 14 }, (_, i) => addDays(today, i));
  const units = me.units;
  const { settings, mine, usage } = await asUser(me.id, async (tx) => {
    const settings = await cwSettings(tx);
    const mine = await tx`
      select b.id, b.code, b.status, s.name as room, u.code as unit, lower(b.period) as ini, upper(b.period) as fim, d.purpose, d.extended,
             d.exception_status, b.cancel_reason,
             coalesce((select json_agg(g.full_name order by g.created_at) from cw_guests g where g.booking_id = b.id), '[]') as guests
      from bookings b join cw_details d on d.booking_id = b.id join spaces s on s.id = b.space_id join units u on u.id = b.unit_id
      where b.kind = 'coworking' and upper(b.period) > now() - interval '1 day' and b.status not in ('cancelada')
      order by lower(b.period)`;
    const usage: Record<string, Awaited<ReturnType<typeof weekUsage>>> = {};
    if (units[0]) for (const w of [...new Set(days.map(mondayOf))]) usage[w] = await weekUsage(tx, units[0].id, w);
    return { settings, mine, usage };
  });

  if (!settings.open && !admin) {
    return <ComingSoon title="Coworking" pose="silencio" text="Agende a sala de reuniões ou a mini sala para trabalhar e receber seus convidados." art={<OwlAtWork size={230} />} />;
  }
  const av = await cwAvailability(me.id, days[0], days[days.length - 1]);

  return (
    <div className="space-y-10">
      <section className="relative overflow-hidden rounded-[28px] bg-gradient-to-br from-turquesa to-[#0e8c80] px-7 py-9 text-white sm:px-10 sm:py-12">
        <div className="relative z-10 sm:max-w-[60%]">
          <p className="text-sm font-medium text-white/80">Trabalhe e receba seus convidados</p>
          <h1 className="mt-1 text-[1.8rem] font-semibold leading-tight tracking-[-0.02em] sm:text-[2.2rem]">Coworking</h1>
          <p className="mt-3 text-white/90">24 horas · até 2h por reserva · 1 reserva por dia</p>
        </div>
        <div className="absolute -bottom-3 right-4 hidden sm:block"><OwlAtWork size={190} /></div>
      </section>

      {mine.filter((b) => +new Date(b.fim) > Date.now()).length > 0 && (
        <section>
          <h2 className="h2 mb-4">Minhas próximas reservas</h2>
          <div className="space-y-4">
            {mine.filter((b) => +new Date(b.fim) > Date.now()).map((b) => (
              <div key={b.id} className="card p-6">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold">{b.room}</p>
                  {b.exception_status === "pendente" ? <span className="badge-amarelo">Exceção em análise</span> : <BookingBadge status={b.status} />}
                  {b.extended && <span className="badge-violeta">Prorrogada</span>}
                </div>
                <p className="mt-1 text-sm text-noite-70">{dLong(b.ini)} · {hm(b.ini)}–{hm(b.fim)} · Apto {b.unit}</p>
                {(b.guests as string[]).length > 0 && <p className="text-sm text-noite-50">Convidados: {(b.guests as string[]).join(", ")}</p>}
                {b.status === "recusada" && <p className="mt-1 text-sm text-noite-50">{b.cancel_reason}</p>}
                <div className="mt-4 flex flex-wrap items-start gap-x-6 gap-y-3">
                  {["confirmada", "em_uso"].includes(b.status) && !b.extended && (
                    <ActionForm action={prorrogarCwAction} className="space-y-2">
                      <input type="hidden" name="booking_id" value={b.id} />
                      <SubmitButton className="btn-secondary btn-sm" pendingText="Prorrogando…">Prorrogar +1h</SubmitButton>
                    </ActionForm>
                  )}
                  {["solicitada", "confirmada"].includes(b.status) && <CancelWithReason id={b.id} action={cancelarCwAction} hint="A sala fica livre para outros moradores." />}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {units.length ? (
        <CwPlanner rooms={av.rooms} busy={av.busy} days={days} advanceMin={settings.advanceMin ?? 0}
          units={units.map((u) => ({ id: u.id, code: u.code }))} usage={usage} />
      ) : (
        <section className="card p-7 text-noite-70">Seu cadastro ainda não tem apartamento vinculado.</section>
      )}
    </div>
  );
}
