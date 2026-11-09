/**
 * Sincronização do bico com o áudio real.
 * O áudio é decodificado e analisado quadro a quadro (60 por segundo):
 * energia e distribuição de frequências viram visemas do bico
 *   fechado (M/B/P e pausas) · A (aberto) · E/I/S (largo) · O/U (arredondado).
 * Na reprodução, o quadro é escolhido pelo tempo atual do áudio — sem movimento aleatório.
 */
import type { Mouth } from "./OwlRig";

export type Viseme = "rest" | "A" | "E" | "O";
export type LipTrack = { fps: number; duration: number; open: Float32Array; wide: Float32Array; round: Float32Array; energy: Float32Array };

const FPS = 60;
const N = 1024;

function fft(re: Float32Array, im: Float32Array) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = a + len / 2;
        const tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
        const ncr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = ncr;
      }
    }
  }
}

export function analyzeSamples(data: Float32Array, sampleRate: number): LipTrack {
  const hop = sampleRate / FPS; const frames = Math.max(1, Math.ceil(data.length / hop));
  const energy = new Float32Array(frames), cent = new Float32Array(frames);
  const win = new Float32Array(N); for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1));
  const re = new Float32Array(N), im = new Float32Array(N);
  const bin = (hz: number) => Math.min(N / 2 - 1, Math.round((hz * N) / sampleRate));
  const [k0, k1] = [bin(90), bin(6500)]; const hzPerBin = sampleRate / N;
  for (let f = 0; f < frames; f++) {
    const start = Math.floor(f * hop - N / 2); let sum = 0;
    for (let i = 0; i < N; i++) { const s = data[start + i] ?? 0; re[i] = s * win[i]; im[i] = 0; sum += s * s; }
    energy[f] = Math.sqrt(sum / N);
    fft(re, im);
    let p = 0, pk = 0;
    for (let k = k0; k < k1; k++) { const v = re[k] * re[k] + im[k] * im[k]; p += v; pk += v * k; }
    cent[f] = p > 0 ? (pk / p) * hzPerBin : 0;
  }
  // energia normalizada pelo percentil 95 (independe do volume do arquivo)
  const pct = (arr: number[], q: number) => { const a = [...arr].sort((x, y) => x - y); return a[Math.min(a.length - 1, Math.floor(a.length * q))] ?? 0; };
  const ref = pct(Array.from(energy), 0.95) || 1;
  for (let f = 0; f < frames; f++) energy[f] = Math.min(1.2, energy[f] / ref);
  // “brilho” do som calibrado por arquivo: escuro = O/U, médio = A, claro = E/I/S
  const voiced = Array.from(cent).filter((_, f) => energy[f] >= 0.1);
  const lo = pct(voiced, 0.3), hi = pct(voiced, 0.8);
  const open = new Float32Array(frames), wide = new Float32Array(frames), round = new Float32Array(frames);
  for (let f = 0; f < frames; f++) {
    const e = energy[f];
    const v = visemeOf(e, cent[f], lo, hi);
    const amt = Math.min(1, Math.max(0, (e - 0.1) / 0.75));
    if (v === "E") { open[f] = 0.22 + amt * 0.35; wide[f] = 1; }
    else if (v === "O") { open[f] = 0.4 + amt * 0.45; round[f] = 1; }
    else if (v === "A") { open[f] = 0.5 + amt * 0.5; wide[f] = 0.35; }
  }
  // suavização leve para transições naturais entre visemas
  for (const arr of [open, wide, round]) for (let f = 1; f < frames - 1; f++) arr[f] = (arr[f - 1] + 2 * arr[f] + arr[f + 1]) / 4;
  return { fps: FPS, duration: data.length / sampleRate, open, wide, round, energy };
}

export function visemeOf(e: number, centroidHz: number, lo: number, hi: number): Viseme {
  if (e < 0.1) return "rest";
  if (centroidHz >= hi) return "E";
  if (centroidHz <= lo) return "O";
  return "A";
}

export async function analyzeAudio(buf: ArrayBuffer): Promise<LipTrack> {
  const Ctx = (window.OfflineAudioContext || (window as unknown as { webkitOfflineAudioContext: typeof OfflineAudioContext }).webkitOfflineAudioContext);
  const ctx = new Ctx(1, 2, 44100);
  const audio: AudioBuffer = await new Promise((res, rej) => {
    const p = ctx.decodeAudioData(buf.slice(0), res, rej) as unknown as Promise<AudioBuffer> | undefined;
    p?.then?.(res, rej);
  });
  const ch = audio.getChannelData(0);
  return analyzeSamples(ch, audio.sampleRate);
}

export function mouthAt(track: LipTrack | null, t: number): Mouth {
  if (!track || t < 0 || t >= track.duration) return { open: 0, wide: 0, round: 0 };
  const f = Math.min(track.open.length - 1, Math.floor(t * track.fps));
  return { open: track.open[f], wide: track.wide[f], round: track.round[f] };
}

export const levelAt = (track: LipTrack | null, t: number) =>
  !track || t < 0 || t >= track.duration ? 0 : track.energy[Math.min(track.energy.length - 1, Math.floor(t * track.fps))];
