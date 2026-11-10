import { cancelarConvidadoAction } from "@/app/actions/piscina";
import { CancelWithReason } from "@/components/CancelWithReason";
import { Corujinha } from "@/components/Corujinha";
import { OwlRules } from "@/components/OwlRules";
import { PoolArt } from "@/components/SportsArt";
import { requireUser } from "@/lib/auth";
import { asUser } from "@/lib/db";
import { myPoolGuests, poolSettings, poolTerms } from "@/lib/piscina/service";
import { REGRAS } from "@/lib/voice/falas";
import { PoolForm } from "./PoolForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Piscina — Convidados" };

const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
const longDate = (d: string) => new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "2-digit", month: "long", timeZone: "UTC" }).format(new Date(`${d}T12:00:00Z`));

export default async function Piscina({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const me = await requireUser();
  const { settings, terms } = await asUser(me.id, async (tx) => ({ settings: await poolSettings(tx), terms: await poolTerms(tx) }));
  const rows = await myPoolGuests(me.id);
  const t = today();
  const active = rows.filter((r) => r.status === "ativo" && r.date >= t);
  const dates = [...new Set(active.map((r) => r.date))].sort();
  const history = rows.filter((r) => !(r.status === "ativo" && r.date >= t));
  const editDate = /^\d{4}-\d{2}-\d{2}$/.test(sp.data ?? "") && sp.data! >= t ? sp.data! : t;

  return (
    <div className="space-y-8">
      <section className="relative overflow-hidden rounded-[28px] bg-gradient-to-br from-[#1fb3d1] to-[#1287b3] px-7 py-9 text-white sm:px-10 sm:py-12">
        <div className="relative z-10 pr-24 sm:max-w-[58%] sm:pr-0">
          <p className="text-sm font-medium text-white/80">Lazer</p>
          <h1 className="mt-1 text-[1.8rem] font-semibold leading-tight tracking-[-0.02em] sm:text-[2.2rem]">Piscina — Convidados</h1>
          <p className="mt-3 text-white/90">05h00 às 24h00 · sem reserva · até {settings.simultaneos} convidados por vez, com você presente</p>
        </div>
        <PoolArt className="pointer-events-none absolute -right-10 bottom-0 hidden w-72 opacity-90 sm:block" />
        <OwlRules falaId={REGRAS.piscina.id} texto={REGRAS.piscina.texto} titulo="Regras da piscina" className="absolute -bottom-2 right-2 z-20 sm:right-48">
          <Corujinha pose="ola" size={120} className="owl-bob h-[92px]! w-[92px]! sm:h-[120px]! sm:w-[120px]!" alt="" />
        </OwlRules>
      </section>

      <div className="flex items-start gap-4 rounded-[22px] bg-turquesa-50 p-5 text-sm text-noite-70 ring-1 ring-turquesa/30">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white text-lg font-semibold text-[#0e7f74]">{settings.simultaneos}</span>
        <p>Somente <b>{settings.simultaneos} convidados</b> do seu apartamento podem usar a piscina ao mesmo tempo, sempre acompanhados por você. O cadastro não é reserva e não garante exclusividade.</p>
      </div>

      {me.units.length ? (
        <PoolForm key={editDate} today={t} initialDate={editDate} docMode={settings.documento} limiteDiario={settings.limiteDiario} terms={terms.text}
          units={me.units.map((u) => ({ id: u.id, code: u.code }))}
          existing={active.map((r) => ({ id: r.id, date: r.date, name: r.full_name, document: r.document ?? "", minor: r.is_minor }))} />
      ) : (
        <section className="card p-7 text-noite-70">Seu cadastro ainda não tem apartamento vinculado.</section>
      )}

      <section id="meus" className="scroll-mt-24 space-y-4">
        <h2 className="h2">Meus cadastros</h2>
        {dates.length === 0 && <p className="text-sm text-noite-50">Nenhum convidado cadastrado para os próximos dias.</p>}
        {dates.map((d) => (
          <div key={d} className="card p-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-semibold capitalize">{longDate(d)}</p>
              <a href={`/piscina?data=${d}#cadastro`} className="text-sm font-medium text-violeta-700">Editar</a>
            </div>
            <ul className="mt-3 space-y-3">
              {active.filter((r) => r.date === d).map((r) => (
                <li key={r.id} className="rounded-2xl bg-fundo p-4">
                  <p className="font-medium">{r.full_name}{r.is_minor ? <span className="badge-amarelo ml-2">Menor de idade</span> : null}</p>
                  <p className="text-xs text-noite-50">Apto {r.unit}{r.document ? " · documento informado" : ""}</p>
                  <div className="mt-2"><CancelWithReason id={r.id} action={cancelarConvidadoAction} label="Cancelar cadastro" hint="O convidado sai da lista desta data." /></div>
                </li>
              ))}
            </ul>
          </div>
        ))}
        {history.length > 0 && (
          <details className="card p-6">
            <summary className="cursor-pointer text-sm font-medium text-noite-70">Histórico ({history.length})</summary>
            <ul className="mt-4 divide-y divide-linha text-sm">
              {history.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-2 py-3">
                  <span className="font-medium">{r.date.split("-").reverse().join("/")}</span><span>{r.full_name}</span>
                  <span className={r.status === "ativo" ? "badge-cinza" : "badge-coral"}>{r.status === "ativo" ? "Cadastrado" : "Cancelado"}</span>
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>
    </div>
  );
}
