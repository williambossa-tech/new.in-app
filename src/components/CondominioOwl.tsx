"use client";
/* eslint-disable @next/next/no-img-element */
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { levelAt, mouthAt } from "./owl3d/lipsync";
import type { Outfit, OwlExpression, OwlRig, OwlState } from "./owl3d/OwlRig";
import { falaUrl, loadSpeech, SpeechPlayer, type Loaded, type PlayResult } from "./owl3d/speech";

export type { OwlExpression, OwlState };

export type SpeakInput = {
  /** fala registrada (src/lib/voice/falas.ts) */
  falaId?: string;
  /** URL de um áudio já pronto */
  audio?: string;
  /** resposta da Corujinha a ser lida em voz alta */
  perguntaId?: string;
  estado?: OwlState;
  expressao?: OwlExpression;
};

export type CondominioOwlHandle = {
  /** Fala e resolve quando termina; “blocked” se o navegador exigir um toque antes. */
  speak(input: SpeakInput): Promise<PlayResult>;
  /** Carrega (e analisa) o áudio antes, para começar sem espera. */
  preload(input: SpeakInput): Promise<Loaded>;
  stop(): void;
  setState(s: OwlState): void;
  setExpression(e: OwlExpression): void;
  /** Nível do áudio atual (0–1), para indicadores visuais. */
  level(): number;
  /** Progresso da fala atual (segundos). */
  progress(): { t: number; d: number };
};

export type CondominioOwlProps = {
  texto?: string;
  estado?: OwlState;
  expressao?: OwlExpression;
  falaId?: string;
  audio?: string;
  velocidade?: number;
  volume?: number;
  vozAtiva?: boolean;
  autoPlay?: boolean;
  /** mude o valor para repetir a fala */
  repetir?: number;
  mostrarTexto?: boolean;
  entrada?: boolean;
  qualidade?: "alta" | "leve";
  /** roupa temática (quadras e piscina) */
  outfit?: Outfit;
  className?: string;
  ariaLabel?: string;
  onFim?: (r: PlayResult) => void;
};

function requestFor(input: SpeakInput): [string, RequestInit | undefined] | null {
  if (input.falaId) return [falaUrl(input.falaId), undefined];
  if (input.audio) return [input.audio, undefined];
  if (input.perguntaId) return ["/api/voz", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ perguntaId: input.perguntaId }) }];
  return null;
}

export const CondominioOwl = forwardRef<CondominioOwlHandle, CondominioOwlProps>(function CondominioOwl(props, ref) {
  const { texto, estado = "idle", expressao = "neutral", falaId, audio, velocidade = 1, volume = 0.9, vozAtiva = true, autoPlay = false, repetir = 0, mostrarTexto = false, entrada = true, qualidade, outfit, className = "", ariaLabel, onFim } = props;
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const rig = useRef<OwlRig | null>(null);
  const player = useRef<SpeechPlayer | null>(null);
  const speakingState = useRef<OwlState | null>(null);
  const base = useRef({ estado, expressao });
  const [fallback, setFallback] = useState(false);
  const [ready, setReady] = useState(false);
  base.current = { estado, expressao };

  // Cria a cena 3D só no navegador e só quando necessário (three.js fica fora do pacote principal)
  useEffect(() => {
    let disposed = false; let ro: ResizeObserver | null = null; let io: IntersectionObserver | null = null; let raf = 0;
    let cleanupSync = () => {};
    const onVis = () => rig.current?.setVisible(document.visibilityState === "visible");
    (async () => {
      const mod = await import("./owl3d/OwlRig");
      if (disposed || !canvas.current) return;
      if (!mod.webglAvailable()) { setFallback(true); return; }
      let r: OwlRig;
      try {
        const low = (navigator.hardwareConcurrency ?? 8) <= 4 || /Android [4-8]\b/.test(navigator.userAgent);
        r = new mod.OwlRig(canvas.current, { quality: qualidade ?? (low ? "leve" : "alta"), outfit });
      } catch { setFallback(true); return; }
      rig.current = r;
      r.setState(base.current.estado); r.setExpression(base.current.expressao);
      const fit = () => { const el = wrap.current; if (el) r.resize(el.clientWidth, el.clientHeight); };
      fit(); ro = new ResizeObserver(fit); if (wrap.current) ro.observe(wrap.current);
      io = new IntersectionObserver(([e]) => r.setVisible(e.isIntersecting && document.visibilityState === "visible")); if (wrap.current) io.observe(wrap.current);
      document.addEventListener("visibilitychange", onVis);
      // entrada com “pulinho”
      if (entrada) {
        const t0 = performance.now();
        const step = (now: number) => { const k = Math.min(1, (now - t0) / 900); const e = 1 - Math.pow(1 - k, 3); r.setEntrance(e); if (k < 1) raf = requestAnimationFrame(step); };
        r.setEntrance(0); raf = requestAnimationFrame(step);
      }
      r.start(); setReady(true);
      // bico acompanha o áudio atual
      const sync = () => {
        const p = player.current;
        if (p && rig.current) rig.current.setMouth(p.playing ? mouthAt(p.current?.track ?? null, p.time) : { open: 0, wide: 0, round: 0 });
        raf2 = requestAnimationFrame(sync);
      };
      let raf2 = requestAnimationFrame(sync);
      cleanupSync = () => cancelAnimationFrame(raf2);
    })();
    return () => {
      disposed = true; cancelAnimationFrame(raf); cleanupSync(); ro?.disconnect(); io?.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      rig.current?.dispose(); rig.current = null;
    };
  }, [entrada, qualidade, outfit]);

  useEffect(() => { player.current = new SpeechPlayer(); return () => { player.current?.dispose(); player.current = null; }; }, []);
  useEffect(() => { if (!speakingState.current) rig.current?.setState(estado); }, [estado]);
  useEffect(() => { rig.current?.setExpression(expressao); }, [expressao]);

  const preload = useCallback((input: SpeakInput) => {
    const r = requestFor(input); if (!r) return Promise.reject(new Error("sem_audio"));
    return loadSpeech(r[0], r[1]);
  }, []);

  const speak = useCallback(async (input: SpeakInput): Promise<PlayResult> => {
    const p = player.current; if (!p) return "error";
    let loaded: Loaded;
    try { loaded = await preload(input); } catch { return "error"; }
    const st = input.estado ?? "talking";
    speakingState.current = st; rig.current?.setState(st);
    if (input.expressao) rig.current?.setExpression(input.expressao);
    const res = await p.play(loaded, { rate: velocidade, volume });
    speakingState.current = null;
    if (res !== "stopped") rig.current?.setState(base.current.estado);
    if (input.expressao) rig.current?.setExpression(base.current.expressao);
    return res;
  }, [preload, velocidade, volume]);

  useImperativeHandle(ref, () => ({
    speak, preload,
    stop: () => { player.current?.stop(); speakingState.current = null; rig.current?.setState(base.current.estado); },
    setState: (s) => rig.current?.setState(s),
    setExpression: (e) => rig.current?.setExpression(e),
    level: () => { const p = player.current; return p?.playing ? levelAt(p.current?.track ?? null, p.time) : 0; },
    progress: () => { const p = player.current; return p?.current ? { t: Math.max(0, p.time), d: p.audio.duration || p.current.duration || 0 } : { t: 0, d: 0 }; },
  }), [speak, preload]);

  // Uso declarativo: falaId/audio + autoPlay (ou mudança de “repetir”)
  useEffect(() => {
    if (!vozAtiva || !(falaId || audio) || (!autoPlay && !repetir)) return;
    let alive = true;
    speak({ falaId, audio }).then((r) => alive && onFim?.(r));
    return () => { alive = false; player.current?.stop(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [falaId, audio, autoPlay, repetir, vozAtiva]);
  useEffect(() => { if (!vozAtiva) player.current?.stop(); }, [vozAtiva]);

  return (
    <div ref={wrap} className={`relative ${className}`} role="img" aria-label={ariaLabel ?? "Corujinha do NEW.IN"}>
      {fallback ? (
        <img src={`/corujinha/${outfit ? "festa" : "ola"}.webp`} alt="" className="owl-bob absolute inset-0 m-auto h-full w-full object-contain" draggable={false} />
      ) : (
        <canvas ref={canvas} className={`absolute inset-0 h-full w-full transition-opacity duration-500 ${ready ? "opacity-100" : "opacity-0"}`} />
      )}
      {mostrarTexto && texto && <p className="sr-only" aria-live="polite">{texto}</p>}
    </div>
  );
});
