import Link from "next/link";
import { notFound } from "next/navigation";
import { Corujinha } from "@/components/Corujinha";
import { CampaignBadge, Notice, Pending, SimpleMarkdown } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { loadCampaign, loadMyEntries, registrationOpen } from "@/lib/lottery/queries";
import { CancelEntry } from "./CancelEntry";
import { InscricaoForm } from "./InscricaoForm";

export const metadata = { title: "Sorteio dos salões" };

export default async function SorteioPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const me = await requireUser();
  const v = await loadCampaign(me.id, code);
  if (!v) notFound();
  const { campaign: c, periods, venues, rounds, stages, params: pend } = v;
  const entries = await loadMyEntries(me.id, c.id);
  const open = registrationOpen(c);
  const residentUnits = me.units.filter((u) => u.resides);
  const taken: Record<string, string[]> = {};
  for (const e of entries.filter((e) => e.status === "ativa")) {
    const p = periods.find((x) => x.code === e.period_code)!;
    const s = venues.find((x) => x.code === e.space_code)!;
    (taken[e.unit_id] ??= []).push(`${p.id}|${s.id}`);
  }
  const currentRound = rounds.find((r) => r.round === c.current_round);
  const officialStages = stages.filter((s) => s.round === c.current_round && ["sorteada", "sem_elegiveis"].includes(s.status));
  const annulled = rounds.filter((r) => r.status === "anulada");
  const deadlineParam = pend.find((p) => p.key === "sorteio.horario_encerramento");
  const drawParam = pend.find((p) => p.key === "sorteio.horario_sorteio");
  const pendingList = pend.filter((p) => p.status === "pendente");

  return (
    <div className="space-y-6">
      <section className="card relative overflow-hidden p-6 sm:p-8">
        <div className="relative z-10 sm:max-w-[68%]">
          <div className="flex flex-wrap gap-2"><CampaignBadge status={c.status} /></div>
          <h1 className="h1 mt-2">{c.title}</h1>
          <dl className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl bg-violeta-50 p-3">
              <dt className="text-xs font-black uppercase tracking-wide text-violeta-700">Inscrições até</dt>
              <dd className="text-lg font-black">
                {fmtDate(c.registration_deadline_date)}
                {c.registration_deadline ? <span className="font-bold"> às {fmtDateTime(c.registration_deadline).split(" ")[1]}</span> : null}
              </dd>
              {!c.registration_deadline && deadlineParam?.status === "pendente" && <dd className="mt-1"><Pending>Horário a definir</Pending></dd>}
            </div>
            <div className="rounded-2xl bg-coral-50 p-3">
              <dt className="text-xs font-black uppercase tracking-wide text-[#c23a2b]">Sorteio</dt>
              <dd className="text-lg font-black">{fmtDate(c.draw_date)}{c.draw_at ? <span className="font-bold"> às {fmtDateTime(c.draw_at).split(" ")[1]}</span> : null}</dd>
              {!c.draw_at && drawParam?.status === "pendente" && <dd className="mt-1"><Pending>Horário a definir</Pending></dd>}
            </div>
          </dl>
        </div>
        <Corujinha pose={c.status === "concluida" ? "festa" : "pergunta"} size={150} className="owl-bob absolute -bottom-2 right-4 hidden sm:block" alt="" />
      </section>

      {/* Resultado */}
      {officialStages.length > 0 && (
        <section className="card p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="h2">{c.status === "concluida" ? "Resultado oficial" : "Resultado parcial (sorteio em andamento)"}</h2>
            <div className="flex gap-2">
              <Link href={`/telao/${code}`} className="btn-secondary btn-sm">Tela de apresentação</Link>
              <Link href={`/sorteios/${code}/verificar`} className="btn-secondary btn-sm">Verificar</Link>
            </div>
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {periods.map((p) => (
              <div key={p.id} className="rounded-2xl border border-linha p-4">
                <p className="font-black">{p.label}</p>
                <ul className="mt-2 space-y-2">
                  {officialStages.filter((s) => s.period_code === p.code).map((s) => (
                    <li key={s.id} className="flex items-center justify-between gap-3 rounded-xl bg-fundo px-3 py-2">
                      <span className="font-bold">{s.seq}º · {s.space_name}</span>
                      {s.winner_code ? <span className="text-lg font-black text-violeta-700">Apto {s.winner_code}</span> : <span className="badge-cinza">sem inscritos elegíveis</span>}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          {c.status === "concluida" && (
            <p className="mt-3 text-sm muted">
              Horários de entrega/devolução, taxa e prazo de confirmação do vencedor serão informados pela administração.
            </p>
          )}
        </section>
      )}

      {annulled.length > 0 && (
        <Notice tone="coral" title="Rodadas anuladas">
          {annulled.map((r) => (
            <p key={r.round}>Rodada {r.round} anulada em {fmtDateTime(r.annulled_at)}. Motivo: {r.annul_reason}</p>
          ))}
        </Notice>
      )}

      {/* Inscrição */}
      {open && (
        <section className="card p-6">
          <h2 className="h2">Inscrever meu apartamento</h2>
          {residentUnits.length ? (
            <div className="mt-4">
              <InscricaoForm
                campaign={code}
                units={residentUnits.map((u) => ({ id: u.id, code: u.code }))}
                periods={periods.map((p) => ({ id: p.id, code: p.code, label: p.label }))}
                venues={venues.map((s) => ({ id: s.id, code: s.code, label: s.name, capacity: s.capacity }))}
                taken={taken}
                defaultName={me.fullName}
                defaultContact={me.phone ?? me.email}
                termsMd={c.terms_md}
                termsVersion={c.terms_version}
              />
            </div>
          ) : (
            <Notice tone="amarelo" pose="dica" title="Inscrição indisponível para o seu cadastro">
              Pelo Regimento (itens 20.3 e 20.5), o uso dos salões é dos condôminos residentes ou de quem está no uso da unidade.
              Seu cadastro não indica que você mora no apartamento. Se isso estiver errado, procure a administração.
            </Notice>
          )}
        </section>
      )}
      {c.status === "rascunho" && (
        <Notice tone="violeta" pose="dica" title="Inscrições ainda não abertas pelo aplicativo">
          A administração vai avisar quando as inscrições pelo aplicativo estiverem liberadas. O canal oficial do comunicado
          (e-mail <b>vanguard.newin@gmail.com</b>, assunto “Sorteios de Salões 2026”) continua valendo.
        </Notice>
      )}

      {entries.length > 0 && (
        <section className="card p-6">
          <h2 className="h2">Inscrições do meu apartamento</h2>
          <div className="table-wrap mt-3">
            <table className="tbl">
              <thead><tr><th>Apto</th><th>Período</th><th>Salão</th><th>Inscrito por</th><th>Situação</th><th></th></tr></thead>
              <tbody>
                {entries.map((e) => (
                  <tr key={e.id}>
                    <td className="font-black">{e.unit_code}</td>
                    <td>{e.period_label.split(" — ")[0]}</td>
                    <td>{e.space_name.split(" (")[0]}</td>
                    <td>{e.applicant_name}<div className="text-xs text-noite-50">{fmtDateTime(e.created_at)} · {e.origin === "email" ? "por e-mail" : "aplicativo"}</div></td>
                    <td>{e.status === "ativa" ? <span className="badge-turquesa">Ativa</span> : <span className="badge-cinza" title={e.status_reason ?? ""}>{e.status}</span>}</td>
                    <td className="text-right">{e.status === "ativa" && open && <CancelEntry id={e.id} campaign={code} />}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-sm muted">Inscrições de outros moradores do mesmo apartamento aparecem aqui e não geram chances adicionais.</p>
        </section>
      )}

      <section className="card p-6">
        <div className="flex items-start gap-4">
          <div className="min-w-0 flex-1">
            <h2 className="h2">Regras da campanha</h2>
            <SimpleMarkdown text={c.rules_md} className="mt-2 text-[0.98rem]" />
            <p className="mt-3 text-xs text-noite-50">Regras versão {c.rules_version}. {c.source_note}</p>
          </div>
          <Corujinha pose="dica" size={96} className="hidden shrink-0 md:block" alt="" />
        </div>
      </section>

      {(c.freeze_hash || currentRound) && (
        <section className="card p-6">
          <h2 className="h2">Transparência</h2>
          <dl className="mt-3 space-y-3 text-[0.95rem]">
            {c.freeze_hash && (
              <div>
                <dt className="font-bold">Impressão digital da lista congelada ({fmtDateTime(c.frozen_at)})</dt>
                <dd className="mono text-noite-70">{c.freeze_hash}</dd>
              </div>
            )}
            {currentRound && (
              <div>
                <dt className="font-bold">Lacre da chave secreta — rodada {currentRound.round}</dt>
                <dd className="mono text-noite-70">{currentRound.seed_commitment}</dd>
              </div>
            )}
            {currentRound?.public_entropy && (
              <div><dt className="font-bold">Número público informado no início do sorteio</dt><dd className="mono">{currentRound.public_entropy}</dd></div>
            )}
            {currentRound?.seed_revealed && (
              <div><dt className="font-bold">Chave revelada após o sorteio</dt><dd className="mono text-noite-70">{currentRound.seed_revealed}</dd></div>
            )}
          </dl>
          <Link href={`/sorteios/${code}/verificar`} className="btn-secondary btn-sm mt-4">Conferir no meu celular</Link>
        </section>
      )}

      {pendingList.length > 0 && (
        <section className="card p-6">
          <h2 className="h2">Pontos ainda em definição pela administração</h2>
          <ul className="mt-3 space-y-2">
            {pendingList.map((p) => (
              <li key={p.key} className="flex items-start gap-3">
                <Pending>Pendente</Pending>
                <span className="text-[0.95rem]">{p.label}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
