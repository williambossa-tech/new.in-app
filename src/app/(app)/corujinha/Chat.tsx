"use client";

import { useEffect, useRef, useState } from "react";
import { CondominioOwl, type CondominioOwlHandle } from "@/components/CondominioOwl";
import { Corujinha } from "@/components/Corujinha";

type Ref = { source: "regimento" | "convencao"; ref: string; title: string | null; body: string };
type Msg = { who: "eu" | "coruja"; id?: string; text: string; refs?: Ref[]; mode?: string; limited?: boolean; resetAt?: string | null };

const SUGG = [
  "Posso levar meu cachorro na piscina?",
  "Qual é o horário de silêncio?",
  "Em que horário posso fazer obra no apartamento?",
  "Quantas pessoas cabem no salão de festas?",
  "Como funciona a mudança?",
];
const label = (r: Ref) => `${r.source === "regimento" ? "Regimento" : "Convenção"} · ${r.ref}`;
const fmt = (iso: string) => new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

export function Chat({ firstName, remaining: initial, limit, aiOn, vozOn }: { firstName: string; remaining: number; limit: number; aiOn: boolean; vozOn: boolean }) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [remaining, setRemaining] = useState(initial);
  const end = useRef<HTMLDivElement>(null);
  const owl = useRef<CondominioOwlHandle>(null);
  const [lendo, setLendo] = useState<string | null>(null);
  const [falhaVoz, setFalhaVoz] = useState<string | null>(null);
  const estado = busy ? "thinking" : q.trim() ? "listening" : "idle";

  async function ouvir(id: string) {
    if (lendo === id) { owl.current?.stop(); setLendo(null); return; }
    setLendo(id); setFalhaVoz(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
    const r = await owl.current?.speak({ perguntaId: id, estado: "talking" });
    if (r === "error") setFalhaVoz(id);
    setLendo((cur) => (cur === id ? null : cur));
  }
  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [msgs, busy]);

  async function ask(text: string) {
    const t = text.trim();
    if (!t || busy) return;
    setMsgs((m) => [...m, { who: "eu", text: t }]);
    setQ(""); setBusy(true);
    try {
      const r = await fetch("/api/corujinha", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ pergunta: t }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.erro ?? "Erro");
      setRemaining(j.remaining);
      setMsgs((m) => [...m, { who: "coruja", id: j.mode === "ia" ? j.id : undefined, text: j.answer, refs: j.refs, mode: j.mode, limited: j.limited, resetAt: j.resetAt }]);
    } catch (e) {
      setMsgs((m) => [...m, { who: "coruja", text: (e as Error).message === "Erro" ? "Ops, não consegui responder agora. Tente de novo em instantes." : (e as Error).message }]);
    } finally { setBusy(false); }
  }

  return (
    <div className="flex min-h-[70dvh] flex-col">
      <div className="flex-1 space-y-5 pb-6">
        <div className="flex items-end gap-3">
          <CondominioOwl ref={owl} estado={estado} className="h-[104px] w-[104px] shrink-0 -ml-3 -mb-2 sm:h-[124px] sm:w-[124px]" ariaLabel="Corujinha" />
          <div className="max-w-[85%] rounded-3xl rounded-bl-md bg-white px-5 py-4 shadow-sm ring-1 ring-linha">
            <p>Oi, {firstName}! Sou a Corujinha. Pergunte sobre as regras do NEW.IN que eu procuro no Regimento Interno e na Convenção e te mostro de onde tirei.</p>
          </div>
        </div>
        {msgs.length === 0 && (
          <div className="flex flex-wrap gap-2 pl-[76px]">
            {SUGG.map((s) => <button key={s} onClick={() => ask(s)} className="rounded-full bg-violeta-50 px-4 py-2 text-sm text-violeta-700 transition hover:bg-violeta-100">{s}</button>)}
          </div>
        )}
        {msgs.map((m, i) => m.who === "eu" ? (
          <div key={i} className="flex justify-end"><div className="pop-in max-w-[85%] rounded-3xl rounded-br-md bg-violeta px-5 py-3 text-white">{m.text}</div></div>
        ) : (
          <div key={i} className="flex items-end gap-3">
            <Corujinha pose={m.refs?.length ? "dica" : "pergunta"} size={56} className="shrink-0" alt="" />
            <div className="pop-in max-w-[85%] rounded-3xl rounded-bl-md bg-white px-5 py-4 shadow-sm ring-1 ring-linha">
              {m.limited && m.resetAt && <p className="mb-2 text-sm text-[#8a6100]">Seu apartamento usou as {limit} perguntas dos últimos 3 dias. Novas respostas da Corujinha liberam em {fmt(m.resetAt)}. Enquanto isso, veja os trechos encontrados.</p>}
              <p className="whitespace-pre-line">{m.text}</p>
              {vozOn && m.id && (
                <button type="button" onClick={() => ouvir(m.id!)} className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-violeta-50 px-3 py-1.5 text-sm font-medium text-violeta-700 transition hover:bg-violeta-100">
                  {lendo === m.id ? "■ Parar" : "🔊 Ouvir"}
                </button>
              )}
              {falhaVoz === m.id && <p className="mt-1 text-xs text-noite-50">Não consegui falar agora. Tente de novo em instantes.</p>}
              {!!m.refs?.length && (
                <div className="mt-3 space-y-2">
                  {m.refs.map((r) => (
                    <details key={r.source + r.ref} className="group rounded-2xl bg-fundo px-4 py-2.5 text-sm">
                      <summary className="cursor-pointer list-none font-medium text-violeta-700">📖 {label(r)} <span className="text-noite-50 group-open:hidden">· ver texto</span></summary>
                      {r.title && <p className="mt-2 text-xs text-noite-50">{r.title}</p>}
                      <p className="mt-1 whitespace-pre-line text-noite-70">{r.body}</p>
                    </details>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        {busy && (
          <div className="flex items-end gap-3">
            <Corujinha pose="pergunta" size={56} className="owl-bob shrink-0" alt="" />
            <div className="flex gap-1 rounded-3xl rounded-bl-md bg-white px-5 py-4 ring-1 ring-linha">
              <span className="typing-dot h-2 w-2 rounded-full bg-violeta" /><span className="typing-dot h-2 w-2 rounded-full bg-violeta" style={{ animationDelay: ".15s" }} /><span className="typing-dot h-2 w-2 rounded-full bg-violeta" style={{ animationDelay: ".3s" }} />
            </div>
          </div>
        )}
        <div ref={end} />
      </div>
      <form onSubmit={(e) => { e.preventDefault(); ask(q); }} className="sticky bottom-24 z-10 lg:bottom-6">
        <div className="flex items-center gap-2 rounded-full bg-white p-1.5 shadow-lg ring-1 ring-linha">
          <input value={q} onChange={(e) => setQ(e.target.value)} maxLength={400} placeholder="Pergunte à Corujinha…" className="min-h-11 flex-1 rounded-full bg-transparent px-4 outline-none" />
          <button disabled={busy || !q.trim()} className="btn-primary min-h-11 px-5 disabled:opacity-40">Perguntar</button>
        </div>
        {aiOn && <p className="mt-2 text-center text-xs text-noite-50">{remaining} de {limit} perguntas disponíveis para seu apartamento (a cada 3 dias)</p>}
      </form>
    </div>
  );
}
