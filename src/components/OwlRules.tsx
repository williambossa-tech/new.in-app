"use client";
import { useEffect, useRef, useState } from "react";
import { Corujinha } from "./Corujinha";
import { falaUrl, loadSpeech, SpeechPlayer } from "./owl3d/speech";

/**
 * Coruja de um módulo: ao tocar, ela fala as regras do espaço (voz + balão com o texto).
 * Sem voz disponível, mostra só o balão.
 */
export function OwlRules({ falaId, texto, titulo, children, className = "" }: {
  falaId: string; texto: string; titulo: string; children: React.ReactNode; className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<"carregando" | "falando" | "parada" | "sem_voz">("parada");
  const [progress, setProgress] = useState(0);
  const player = useRef<SpeechPlayer | null>(null);
  const run = useRef(0);

  useEffect(() => () => { player.current?.dispose(); }, []);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    window.addEventListener("keydown", onKey);
    let raf = 0;
    const tick = () => { const p = player.current; if (p?.playing && p.audio.duration) setProgress(p.audio.currentTime / p.audio.duration); raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => { window.removeEventListener("keydown", onKey); cancelAnimationFrame(raf); };
  }, [open]);

  function close() { run.current++; player.current?.stop(); setOpen(false); setState("parada"); }

  async function speak() {
    const id = ++run.current;
    player.current ??= new SpeechPlayer();
    player.current.unlock(); // ainda dentro do toque
    setOpen(true); setProgress(0); setState("carregando");
    try {
      const l = await loadSpeech(falaUrl(falaId));
      if (run.current !== id) return;
      setState("falando");
      const r = await player.current.play(l, { volume: 0.95 });
      if (run.current !== id) return;
      setState(r === "ended" ? "parada" : r === "error" || r === "blocked" ? "sem_voz" : "parada");
      if (r === "ended") setProgress(1);
    } catch {
      if (run.current === id) { setState("sem_voz"); setProgress(1); }
    }
  }

  const words = texto.split(/(\s+)/);
  const total = words.filter((w) => w.trim()).length;
  const shown = state === "falando" ? Math.ceil(progress * total * 1.03) : total;

  return (
    <>
      <button type="button" onClick={() => (open && state === "falando" ? close() : speak())} aria-label={`Ouvir as regras: ${titulo}`}
        className={`group ${className}`}>
        {children}
        <span className="absolute -top-1 right-1 grid h-8 w-8 place-items-center rounded-full bg-white text-sm shadow-md ring-1 ring-linha transition group-hover:scale-110" aria-hidden>
          {open && state === "falando" ? "■" : "🔊"}
        </span>
      </button>

      {open && (
        <div role="dialog" aria-label={titulo}
          className="fixed inset-x-4 bottom-24 z-50 mx-auto max-w-md rounded-[26px] bg-white p-5 shadow-[0_24px_60px_-20px_rgba(40,20,120,0.45)] ring-1 ring-linha lg:bottom-8 lg:left-auto lg:right-8 lg:mx-0">
          <div className="flex items-start gap-3">
            <Corujinha pose="dica" size={56} className={state === "falando" ? "owl-bob shrink-0" : "shrink-0"} alt="" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-violeta">{titulo}</p>
                <button type="button" onClick={close} aria-label="Fechar" className="grid h-8 w-8 place-items-center rounded-full text-lg text-noite-50 hover:bg-fundo">×</button>
              </div>
              <p className="mt-1 max-h-[42dvh] overflow-y-auto text-[0.98rem] leading-relaxed" aria-live="polite">
                {words.map((w, i) => {
                  if (!w.trim()) return w;
                  const n = words.slice(0, i + 1).filter((x) => x.trim()).length;
                  return <span key={i} className={`transition-colors duration-150 ${state === "carregando" || n > shown ? "text-noite/30" : "text-noite"}`}>{w}</span>;
                })}
              </p>
              <div className="mt-3 flex items-center gap-3 text-xs text-noite-50">
                {state === "carregando" && <span>Preparando a voz…</span>}
                {state === "falando" && <button type="button" onClick={close} className="font-medium text-violeta-700">■ Parar</button>}
                {state === "parada" && <button type="button" onClick={speak} className="font-medium text-violeta-700">↻ Ouvir de novo</button>}
                {state === "sem_voz" && <span>Voz indisponível agora; confira o texto acima.</span>}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
