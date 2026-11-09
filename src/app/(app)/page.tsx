import Link from "next/link";
import { Corujinha } from "@/components/Corujinha";
import { requireUser } from "@/lib/auth";
import { asUser } from "@/lib/db";
import { fmtDate, fmtDateTime } from "@/lib/format";

const STATUS_TEXT: Record<string, string> = {
  rascunho: "Em breve",
  inscricoes_abertas: "Inscrições abertas",
  inscricoes_encerradas: "Inscrições encerradas",
  congelada: "Sorteio em breve",
  em_sorteio: "Sorteio acontecendo agora",
  concluida: "Resultado disponível",
};

export default async function Inicio() {
  const me = await requireUser();
  const data = await asUser(me.id, async (tx) => {
    const campaigns = await tx`select code, title, status, registration_deadline_date, registration_deadline, draw_date, draw_at
                               from lottery_campaigns c where status <> 'cancelada' order by created_at desc`;
    const bookings = await tx`select count(*)::int as n from bookings where status in ('solicitada','confirmada','em_uso') and upper(period) > now()`;
    const ps = await tx`select key, status, value from parameters where key in ('bmg.abertura', 'cw.abertura')`;
    const open = (k: string) => { const r = ps.find((x) => x.key === k); return r?.status === "definido" && r?.value?.ativo === true; };
    return { campaigns, upcoming: bookings[0].n as number, bmgOpen: open("bmg.abertura"), cwOpen: open("cw.abertura") };
  });
  const firstName = me.fullName.split(" ")[0];
  const camp = data.campaigns[0];
  const hour = Number(new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "numeric", hour12: false }).format(new Date()));
  const greet = hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite";

  return (
    <div className="space-y-10">
      <section className="relative overflow-hidden rounded-[28px] bg-gradient-to-br from-violeta-50 via-white to-white px-7 py-9 ring-1 ring-linha sm:px-10 sm:py-12">
        <div className="relative z-10 max-w-[60%] sm:max-w-[65%]">
          <p className="text-noite-50">{greet},</p>
          <h1 className="h1 mt-1">{firstName}</h1>
          <p className="mt-3 text-noite-70">
            {me.units.length ? <>Apartamento {me.units.map((u) => u.code).join(" · ")}</> : <>Bem-vindo à comunidade NEW.IN</>}
          </p>
        </div>
        <Corujinha pose="ola" size={160} className="owl-bob absolute -bottom-2 right-3 sm:right-10" alt="" />
      </section>

      {camp && (
        <section>
          <h2 className="mb-4 text-sm font-medium text-noite-50">Acontecendo</h2>
          <Link href={`/sorteios/${camp.code}`} className="card group flex items-center gap-5 p-6 transition hover:shadow-lg sm:p-7">
            <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-coral-50 text-2xl">🎄</div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-violeta">{STATUS_TEXT[camp.status] ?? ""}</p>
              <p className="mt-0.5 text-[1.05rem] font-semibold leading-snug">{camp.title}</p>
              <p className="mt-1 text-sm text-noite-50">
                {camp.status === "inscricoes_abertas"
                  ? <>Inscrições até {camp.registration_deadline ? fmtDateTime(camp.registration_deadline).replace(",", " às") : fmtDate(camp.registration_deadline_date)}</>
                  : <>Sorteio em {fmtDate(camp.draw_date)}</>}
              </p>
            </div>
            <span className="text-xl text-noite-50 transition group-hover:translate-x-1 group-hover:text-violeta">›</span>
          </Link>
        </section>
      )}

      <section>
        <h2 className="mb-4 text-sm font-medium text-noite-50">Espaços</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <ModuleCard href="/be-my-guest" emoji="🛏️" title="Be My Guest" text="Suítes para seus convidados" soon={!data.bmgOpen} />
          <ModuleCard href="/coworking" emoji="💼" title="Coworking" text="Sala de reuniões e mini sala" soon={!data.cwOpen} />
          <ModuleCard href="/minhas-reservas" emoji="📅" title="Minhas reservas"
            text={data.upcoming ? `${data.upcoming} ${data.upcoming === 1 ? "reserva futura" : "reservas futuras"}` : "Suas reservas em um só lugar"} />
        </div>
      </section>
    </div>
  );
}

function ModuleCard({ href, emoji, title, text, soon }: { href: string; emoji: string; title: string; text: string; soon?: boolean }) {
  return (
    <Link href={href} className="card block p-6 transition hover:shadow-lg">
      <div className="flex items-start justify-between">
        <span className="grid h-11 w-11 place-items-center rounded-2xl bg-violeta-50 text-xl">{emoji}</span>
        {soon && <span className="text-xs font-medium text-noite-50">Em breve</span>}
      </div>
      <p className="mt-5 font-semibold">{title}</p>
      <p className="mt-0.5 text-sm text-noite-50">{text}</p>
    </Link>
  );
}
