import { notFound } from "next/navigation";
import { EnvBanner } from "@/components/AppShell";
import { AutoRefresh } from "@/components/AutoRefresh";
import { Corujinha } from "@/components/Corujinha";
import { requireUser } from "@/lib/auth";
import { loadCampaign } from "@/lib/lottery/queries";

export const dynamic = "force-dynamic";
export const metadata = { title: "Tela de apresentação" };

export default async function Telao({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const me = await requireUser();
  const v = await loadCampaign(me.id, code);
  if (!v) notFound();
  const { campaign: c, periods, venues, stages, counts } = v;
  const cur = stages.filter((s) => s.round === c.current_round);
  const live = c.status === "em_sorteio" || c.status === "congelada";
  return (
    <div className="flex min-h-dvh flex-col bg-gradient-to-br from-violeta to-violeta-900 text-white">
      <EnvBanner />
      {live && <AutoRefresh seconds={3} />}
      <header className="flex items-center gap-4 px-6 pt-6 sm:px-10">
        <Corujinha pose={c.status === "concluida" ? "festa" : c.status === "em_sorteio" ? "surpresa" : "ola"} size={110} className="owl-bob" alt="" />
        <div>
          <p className="text-sm font-semibold tracking-wide text-amarelo">NEW.IN · Sorteio dos salões</p>
          <h1 className="text-3xl font-semibold leading-tight tracking-[-0.02em] sm:text-5xl">Natal e Ano Novo 2026/2027</h1>
          <p className="mt-1 text-white/80">
            {c.status === "concluida" ? "Resultado oficial" : c.status === "em_sorteio" ? "Sorteio em andamento" : c.status === "congelada" ? "O sorteio começa em instantes" : "Inscrições"}
          </p>
        </div>
      </header>

      <main className="grid flex-1 gap-6 px-6 py-8 sm:px-10 lg:grid-cols-2">
        {periods.map((p) => {
          const ps = cur.filter((s) => s.period_code === p.code);
          return (
            <section key={p.id} className="rounded-[28px] bg-white/10 p-5 ring-1 ring-white/15 backdrop-blur sm:p-7">
              <h2 className="text-2xl font-semibold sm:text-3xl">{p.label.split(" — ")[0]}</h2>
              <p className="text-white/70">{p.label.split(" — ")[1]}</p>
              <ul className="mt-5 space-y-4">
                {(ps.length ? ps : venues.map((vv, i) => ({ id: vv.id, seq: i + 1, space_name: vv.name, status: "pendente", winner_code: null, holder_code: null, space_code: vv.code, eligible: null }))).map((s) => {
                  const n = counts.find((x) => x.periodId === p.id && venues.find((vv) => vv.code === s.space_code)?.id === x.spaceId)?.units ?? 0;
                  return (
                    <li key={s.id} className="flex items-center justify-between gap-4 rounded-2xl bg-white px-5 py-4 text-noite">
                      <div>
                        <p className="text-xs font-semibold text-violeta">{ps.length ? `${s.seq}ª etapa` : "Salão"}</p>
                        <p className="text-xl font-semibold sm:text-2xl">{s.space_name.split(" (")[0]}</p>
                        <p className="text-sm text-noite-50">
                          {s.eligible ? `${(s.eligible as string[]).length} apartamento(s) elegível(is)` : `${n} apartamento(s) inscrito(s)`}
                        </p>
                      </div>
                      {s.status === "sorteada" && s.holder_code ? (
                        <div key={s.holder_code} className="pop-in rounded-2xl bg-amarelo px-5 py-3 text-center">
                          <p className="text-xs font-semibold">Apto</p>
                          <p className="text-4xl font-bold leading-none sm:text-5xl">{s.holder_code}</p>
                        </div>
                      ) : s.status === "sem_elegiveis" || s.status === "sorteada" ? (
                        <span className="rounded-2xl bg-fundo px-4 py-3 text-sm font-medium text-noite-50">Sem inscritos</span>
                      ) : (
                        <span className={`rounded-2xl bg-violeta-50 px-5 py-3 text-3xl font-black text-violeta ${c.status === "em_sorteio" ? "shuffle-blink" : ""}`}>?</span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </main>

      <footer className="px-6 pb-8 text-center text-sm text-white/70 sm:px-10">
        Sorteio por apartamento · um salão por apartamento em cada período · resultado verificável no aplicativo
      </footer>
    </div>
  );
}
