import { ComingSoon } from "@/components/ComingSoon";
import { OwlRules } from "@/components/OwlRules";
import { REGRAS } from "@/lib/voice/falas";
import { Corujinha } from "@/components/Corujinha";
import { BookingBadge } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { addDays, todayIso } from "@/lib/bmg/rules";
import { bmgAvailability, bmgSettings, firstStartDate } from "@/lib/bmg/service";
import { asUser } from "@/lib/db";
import { BmgPlanner } from "./BmgPlanner";
import { CancelBmg } from "./CancelBmg";

export const metadata = { title: "Be My Guest" };

const dm = (d: Date) => new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", weekday: "short", day: "2-digit", month: "2-digit" }).format(d).replace(".", "");

export default async function BeMyGuest() {
  const me = await requireUser();
  const admin = me.roles.includes("admin");
  const { settings, terms, mine } = await asUser(me.id, async (tx) => {
    const settings = await bmgSettings(tx);
    const [terms] = await tx`select version, body_md from terms_documents where kind = 'bmg' order by version desc limit 1`;
    const mine = await tx`
      select b.id, b.code, b.status, s.name as room, u.code as unit, d.start_date, d.end_date, d.nights, b.cancel_reason,
             coalesce((select json_agg(g.full_name order by g.created_at) from bmg_guests g where g.booking_id = b.id), '[]') as guests
      from bookings b join bmg_details d on d.booking_id = b.id join spaces s on s.id = b.space_id join units u on u.id = b.unit_id
      where b.kind = 'bmg' and (b.status in ('solicitada', 'confirmada', 'em_uso') or d.end_date >= current_date - 30)
      order by d.start_date desc limit 10`;
    return { settings, terms, mine };
  });

  if (!settings.open && !admin) {
    return <ComingSoon title="Be My Guest" pose="descanso" text="Reserve uma das suítes do 2º andar para receber seus convidados com conforto." />;
  }

  const minStart = firstStartDate(settings.advanceHours ?? 0);
  const maxDate = addDays(todayIso(), 120);
  const av = await bmgAvailability(me.id, todayIso(), maxDate);
  const today = todayIso();
  const eligibleUnits = me.units.filter((u) => ["proprietario", "locatario"].includes(u.relation));
  const active = mine.find((b) => ["solicitada", "confirmada", "em_uso"].includes(b.status));

  return (
    <div className="space-y-10">
      {!settings.open && admin && (
        <p className="rounded-2xl bg-amarelo-50 px-5 py-3 text-sm text-[#8a6100] ring-1 ring-[#ffe39a]">
          Visível só para a administração: as reservas ainda estão fechadas para os moradores.
        </p>
      )}
      <section className="relative overflow-hidden rounded-[28px] bg-gradient-to-br from-violeta to-violeta-700 px-7 py-9 text-white sm:px-10 sm:py-12">
        <div className="relative z-10 pr-20 sm:max-w-[62%] sm:pr-0">
          <p className="text-sm font-medium text-white/75">Suítes para convidados</p>
          <h1 className="mt-1 text-[1.8rem] font-semibold leading-tight tracking-[-0.02em] sm:text-[2.2rem]">Be My Guest</h1>
          <p className="mt-3 text-white/85">Entrada a partir das 18h · saída até as 12h · até 2 hóspedes · até 7 diárias</p>
        </div>
        <OwlRules falaId={REGRAS["be-my-guest"].id} texto={REGRAS["be-my-guest"].texto} titulo="Regras do Be My Guest" className="absolute -bottom-2 right-2 z-20 sm:right-6">
          <Corujinha pose="descanso" size={150} className="owl-bob h-[96px]! w-[96px]! sm:h-[150px]! sm:w-[150px]!" alt="" />
        </OwlRules>
      </section>

      {active ? (
        <section className="card relative overflow-hidden p-7 sm:p-9">
          <Corujinha pose={active.status === "solicitada" ? "dica" : "festa"} size={96} className="owl-bob absolute right-6 top-6 hidden sm:block" alt="" />
          <p className="text-sm font-medium text-violeta">
            {active.status === "solicitada" ? "Aguardando confirmação" : active.status === "confirmada" ? "Reserva confirmada" : "Hospedagem em andamento"}
          </p>
          <h2 className="h1 mt-1">{active.room}</h2>
          <div className="mt-5 flex flex-wrap gap-x-10 gap-y-3">
            <div><p className="text-sm text-noite-50">Entrada</p><p className="font-semibold">{dm(active.start_date)} · 18h</p></div>
            <div><p className="text-sm text-noite-50">Saída</p><p className="font-semibold">{dm(active.end_date)} · 12h</p></div>
            <div><p className="text-sm text-noite-50">Diárias</p><p className="font-semibold">{active.nights}</p></div>
          </div>
          <p className="mt-4 text-sm text-noite-70">Hóspedes: {(active.guests as string[]).join(" e ")}</p>
          <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-2">
            <a href={`/minhas-reservas/${active.code}`} className="btn-secondary btn-sm">Ver detalhes e comprovante</a>
            {["solicitada", "confirmada"].includes(active.status) && <CancelBmg id={active.id} />}
          </div>
        </section>
      ) : eligibleUnits.length === 0 ? (
        <section className="card flex items-center gap-5 p-7">
          <Corujinha pose="dica" size={72} alt="" />
          <p className="text-noite-70">A reserva do Be My Guest é feita pelo proprietário ou locatário do apartamento.</p>
        </section>
      ) : (
        <BmgPlanner
          rooms={av.rooms.map((r) => ({ ...r, busyTonight: (av.busy[r.code] ?? []).includes(today) }))}
          busy={av.busy}
          minStart={minStart}
          maxDate={maxDate}
          units={eligibleUnits.map((u) => ({ id: u.id, code: u.code }))}
          termsMd={terms.body_md}
          termsVersion={terms.version}
        />
      )}

      {mine.filter((b) => b.id !== active?.id).length > 0 && (
        <section>
          <h2 className="h2 mb-4">Reservas anteriores</h2>
          <div className="space-y-4">
            {mine.filter((b) => b.id !== active?.id).map((b) => (
              <div key={b.id} className="card p-6">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold">{b.room}</p>
                  <BookingBadge status={b.status} />
                </div>
                <p className="mt-1 text-sm text-noite-70">
                  {dm(b.start_date)} às 18h → {dm(b.end_date)} até 12h · {b.nights} {b.nights === 1 ? "diária" : "diárias"} · Apto {b.unit}
                </p>
                <p className="mt-1 text-sm text-noite-50">Hóspedes: {(b.guests as string[]).join(" e ")}</p>
                {b.status === "recusada" && b.cancel_reason && <p className="mt-1 text-sm text-noite-50">{b.cancel_reason}</p>}
                {["solicitada", "confirmada"].includes(b.status) && <div className="mt-3"><CancelBmg id={b.id} /></div>}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
