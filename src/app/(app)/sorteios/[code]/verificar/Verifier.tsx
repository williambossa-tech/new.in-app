"use client";

import { useEffect, useState } from "react";
import { canonicalJson, computeRound, freezeHash, sha256Hex, type FreezeDoc } from "@/lib/lottery/core";

type Check = { label: string; ok: boolean | null; detail?: string };
type Api = {
  campanha: { code: string; title: string; status: string; freeze_doc: FreezeDoc | null; freeze_hash: string | null; current_round: number };
  rounds: { round: number; status: string; seed_commitment: string; public_entropy: string | null; seed_revealed: string | null; order_doc: Record<string, string[]> | null; annul_reason: string | null }[];
  stages: { round: number; seq: number; status: string; periodo: string; salao: string; salao_nome: string; vencedor: string | null; eligible: string[] | null; eligible_hash: string | null; draw_index: number | null }[];
};

export function Verifier({ code }: { code: string }) {
  const [data, setData] = useState<Api | null>(null);
  const [checks, setChecks] = useState<Check[]>([]);
  const [running, setRunning] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/sorteios/${code}/auditoria`).then(async (r) => (r.ok ? setData(await r.json()) : setErr("Não foi possível carregar os dados."))).catch(() => setErr("Sem conexão."));
  }, [code]);

  async function run() {
    if (!data) return;
    setRunning(true);
    const out: Check[] = [];
    const push = (c: Check) => { out.push(c); setChecks([...out]); };
    const doc = data.campanha.freeze_doc;
    if (!doc || !data.campanha.freeze_hash) {
      push({ label: "A lista ainda não foi congelada", ok: null });
      setRunning(false);
      return;
    }
    const h = await freezeHash(doc);
    push({ label: "Impressão digital da lista congelada confere", ok: h === data.campanha.freeze_hash, detail: h });
    for (const r of data.rounds) {
      if (!r.seed_revealed) {
        push({ label: `Rodada ${r.round}: chave ainda lacrada (será revelada ao final)`, ok: null, detail: `Lacre publicado: ${r.seed_commitment}` });
        continue;
      }
      const lacre = await sha256Hex(r.seed_revealed);
      push({ label: `Rodada ${r.round}: a chave revelada corresponde ao lacre publicado antes do sorteio`, ok: lacre === r.seed_commitment, detail: lacre });
      if (!r.public_entropy) continue;
      const rec = await computeRound(doc, r.round, r.seed_revealed, r.public_entropy);
      if (r.order_doc) push({ label: `Rodada ${r.round}: ordem dos salões confere`, ok: canonicalJson(rec.order) === canonicalJson(r.order_doc) });
      for (const st of rec.stages) {
        const got = data.stages.find((x) => x.round === r.round && x.periodo === st.period && x.salao === st.space);
        if (!got || got.status === "pendente") continue;
        const ok = (got.vencedor ?? null) === st.winner && got.eligible_hash === st.eligibleHash;
        push({
          label: `Rodada ${r.round} · ${st.period === "natal" ? "Natal" : "Ano Novo"} · ${got.salao_nome}: ${st.winner ? `apto ${st.winner}` : "sem elegíveis"}`,
          ok,
          detail: st.winner ? `${st.eligible.length} elegíveis (${st.eligible.join(", ")}) · posição sorteada ${st.index! + 1}` : undefined,
        });
      }
      if (r.status === "anulada") push({ label: `Rodada ${r.round} foi anulada: ${r.annul_reason}`, ok: null });
    }
    setRunning(false);
  }

  if (err) return <p className="text-[#c23a2b]">{err}</p>;
  if (!data) return <p className="muted">Carregando…</p>;
  const allOk = checks.length > 0 && checks.every((c) => c.ok !== false);
  return (
    <div className="space-y-5">
      <button onClick={run} disabled={running} className="btn-primary">{running ? "Conferindo…" : "Conferir agora"}</button>
      {checks.length > 0 && (
        <div className="card p-5">
          <p className={`mb-3 text-lg font-black ${allOk ? "text-[#23803e]" : "text-[#c23a2b]"}`}>
            {allOk ? "✓ Tudo confere" : "✗ Há divergência — avise a administração e o conselho"}
          </p>
          <ul className="space-y-3">
            {checks.map((c, i) => (
              <li key={i} className="flex gap-3">
                <span className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full text-sm font-black text-white ${c.ok === null ? "bg-noite-50" : c.ok ? "bg-verde" : "bg-coral"}`}>
                  {c.ok === null ? "i" : c.ok ? "✓" : "✗"}
                </span>
                <div className="min-w-0">
                  <p className="font-bold">{c.label}</p>
                  {c.detail && <p className="mono text-noite-50">{c.detail}</p>}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
      <details className="card p-5">
        <summary className="cursor-pointer font-black">Como funciona a conferência</summary>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-[0.95rem] text-noite-70">
          <li>Ao encerrar as inscrições, a lista de apartamentos de cada salão e período é congelada. O sistema calcula a impressão digital (SHA-256) dessa lista e a publica.</li>
          <li>Na mesma hora, o sistema gera uma chave secreta aleatória e publica apenas o seu lacre (o SHA-256 da chave). Assim a chave não pode ser trocada depois.</li>
          <li>No início do sorteio, a administração informa um número público, dito pelos presentes. Ninguém conhecia a chave e esse número ao mesmo tempo.</li>
          <li>Cada etapa escolhe uma posição na lista de elegíveis usando HMAC-SHA256(chave, número público + etapa). A escolha é uniforme: todos os elegíveis têm a mesma chance.</li>
          <li>Ao final, a chave é revelada. Esta página confere o lacre e refaz cada etapa com o mesmo código do servidor.</li>
        </ol>
      </details>
    </div>
  );
}
