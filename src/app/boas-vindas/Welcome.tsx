"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { CondominioOwl, type CondominioOwlHandle, type OwlState } from "@/components/CondominioOwl";

type Fala = { id: string; texto: string; estado: OwlState; pausaDepois: number };
type Phase = "escolha" | "carregando" | "tocar" | "falando" | "fim";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const readTime = (t: string) => Math.max(2.2, t.split(/\s+/).length * 0.36);

/** Marca a intro como vista neste aparelho (sessão) ou desativada (1 ano). */
function markIntro(persist: boolean) {
  document.cookie = `newin_intro=${persist ? "off" : "visto"}; path=/; samesite=lax${persist ? "; max-age=31536000" : ""}`;
}

export function Welcome({ firstName, falas, mode = "app", nextHref }: { firstName?: string; falas: Fala[]; mode?: "app" | "intro"; nextHref?: string }) {
  const intro = mode === "intro";
  const next = nextHref ?? (intro ? "/entrar" : "/");
  const leave = (persist: boolean) => { if (intro) markIntro(persist); owl.current?.stop(); window.location.href = next; };
  const owl = useRef<CondominioOwlHandle>(null);
  const run = useRef(0);
  const [phase, setPhase] = useState<Phase>(mode === "intro" ? "escolha" : "carregando");
  const [idx, setIdx] = useState(0);
  const [progress, setProgress] = useState(0);
  const [voz, setVoz] = useState(true);
  const [vozDisponivel, setVozDisponivel] = useState<boolean | null>(null);
  const [level, setLevel] = useState(0);
  const vozRef = useRef(voz); vozRef.current = voz;
  const dispRef = useRef(vozDisponivel); dispRef.current = vozDisponivel;

  // preferência de narração (por aparelho)
  useEffect(() => {
    try { if (localStorage.getItem("newin-narracao") === "off") setVoz(false); } catch { /* sem armazenamento */ }
    { const s = document.getElementById("splash"); if (s) s.style.display = "none"; }
  }, []);

  // pré-carrega todas as falas (o servidor gera uma vez e guarda)
  useEffect(() => {
    let alive = true;
    (async () => {
      await wait(150);
      const first = owl.current?.preload({ falaId: falas[0].id });
      try { await first; if (alive) setVozDisponivel(true); } catch { if (alive) setVozDisponivel(false); }
      falas.slice(1).forEach((f) => owl.current?.preload({ falaId: f.id }).catch(() => {}));
    })();
    return () => { alive = false; };
  }, [falas]);

  // indicador de áudio e legenda sincronizada
  useEffect(() => {
    let raf = 0; const start = performance.now();
    const tick = () => {
      const o = owl.current;
      if (o) {
        setLevel(o.level());
        const p = o.progress();
        if (p.d > 0) setProgress(Math.min(1, p.t / p.d));
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); void start; };
  }, []);

  const play = useCallback(async (from = 0) => {
    const id = ++run.current;
    owl.current?.stop();
    setPhase("falando");
    for (let i = from; i < falas.length; i++) {
      if (run.current !== id) return;
      const f = falas[i];
      setIdx(i); setProgress(0);
      let ok = false;
      if (vozRef.current && dispRef.current !== false) {
        const r = await owl.current?.speak({ falaId: f.id, estado: f.estado });
        if (run.current !== id) return;
        if (r === "blocked") { setPhase("tocar"); return; }
        ok = r === "ended";
      }
      if (!ok) {
        // sem voz: legenda no tempo de leitura, sem mexer o bico
        owl.current?.setState(f.estado === "talking" ? "idle" : f.estado);
        const total = readTime(f.texto) * 1000; const t0 = performance.now();
        while (performance.now() - t0 < total) {
          if (run.current !== id) return;
          setProgress((performance.now() - t0) / total);
          await wait(50);
        }
      }
      setProgress(1);
      await wait(f.pausaDepois * 1000);
    }
    if (run.current !== id) return;
    owl.current?.setState("happy");
    setPhase("fim");
  }, [falas]);

  // tenta começar sozinho; se o navegador bloquear o som, pede um toque
  useEffect(() => {
    if (intro || vozDisponivel === null || phase !== "carregando") return;
    const t = setTimeout(() => { void play(0); }, 900);
    return () => clearTimeout(t);
  }, [intro, vozDisponivel, phase, play]);

  const toggleVoz = () => {
    const next = !voz; setVoz(next);
    try { localStorage.setItem("newin-narracao", next ? "on" : "off"); } catch { /* sem armazenamento */ }
    if (!next && phase === "falando") void play(idx);
  };

  const fala = falas[idx];
  const words = fala.texto.split(/(\s+)/);
  const wordCount = words.filter((w) => w.trim()).length;
  const shown = phase === "fim" || phase === "escolha" ? wordCount : Math.ceil(progress * wordCount * 1.04);

  return (
    <main className="relative min-h-dvh overflow-hidden bg-[radial-gradient(120%_80%_at_50%_0%,#efeaff_0%,#f8f6ff_45%,#ffffff_100%)]">
      <div aria-hidden className="pointer-events-none absolute -left-24 top-24 h-72 w-72 rounded-full bg-violeta/15 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -right-20 bottom-10 h-80 w-80 rounded-full bg-turquesa/15 blur-3xl" />

      <div className="relative mx-auto flex min-h-dvh max-w-5xl flex-col px-5 pb-8 pt-6 sm:px-8">
        <header className="flex items-center justify-between">
          <div>
            <p className="text-lg font-bold tracking-[-0.02em] text-violeta">NEW.IN</p>
            <p className="-mt-0.5 text-xs text-noite-50">Comunidade</p>
          </div>
          <button type="button" onClick={() => leave(false)} className="text-sm font-medium text-noite-50 hover:text-violeta">Pular</button>
        </header>

        <div className="flex flex-1 flex-col items-center justify-center gap-4 md:grid md:grid-cols-[1.05fr_1fr] md:gap-10">
          <div className="relative aspect-square w-[min(64vw,300px,38dvh)] md:w-full md:max-w-[460px] md:justify-self-end">
            <CondominioOwl ref={owl} estado="greeting" className="h-full w-full" ariaLabel="Corujinha dando as boas-vindas" />
          </div>

          <div className="w-full max-w-md md:justify-self-start">
            <p className="mb-3 text-sm font-medium text-violeta">{firstName ? `Olá, ${firstName}!` : "Bem-vindo ao NEW.IN!"}</p>
            <div className="relative rounded-[28px] bg-white px-5 py-5 shadow-[0_18px_50px_-20px_rgba(76,45,200,0.35)] ring-1 ring-linha sm:p-7">
              <span aria-hidden className="absolute -top-2 left-10 h-5 w-5 rotate-45 rounded-[4px] bg-white ring-1 ring-linha [clip-path:polygon(0_0,100%_0,0_100%)] md:-left-2 md:top-10" />
              <p className="min-h-[5.2rem] text-[1.08rem] font-medium leading-relaxed text-noite sm:text-[1.3rem]" aria-live="polite">
                {words.map((w, i) => {
                  if (!w.trim()) return w;
                  const n = words.slice(0, i + 1).filter((x) => x.trim()).length;
                  return <span key={i} className={`transition-colors duration-200 ${phase === "carregando" ? "text-noite/25" : n <= shown ? "text-noite" : "text-noite/25"}`}>{w}</span>;
                })}
              </p>
              <div className="mt-5 flex items-center gap-1.5" aria-hidden>
                {falas.map((f, i) => <span key={f.id} className={`h-1.5 rounded-full transition-all ${i === idx ? "w-6 bg-violeta" : i < idx ? "w-1.5 bg-violeta/50" : "w-1.5 bg-linha"}`} />)}
              </div>
            </div>

            {phase === "escolha" ? (
              <div className="mt-5 space-y-3">
                <button type="button" onClick={() => void play(0)} className="btn-primary w-full justify-center text-base">
                  <span aria-hidden>▶</span> Ouvir a Corujinha
                </button>
                <div className="grid grid-cols-2 gap-3">
                  <button type="button" onClick={() => leave(false)} className="btn-secondary justify-center">Pular</button>
                  <button type="button" onClick={() => leave(true)} className="btn-ghost justify-center text-noite-50">Não mostrar mais</button>
                </div>
              </div>
            ) : (<>
            <div className="mt-4 flex flex-wrap items-center gap-2.5">
              <div className="flex h-10 items-end gap-[3px] rounded-full bg-white px-3 py-2.5 ring-1 ring-linha" aria-label={voz ? "Narração" : "Narração desligada"}>
                {[0.55, 0.85, 1, 0.75, 0.5].map((k, i) => (
                  <span key={i} className="w-[3px] rounded-full bg-violeta transition-[height] duration-75" style={{ height: `${Math.max(3, Math.min(20, 3 + level * 22 * k * (0.75 + 0.5 * Math.abs(Math.sin(Date.now() / 140 + i)))))}px`, opacity: voz && vozDisponivel !== false ? 1 : 0.3 }} />
                ))}
              </div>
              <button type="button" onClick={toggleVoz} className="btn-secondary btn-sm" aria-pressed={voz}>
                {voz ? "🔊 Narração ligada" : "🔈 Narração desligada"}
              </button>
              <button type="button" onClick={() => void play(0)} className="btn-secondary btn-sm" disabled={phase === "carregando"}>↻ Repetir</button>
            </div>
            {vozDisponivel === false && <p className="mt-3 text-sm text-noite-50">A voz da Corujinha está indisponível agora; acompanhe pelo texto.</p>}

            <button type="button" onClick={() => leave(false)} className={`btn-primary mt-6 w-full justify-center ${phase === "fim" ? "animate-[pulse_1.6s_ease-in-out_2]" : ""}`}>{intro ? "Entrar no app" : "Continuar para o app"}</button>
            {intro && <button type="button" onClick={() => leave(true)} className="mt-3 w-full text-center text-sm text-noite-50 hover:text-violeta">Não mostrar mais esta apresentação</button>}
            </>)}
          </div>
        </div>
      </div>

      {phase === "tocar" && (
        <button type="button" onClick={() => void play(idx)}
          className="fixed inset-0 z-20 grid place-items-center bg-noite/30 backdrop-blur-[2px]">
          <span className="flex items-center gap-3 rounded-full bg-white px-7 py-4 text-lg font-semibold text-violeta shadow-xl">
            <span className="grid h-10 w-10 place-items-center rounded-full bg-violeta text-white">▶</span>
            Ouvir a Corujinha
          </span>
        </button>
      )}
    </main>
  );
}
