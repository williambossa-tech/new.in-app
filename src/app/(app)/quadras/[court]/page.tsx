import Link from "next/link";
import { notFound } from "next/navigation";
import { cancelarQuadraAction } from "@/app/actions/quadras";
import { CancelWithReason } from "@/components/CancelWithReason";
import { Corujinha } from "@/components/Corujinha";
import { OwlRules } from "@/components/OwlRules";
import { CourtArt } from "@/components/SportsArt";
import { requireUser } from "@/lib/auth";
import { asUser } from "@/lib/db";
import { COURTS, courtCalendar, courtSettings, isCourt, localDay } from "@/lib/quadras/service";
import { REGRAS } from "@/lib/voice/falas";
import { CourtBookForm } from "./CourtBookForm";
import { CourtCalendar, rangeFor, type View } from "./CourtCalendar";

export const dynamic = "force-dynamic";

const hm = (d: Date) => new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" }).format(d);
const dLong = (d: Date) => new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "short", day: "2-digit", month: "2-digit" }).format(d).replace(".", "");
const addDays = (d: string, n: number) => { const x = new Date(`${d}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };

export async function generateMetadata({ params }: { params: Promise<{ court: string }> }) {
  const { court } = await params;
  return { title: isCourt(court) ? COURTS[court].name : "Quadra" };
}

export default async function Quadra({ params, searchParams }: { params: Promise<{ court: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { court } = await params;
  if (!isCourt(court)) notFound();
  const sp = await searchParams;
  const me = await requireUser();
  const today = localDay(new Date());
  const view: View = sp.v === "semana" || sp.v === "mes" ? sp.v : "dia";
  const day = /^\d{4}-\d{2}-\d{2}$/.test(sp.d ?? "") ? sp.d! : today;
  const { from, to } = rangeFor(view, day);
  const name = COURTS[court].name;

  const [cal, ahead, data] = await Promise.all([
    courtCalendar(me.id, court, from, to),
    courtCalendar(me.id, court, today, addDays(today, 60)),
    asUser(me.id, async (tx) => {
      const settings = await courtSettings(tx, court);
      const [t] = await tx`select body_md from terms_documents where kind = 'quadras' order by version desc limit 1`;
      const mine = await tx`
        select b.id, b.code, b.status, lower(b.period) as ini, upper(b.period) as fim, u.code as unit, d.modality, d.participants, d.visitors,
               d.approval, d.decision_note, b.cancel_reason
        from bookings b join court_details d on d.booking_id = b.id join units u on u.id = b.unit_id join spaces s on s.id = b.space_id
        where s.code = ${COURTS[court].code} and b.unit_id in (select app.my_unit_ids()) and lower(b.period) > now() - interval '60 days'
        order by lower(b.period) desc`;
      return { settings, terms: t.body_md as string, mine };
    }),
  ]);
  const upcoming = data.mine.filter((b) => +new Date(b.fim) > Date.now() && ["solicitada", "confirmada", "em_uso"].includes(b.status)).reverse();
  const past = data.mine.filter((b) => !upcoming.includes(b));
  const statusOf = (b: { status?: string; approval?: string }) =>
    b.status === "confirmada" ? ["badge-verde", "Confirmado"] : b.status === "solicitada" ? (b.approval === "pendente" ? ["badge-amarelo", "Pendente de aprovação"] : ["badge-amarelo", "Solicitado"])
    : b.status === "recusada" ? ["badge-coral", "Rejeitado"] : b.status === "cancelada" ? ["badge-cinza", "Cancelado"] : ["badge-cinza", "Concluído"];

  return (
    <div className="space-y-8">
      <section className={`relative overflow-hidden rounded-[28px] px-7 py-9 text-white sm:px-10 sm:py-12 ${court === "areia" ? "bg-gradient-to-br from-[#f0a93b] to-[#d9822b]" : "bg-gradient-to-br from-[#2f7de1] to-[#1f5fc0]"}`}>
        <div className="relative z-10 pr-24 sm:max-w-[60%] sm:pr-0">
          <p className="text-sm font-medium text-white/80">Esportes</p>
          <h1 className="mt-1 text-[1.8rem] font-semibold leading-tight tracking-[-0.02em] sm:text-[2.2rem]">{name}</h1>
          <p className="mt-3 text-white/90">08h00 às 22h00 · uso compartilhado</p>
        </div>
        <CourtArt kind={court} className="pointer-events-none absolute -right-10 bottom-0 hidden w-72 opacity-90 sm:block" />
        <OwlRules falaId={REGRAS.quadras.id} texto={REGRAS.quadras.texto} titulo={`Regras da ${name.toLowerCase().replace("quadra", "quadra")}`} className="absolute -bottom-2 right-2 z-20 sm:right-48">
          <Corujinha pose="aponta" size={120} className="owl-bob h-[92px]! w-[92px]! sm:h-[120px]! sm:w-[120px]!" alt="" />
        </OwlRules>
      </section>

      <div className="flex gap-2">
        <Link href={`/quadras/${court === "poli" ? "areia" : "poli"}`} className="btn-secondary btn-sm">Ver {court === "poli" ? "Quadra de Areia" : "Quadra Poliesportiva"}</Link>
        <a href="#meus" className="btn-ghost btn-sm">Meus agendamentos</a>
      </div>

      <CourtCalendar court={court} view={view} day={day} today={today} items={cal.items} admin={cal.admin} />

      {me.units.length ? (
        <CourtBookForm key={`${day}-${sp.inicio ?? ""}`} court={court} courtName={name} today={today} initialDay={day < today ? today : day} initialStart={sp.inicio}
          modalidades={data.settings.modalidades} duracao={data.settings.duracao} consecutivos={data.settings.consecutivosMin}
          busy={ahead.items.map((i) => ({ day: i.day, start: i.start, end: i.end, kind: i.kind, title: i.title }))}
          units={me.units.map((u) => ({ id: u.id, code: u.code }))} terms={data.terms} />
      ) : (
        <section className="card p-7 text-noite-70">Seu cadastro ainda não tem apartamento vinculado.</section>
      )}

      <section id="meus" className="scroll-mt-24 space-y-4">
        <h2 className="h2">Meus agendamentos</h2>
        {upcoming.length === 0 && <p className="text-sm text-noite-50">Nenhum agendamento futuro nesta quadra.</p>}
        {upcoming.map((b) => {
          const [cls, lbl] = statusOf(b);
          return (
            <div key={b.id} className="card p-6">
              <div className="flex flex-wrap items-center gap-2"><p className="font-semibold">{dLong(b.ini)} · {hm(b.ini)}–{hm(b.fim)}</p><span className={cls}>{lbl}</span></div>
              <p className="mt-1 text-sm text-noite-70">{b.modality} · {b.participants} participantes{b.visitors ? ` · ${b.visitors} visitantes` : ""} · Apto {b.unit}</p>
              {b.decision_note && <p className="mt-1 text-sm text-noite-50">Administração: {b.decision_note}</p>}
              <div className="mt-3"><CancelWithReason id={b.id} action={cancelarQuadraAction} label="Cancelar agendamento" hint="O horário fica livre para outros moradores." /></div>
            </div>
          );
        })}
        {past.length > 0 && (
          <details className="card p-6">
            <summary className="cursor-pointer text-sm font-medium text-noite-70">Anteriores e cancelados ({past.length})</summary>
            <ul className="mt-4 divide-y divide-linha">
              {past.map((b) => {
                const [cls, lbl] = statusOf(b);
                return (
                  <li key={b.id} className="flex flex-wrap items-center gap-2 py-3 text-sm">
                    <span className="font-medium">{dLong(b.ini)} · {hm(b.ini)}–{hm(b.fim)}</span><span className="text-noite-50">{b.modality}</span><span className={cls}>{lbl}</span>
                    {b.cancel_reason && <span className="w-full text-xs text-noite-50">{b.cancel_reason}</span>}
                  </li>
                );
              })}
            </ul>
          </details>
        )}
      </section>
    </div>
  );
}
