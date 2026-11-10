import Link from "next/link";
import { OwlRules } from "@/components/OwlRules";
import { REGRAS } from "@/lib/voice/falas";
import { notFound } from "next/navigation";
import { Corujinha } from "@/components/Corujinha";
import { SimpleMarkdown } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { loadCampaign, loadMyEntries, registrationOpen } from "@/lib/lottery/queries";
import { CancelEntry } from "./CancelEntry";
import { InscricaoForm } from "./InscricaoForm";

export const metadata = { title: "Sorteio dos salões" };

const STATUS_TEXT: Record<string, string> = {
  rascunho: "Inscrições em breve",
  inscricoes_abertas: "Inscrições abertas",
  inscricoes_encerradas: "Inscrições encerradas",
  congelada: "Sorteio em breve",
  em_sorteio: "Sorteio acontecendo agora",
  concluida: "Resultado",
};

const time = (d: Date | string | null) => (d ? fmtDateTime(d).split(" ")[1] : null);

export default async function SorteioPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const me = await requireUser();
  const v = await loadCampaign(me.id, code);
  if (!v) notFound();
  const { campaign: c, periods, venues, stages } = v;
  const entries = await loadMyEntries(me.id, c.id);
  const open = registrationOpen(c);
  const residentUnits = me.units.filter((u) => u.resides);
  const taken: Record<string, string[]> = {};
  for (const e of entries.filter((e) => e.status === "ativa")) {
    const p = periods.find((x) => x.code === e.period_code)!;
    const s = venues.find((x) => x.code === e.space_code)!;
    (taken[e.unit_id] ??= []).push(`${p.id}|${s.id}`);
  }
  const official = stages.filter((s) => s.round === c.current_round && ["sorteada", "sem_elegiveis"].includes(s.status));
  const activeEntries = entries.filter((e) => e.status === "ativa");
  const deadlineTime = time(c.registration_deadline);
  const drawTime = time(c.draw_at);
  const myUnitCodes = me.units.map((u) => u.code);

  return (
    <div className="space-y-10">
      <section className="relative overflow-hidden rounded-[28px] bg-gradient-to-br from-violeta to-violeta-700 px-7 py-9 text-white sm:px-10 sm:py-12">
        <div className="relative z-10 sm:max-w-[65%]">
          <p className="text-sm font-medium text-white/75">{STATUS_TEXT[c.status] ?? ""}</p>
          <h1 className="mt-1 text-[1.7rem] font-semibold leading-tight tracking-[-0.02em] sm:text-[2.1rem]">Salões no Natal e Ano Novo</h1>
          <div className="mt-6 flex flex-wrap gap-x-10 gap-y-4">
            <div>
              <p className="text-sm text-white/70">Inscrições até</p>
              <p className="text-lg font-semibold">{fmtDate(c.registration_deadline_date).slice(0, 5)}{deadlineTime ? ` · ${deadlineTime}` : ""}</p>
            </div>
            <div>
              <p className="text-sm text-white/70">Sorteio online</p>
              <p className="text-lg font-semibold">{fmtDate(c.draw_date).slice(0, 5)}{drawTime ? ` · ${drawTime}` : ""}</p>
            </div>
          </div>
        </div>
        <OwlRules falaId={REGRAS.sorteio.id} texto={REGRAS.sorteio.texto} titulo="Como funciona o sorteio" className="absolute -bottom-2 right-2 z-20 hidden sm:right-6 sm:block">
          <Corujinha pose={c.status === "concluida" ? "festa" : "pergunta"} size={150} className="owl-bob" alt="" />
        </OwlRules>
      </section>

      {official.length > 0 && (
        <section>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="h2">{c.status === "concluida" ? "Resultado" : "Resultado parcial"}</h2>
            <Link href={`/telao/${code}`} className="text-sm font-medium text-violeta-700">Ver em tela cheia ›</Link>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {periods.map((p) => (
              <div key={p.id} className="card p-6">
                <p className="font-semibold">{p.code === "natal" ? "Natal" : "Ano Novo"}</p>
                <p className="text-sm text-noite-50">{p.label.split(" — ")[1]}</p>
                <ul className="mt-4 divide-y divide-linha">
                  {official.filter((s) => s.period_code === p.code).map((s) => {
                    const mine = s.holder_code && myUnitCodes.includes(s.holder_code);
                    return (
                      <li key={s.id} className="flex items-center justify-between py-3">
                        <span>{s.space_name.split(" (")[0]}</span>
                        {s.holder_code
                          ? <span className={`font-semibold ${mine ? "rounded-full bg-amarelo px-3 py-0.5 text-noite" : "text-violeta-700"}`}>Apto {s.holder_code}</span>
                          : <span className="text-sm text-noite-50">Sem inscritos</span>}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </section>
      )}

      {open && residentUnits.length > 0 && (
        <section className="card p-7 sm:p-9">
          <h2 className="h2">Inscrever meu apartamento</h2>
          <div className="mt-6">
            <InscricaoForm
              campaign={code}
              units={residentUnits.map((u) => ({ id: u.id, code: u.code }))}
              periods={periods.map((p) => ({ id: p.id, code: p.code, label: p.label }))}
              venues={venues.map((s) => ({ id: s.id, code: s.code, label: s.name.split(" (")[0], capacity: s.capacity }))}
              taken={taken}
              defaultName={me.fullName}
              defaultContact={me.phone ?? me.email}
              termsMd={c.terms_md}
              termsVersion={c.terms_version}
            />
          </div>
        </section>
      )}

      {open && residentUnits.length === 0 && (
        <section className="card flex items-center gap-5 p-7">
          <Corujinha pose="dica" size={72} alt="" />
          <p className="text-noite-70">As inscrições são feitas por moradores do apartamento. Fale com a administração se precisar atualizar seu cadastro.</p>
        </section>
      )}

      {c.status === "rascunho" && (
        <section className="card flex items-center gap-5 p-7">
          <Corujinha pose="dica" size={72} alt="" />
          <p className="text-noite-70">As inscrições pelo aplicativo abrem em breve.</p>
        </section>
      )}

      {activeEntries.length > 0 && (
        <section>
          <h2 className="h2 mb-4">Minhas inscrições</h2>
          <div className="card divide-y divide-linha px-6">
            {activeEntries.map((e) => (
              <div key={e.id} className="flex items-center justify-between gap-3 py-4">
                <div>
                  <p className="font-medium">{e.space_name.split(" (")[0]} · {e.period_code === "natal" ? "Natal" : "Ano Novo"}</p>
                  <p className="text-sm text-noite-50">Apto {e.unit_code} · por {e.applicant_name.split(" ")[0]}</p>
                </div>
                {open && <CancelEntry id={e.id} campaign={code} />}
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="h2 mb-4">Como funciona</h2>
        <div className="card flex items-start gap-6 p-7 sm:p-9">
          <SimpleMarkdown text={c.rules_md} className="flex-1 text-noite-70 [&_li]:mb-2" />
          <Corujinha pose="dica" size={90} className="hidden shrink-0 md:block" alt="" />
        </div>
        {c.freeze_hash && (
          <p className="mt-4 text-center text-sm">
            <Link href={`/sorteios/${code}/verificar`} className="font-medium text-violeta-700">Sorteio verificável · conferir resultado ›</Link>
          </p>
        )}
      </section>
    </div>
  );
}
