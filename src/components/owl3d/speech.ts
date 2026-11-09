/**
 * Reprodutor de falas da Corujinha (navegador).
 * Usa um único elemento <audio>, que fica “liberado” depois do primeiro toque
 * do usuário (exigência do iOS/Android), e guarda áudios já carregados.
 */
import { analyzeAudio, type LipTrack } from "./lipsync";

export type Loaded = { url: string; track: LipTrack | null; duration: number };
export type PlayResult = "ended" | "blocked" | "stopped" | "error";

const cache = new Map<string, Promise<Loaded>>();

export const falaUrl = (id: string) => `/api/voz/fala/${encodeURIComponent(id)}`;

/** Baixa e analisa o áudio uma vez; chamadas repetidas reaproveitam. */
export function loadSpeech(src: string, init?: RequestInit): Promise<Loaded> {
  const key = init?.body ? `${src}#${String(init.body)}` : src;
  let p = cache.get(key);
  if (!p) {
    p = (async () => {
      const res = await fetch(src, init);
      if (!res.ok) {
        let code = "erro";
        try { code = (await res.json()).erro ?? code; } catch { /* resposta sem JSON */ }
        throw new Error(code);
      }
      const buf = await res.arrayBuffer();
      const blob = new Blob([buf], { type: res.headers.get("content-type") ?? "audio/mpeg" });
      let track: LipTrack | null = null;
      try { track = await analyzeAudio(buf); } catch { track = null; }
      return { url: URL.createObjectURL(blob), track, duration: track?.duration ?? 0 };
    })();
    p.catch(() => cache.delete(key));
    cache.set(key, p);
  }
  return p;
}

export class SpeechPlayer {
  readonly audio: HTMLAudioElement;
  private finish: ((r: PlayResult) => void) | null = null;
  current: Loaded | null = null;

  constructor() {
    this.audio = new Audio();
    this.audio.preload = "auto";
    this.audio.setAttribute("playsinline", "");
    this.audio.addEventListener("ended", () => this.done("ended"));
    this.audio.addEventListener("error", () => this.done("error"));
  }

  private done(r: PlayResult) { const f = this.finish; this.finish = null; if (r !== "stopped") this.current = null; f?.(r); }

  get time() { return this.current ? this.audio.currentTime : -1; }
  get playing() { return !!this.current && !this.audio.paused; }

  play(l: Loaded, opts: { rate?: number; volume?: number } = {}): Promise<PlayResult> {
    this.stop();
    this.current = l;
    this.audio.src = l.url;
    this.audio.playbackRate = opts.rate ?? 1;
    this.audio.volume = Math.min(1, Math.max(0, opts.volume ?? 0.9));
    return new Promise<PlayResult>((resolve) => {
      this.finish = resolve;
      this.audio.play().catch((e: Error) => { this.current = null; this.finish = null; resolve(e?.name === "NotAllowedError" ? "blocked" : "error"); });
    });
  }

  stop() {
    if (!this.audio.paused) this.audio.pause();
    this.current = null;
    this.done("stopped");
  }

  dispose() { this.stop(); this.audio.removeAttribute("src"); this.audio.load(); }
}
