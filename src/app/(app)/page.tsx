import Link from "next/link";
import { Corujinha } from "@/components/Corujinha";
import { CampaignBadge } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { asUser } from "@/lib/db";
import { fmtDate, fmtDateTime, RELATION_LABEL } from "@/lib/format";

export default async function Inicio() {
  const me = await requireUser();
  const data = await asUser(me.id, async (tx) => {
    const campaigns = await tx`select code, title, status, registration_deadline_date, registration_deadline, draw_date
                               from lottery_campaigns c where status <> 'cancelada' order by created_at desc`;
    const bookings = await tx`select count(*)::int as n from bookings where status in ('solicitada','confirmada','em_uso') and upper(period) > now()`;
    return { campaigns, upcoming: bookings[0].n as number };
  });
  const firstName = me.fullName.split(" ")[0];
  const camp = data.campaigns[0];
  const hour = Number(new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "numeric", hour12: false }).format(new Date()));
  const greet = hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite";

  return (
    <div className="space-y-6">
      <section className="card relative overflow-hidden bg-gradient-to-br from-white to-violeta-50 p-6 sm:p-8">
        <div className="relative z-10 max-w-[62%] sm:max-w-[70%]">
          <p className="eyebrow">{greet}, {firstName}!</p>
          <h1 className="h1 mt-1">O que você quer reservar hoje?</h1>
          <p className="mt-2 muted">
            {me.units.length
              ? <>Apartamento {me.units.map((u) => `${u.code} (${RELATION_LABEL[u.relation]?.toLowerCase()})`).join(", ")}.</>
              : <>Seu cadastro ainda não tem apartamento vinculado. Fale com a administração.</>}
          </p>
        </div>
        <Corujinha pose="ola" size={170} className="owl-bob absolute -bottom-3 right-2 sm:right-8" alt="" />
      </section>

      {camp && (
        <Link href={`/sorteios/${camp.code}`} className="card group flex items-center gap-4 overflow-hidden p-5 transition hover:ring-violeta sm:p-6">
          <div className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-coral-50 text-3xl">🎄</div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2"><CampaignBadge status={camp.status} /></div>
            <p className="mt-1 text-lg font-black leading-snug">{camp.title}</p>
            <p className="text-sm muted">
              Inscrições até {fmtDate(camp.registration_deadline_date)} · Sorteio em {fmtDate(camp.draw_date)}
              {camp.status === "inscricoes_abertas" && camp.registration_deadline && <> · encerra {fmtDateTime(camp.registration_deadline)}</>}
            </p>
          </div>
          <span className="hidden text-2xl text-violeta transition group-hover:translate-x-1 sm:block">→</span>
        </Link>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <ModuleCard href="/be-my-guest" emoji="🛏️" title="Be My Guest" text="Quartos para hospedar seus convidados." tag="Em preparação" />
        <ModuleCard href="/coworking" emoji="💼" title="Coworking" text="Sala de reuniões e mini sala." tag="Em preparação" />
        <ModuleCard href="/minhas-reservas" emoji="📅" title="Minhas reservas"
          text={data.upcoming ? `${data.upcoming} reserva(s) futura(s) do seu apartamento.` : "Acompanhe as reservas do seu apartamento."} />
      </div>
    </div>
  );
}

function ModuleCard({ href, emoji, title, text, tag }: { href: string; emoji: string; title: string; text: string; tag?: string }) {
  return (
    <Link href={href} className="card block p-5 transition hover:ring-violeta">
      <div className="flex items-center justify-between">
        <span className="grid h-12 w-12 place-items-center rounded-2xl bg-violeta-50 text-2xl">{emoji}</span>
        {tag && <span className="badge-cinza">{tag}</span>}
      </div>
      <p className="mt-3 text-lg font-black">{title}</p>
      <p className="text-sm muted">{text}</p>
    </Link>
  );
}
