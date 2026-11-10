import Link from "next/link";
import { cancelarConvidadoAction, configPiscinaAction, corrigirConvidadoAction } from "@/app/actions/piscina";
import { AdminTabs } from "@/components/AppShell";
import { CancelWithReason } from "@/components/CancelWithReason";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Empty, Stat } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { addDays, todayIso } from "@/lib/bmg/rules";
import { asUser } from "@/lib/db";
import { poolAdminList, poolReport, poolSettings } from "@/lib/piscina/service";

export const dynamic = "force-dynamic";
export const metadata = { title: "Piscina · Administração" };
type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const when = (d: Date) => new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(d);

export default async function AdminPiscina({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const me = await requireRole("admin", "sindico", "conselheiro");
  const sp = await searchParams;
  const aba = sp.aba ?? "cadastros";
  const f = { from: sp.de ?? todayIso(), to: sp.ate ?? addDays(todayIso(), 30), unit: sp.unidade ?? "", q: sp.nome ?? "", status: sp.situacao ?? "" };
  const rows = aba === "cadastros" ? await poolAdminList(me.id, f) : [];
  const rep = aba === "indicadores" ? await poolReport(me.id, sp.de ?? addDays(todayIso(), -30), sp.ate ?? addDays(todayIso(), 30)) : null;
  const { settings, params, hist } = await asUser(me.id, async (tx) => ({
    settings: await poolSettings(tx),
    params: await tx`select key, label, status, value, source from parameters where key like 'piscina.%' order by key`,
    hist: aba === "historico" ? await tx`select action, actor_label, entity_id, data, at as created_at from audit_log where action like 'piscina.%' order by id desc limit 60` : [],
  }));
  const qs = new URLSearchParams(Object.entries({ de: f.from, ate: f.to, unidade: f.unit, nome: f.q, situacao: f.status }).filter(([, v]) => v) as [string, string][]).toString();
  const tabs = [["cadastros", "Convidados cadastrados"], ["indicadores", "Indicadores"], ["historico", "Histórico"], ["config", "Configuração"]];

  return (
    <>
      <AdminTabs active="/admin/piscina" />
      <div className="mb-8"><p className="eyebrow">Administração</p><h1 className="h1">Piscina — Convidados</h1>
        <p className="mt-2 text-sm text-noite-70">Cadastro prévio, sem reserva e sem controle de presença. Regimento (21.1): até {settings.simultaneos} convidados por vez por unidade, com o morador presente.</p></div>
      <div className="no-print -mx-4 mb-8 overflow-x-auto px-4">
        <div className="flex w-max gap-1 rounded-full bg-white p-1 ring-1 ring-linha">
          {tabs.map(([k, l]) => <Link key={k} href={`?aba=${k}`} className={`rounded-full px-4 py-2 text-sm font-medium ${aba === k ? "bg-turquesa text-white" : "text-noite-70 hover:bg-turquesa-50"}`}>{l}</Link>)}
        </div>
      </div>

      {aba === "cadastros" && (
        <div className="space-y-5">
          <form className="grid gap-3 sm:grid-cols-6 sm:items-end"><input type="hidden" name="aba" value="cadastros" />
            <div><label className="field-label">De</label><input className="input" type="date" name="de" defaultValue={f.from} /></div>
            <div><label className="field-label">Até</label><input className="input" type="date" name="ate" defaultValue={f.to} /></div>
            <div><label className="field-label">Apartamento</label><input className="input" name="unidade" defaultValue={f.unit} placeholder="Ex.: 1204" /></div>
            <div><label className="field-label">Nome</label><input className="input" name="nome" defaultValue={f.q} /></div>
            <div><label className="field-label">Situação</label><select className="input" name="situacao" defaultValue={f.status}><option value="">Todas</option><option value="ativo">Cadastrados</option><option value="cancelado">Cancelados</option></select></div>
            <div className="flex gap-2"><button className="btn-secondary">Filtrar</button><a className="btn-ghost" href={`/api/admin/piscina?${qs}`}>CSV</a></div>
          </form>
          {!rows.length && <div className="card"><Empty title="Nenhum convidado cadastrado no filtro" /></div>}
          {rows.map((r: Row) => (
            <div key={r.id} className={`card p-5 ${r.status !== "ativo" ? "opacity-70" : ""}`}>
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-semibold">{r.full_name}</p>{r.is_minor && <span className="badge-amarelo">Menor</span>}
                <span className={r.status === "ativo" ? "badge-verde" : "badge-coral"}>{r.status === "ativo" ? "Cadastrado" : "Cancelado"}</span>
              </div>
              <p className="mt-1 text-sm text-noite-70">{r.date.split("-").reverse().join("/")} · Apto {r.unit} · responsável {r.responsavel}{r.document ? ` · doc. ${r.document}` : ""}</p>
              <p className="text-xs text-noite-50">Cadastrado em {r.created} · termo v{r.termo_versao} aceito em {r.aceite}{r.cancel_reason ? ` · ${r.cancel_reason}` : ""}</p>
              {r.status === "ativo" && (
                <div className="mt-3 flex flex-wrap items-start gap-x-6 gap-y-3">
                  <details>
                    <summary className="cursor-pointer text-sm font-medium text-violeta-700">Corrigir dados</summary>
                    <ActionForm action={corrigirConvidadoAction} className="mt-3 grid gap-3 sm:grid-cols-2">
                      <input type="hidden" name="id" value={r.id} />
                      <input name="name" className="input" defaultValue={r.full_name} required />
                      <input name="document" className="input" defaultValue={r.document ?? ""} placeholder="Documento" />
                      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="minor" defaultChecked={r.is_minor} className="h-5 w-5 accent-violeta" /> Menor de idade</label>
                      <input name="reason" className="input" placeholder="Justificativa" required />
                      <SubmitButton className="btn-secondary btn-sm w-fit" pendingText="Salvando…">Salvar correção</SubmitButton>
                    </ActionForm>
                  </details>
                  <CancelWithReason id={r.id} action={cancelarConvidadoAction} label="Cancelar cadastro" hint="O morador será avisado. Informe a justificativa." />
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {aba === "indicadores" && rep && (
        <div className="space-y-6">
          <p className="text-sm text-noite-50">Indicadores cadastrais. Cadastros não comprovam presença na piscina.</p>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat label="Convidados cadastrados" value={rep.tot.cadastrados} /><Stat label="Cancelamentos" value={rep.tot.cancelados} />
            <Stat label="Unidades que cadastraram" value={rep.tot.unidades} /><Stat label="Usos do módulo" value={rep.tot.usos_do_modulo} hint="cadastros por unidade e dia" />
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            <section className="card overflow-x-auto p-5"><h3 className="mb-3 text-sm font-semibold">Por data prevista</h3>
              <table className="w-full text-sm"><thead className="text-left text-noite-50"><tr><th className="py-1">Data</th><th>Cadastrados</th><th>Cancelados</th></tr></thead>
                <tbody>{rep.porData.map((r: Row) => <tr key={r.dia} className="border-t border-linha"><td className="py-1.5">{r.dia}</td><td>{r.cadastrados}</td><td>{r.cancelados}</td></tr>)}</tbody></table></section>
            <section className="card overflow-x-auto p-5"><h3 className="mb-3 text-sm font-semibold">Por apartamento</h3>
              <table className="w-full text-sm"><thead className="text-left text-noite-50"><tr><th className="py-1">Apto</th><th>Cadastrados</th><th>Datas</th><th>Cancelados</th></tr></thead>
                <tbody>{rep.porUnidade.map((r: Row) => <tr key={r.unidade} className="border-t border-linha"><td className="py-1.5">{r.unidade}</td><td>{r.cadastrados}</td><td>{r.datas}</td><td>{r.cancelados}</td></tr>)}</tbody></table></section>
          </div>
        </div>
      )}

      {aba === "historico" && (
        <section className="card divide-y divide-linha p-2">
          {!hist.length && <Empty title="Sem registros" />}
          {hist.map((h: Row, i: number) => (
            <div key={i} className="px-4 py-3 text-sm">
              <p><b>{h.actor_label}</b> · {h.action.replace("piscina.", "")} · <span className="text-noite-50">{when(h.created_at)}</span></p>
              <p className="text-xs text-noite-50">{Object.entries(h.data ?? {}).filter(([, v]) => v !== null && v !== "").map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`).join(" · ")}</p>
            </div>
          ))}
        </section>
      )}

      {aba === "config" && (
        <section className="card p-6 sm:p-7">
          <ActionForm action={configPiscinaAction} className="space-y-5">
            <div>
              <label className="flex items-center gap-2 font-medium"><input type="checkbox" name="limite_ativo" defaultChecked={!!settings.limiteDiario} className="h-5 w-5 accent-violeta" /> Limitar cadastros por unidade por dia</label>
              <p className="field-hint">Opcional e desativado por padrão. Não é exigência do Regimento, que trata de convidados simultâneos.</p>
              <input name="limite_qtd" type="number" min={1} max={20} className="input mt-2 max-w-32" defaultValue={settings.limiteDiario ?? 2} />
            </div>
            <div><label className="field-label">Documento do convidado</label>
              <select name="documento" className="input max-w-sm" defaultValue={settings.documento}>
                <option value="nao_solicitar">Não solicitar (recomendado pela LGPD)</option><option value="opcional">Opcional</option><option value="obrigatorio">Obrigatório</option></select></div>
            <div><label className="field-label">Retenção dos dados (dias após a data prevista)</label>
              <input name="retencao" type="number" min={1} max={3650} className="input max-w-32" defaultValue={settings.retencaoDias ?? ""} placeholder="Pendente" />
              <p className="field-hint">Depois desse prazo, nome e documento são removidos; os números dos relatórios ficam.</p></div>
            <div><label className="field-label">Fonte da definição</label><input name="source" className="input" required placeholder="Ex.: decisão do síndico de 10/11/2026" /></div>
            <SubmitButton pendingText="Salvando…">Salvar configuração</SubmitButton>
          </ActionForm>
          <ul className="mt-6 space-y-1 text-xs text-noite-50">
            {params.map((p: Row) => <li key={p.key}>{p.label}: {p.status === "definido" ? `${p.value?.texto ?? ""} · ${p.source}` : "pendente"}</li>)}
          </ul>
        </section>
      )}
    </>
  );
}
