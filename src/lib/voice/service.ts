import "server-only";
import { createHash } from "node:crypto";
import { asSystem } from "../db";
import { forSpeech, voiceConfig, type VoiceConfig } from "./config";

/** Camada de voz: o resto do app só chama getSpeech(); o provedor fica isolado aqui. */

export const LIMITS = {
  maxChars: 800,
  perUserPerHour: 20,     // gerações novas (fora do cache) por usuário
  globalPerDay: 400,      // teto de custo diário
};

export class VoiceError extends Error {
  constructor(public code: "sem_provedor" | "texto_invalido" | "limite_usuario" | "limite_global" | "provedor_falhou", message: string, public status = 400) {
    super(message);
  }
}

export type Speech = { hash: string; mime: string; audio: Buffer; cached: boolean };

export function validateText(raw: string) {
  const t = String(raw ?? "").replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();
  if (!t || !/\p{L}/u.test(t)) throw new VoiceError("texto_invalido", "Texto vazio.");
  if (t.length > LIMITS.maxChars) throw new VoiceError("texto_invalido", `Texto muito longo (máximo ${LIMITS.maxChars} caracteres).`);
  return t;
}

function instructionsFor(cfg: VoiceConfig, emocao?: string) {
  const extra = cfg.expressiveness >= 0.7 ? "Capriche na expressividade." : cfg.expressiveness <= 0.3 ? "Seja mais contida na expressividade." : "";
  return [cfg.persona, emocao ? `Nesta fala: ${emocao}.` : "", extra].filter(Boolean).join("\n");
}

/** Identidade da geração: mesma fala + mesma configuração vocal = mesmo áudio. */
export function speechHash(cfg: VoiceConfig, text: string, emocao?: string) {
  const p = cfg.provider;
  const ident = p === "openai"
    ? { p, m: cfg.openai.model, v: cfg.openai.voice, s: cfg.speed, i: instructionsFor(cfg, emocao) }
    : { p, m: cfg.elevenlabs.model, v: cfg.elevenlabs.voiceId, s: cfg.speed, st: cfg.elevenlabs.stability, si: cfg.elevenlabs.similarity, e: cfg.expressiveness };
  return createHash("sha256").update(JSON.stringify({ ...ident, t: forSpeech(text) })).digest("hex");
}

async function synthOpenAi(cfg: VoiceConfig, text: string, emocao?: string): Promise<{ audio: Buffer; mime: string }> {
  const res = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    signal: AbortSignal.timeout(45_000),
    headers: { authorization: `Bearer ${cfg.openai.key}`, "content-type": "application/json" },
    body: JSON.stringify({
      model: cfg.openai.model, voice: cfg.openai.voice, input: forSpeech(text),
      instructions: instructionsFor(cfg, emocao), response_format: "mp3", speed: cfg.speed,
    }),
  });
  if (!res.ok) throw await providerError("openai", res);
  return { audio: Buffer.from(await res.arrayBuffer()), mime: "audio/mpeg" };
}

async function synthElevenLabs(cfg: VoiceConfig, text: string): Promise<{ audio: Buffer; mime: string }> {
  const el = cfg.elevenlabs;
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(el.voiceId!)}?output_format=mp3_44100_128`, {
    method: "POST",
    signal: AbortSignal.timeout(45_000),
    headers: { "xi-api-key": el.key!, "content-type": "application/json", accept: "audio/mpeg" },
    body: JSON.stringify({
      text: forSpeech(text), model_id: el.model,
      voice_settings: { stability: el.stability, similarity_boost: el.similarity, style: Number((cfg.expressiveness * 0.6).toFixed(2)), use_speaker_boost: true, speed: cfg.speed },
    }),
  });
  if (!res.ok) throw await providerError("elevenlabs", res);
  return { audio: Buffer.from(await res.arrayBuffer()), mime: "audio/mpeg" };
}

async function providerError(provider: string, res: Response) {
  const body = (await res.text()).slice(0, 300).replace(/sk-[\w-]{8,}/g, "sk-***");
  console.error(`voz: ${provider} respondeu ${res.status}`, body);
  lastStatus = { ok: false, at: new Date().toISOString(), provider, detail: `${res.status} ${body.slice(0, 160)}` };
  return new VoiceError("provedor_falhou", "Não foi possível gerar a voz agora.", 503);
}

export type VoiceStatus = { ok: boolean | null; at: string | null; provider: string | null; detail?: string };
let lastStatus: VoiceStatus = { ok: null, at: null, provider: null };
export function voiceStatus(): VoiceStatus & { configured: string | null; voice: string | null } {
  const cfg = voiceConfig();
  const voice = cfg.provider === "openai" ? `${cfg.openai.model} · ${cfg.openai.voice}` : cfg.provider === "elevenlabs" ? `${cfg.elevenlabs.model} · ${cfg.elevenlabs.voiceId}` : null;
  return { ...lastStatus, configured: cfg.provider, voice };
}

/**
 * Devolve o áudio de uma fala: do cache quando já existe; senão gera,
 * respeitando os limites, e guarda para as próximas vezes.
 */
export async function getSpeech(opts: { text: string; emocao?: string; userId: string | null; bypassUserLimit?: boolean }): Promise<Speech> {
  const text = validateText(opts.text);
  const cfg = voiceConfig();
  if (!cfg.provider) throw new VoiceError("sem_provedor", "Voz não configurada.", 503);
  const hash = speechHash(cfg, text, opts.emocao);

  const hit = await asSystem(async (tx) => {
    const r = await tx`update tts_cache set hits = hits + 1, last_used_at = now() where hash = ${hash} returning mime, audio`;
    return r[0] as { mime: string; audio: Buffer } | undefined;
  });
  if (hit) return { hash, mime: hit.mime, audio: Buffer.from(hit.audio), cached: true };

  // Limites (só para gerações novas)
  await asSystem(async (tx) => {
    const [g] = await tx`select count(*)::int as n from tts_requests where ok and created_at > now() - interval '1 day'`;
    if (g.n >= LIMITS.globalPerDay) throw new VoiceError("limite_global", "Limite diário de geração de voz atingido.", 429);
    if (opts.userId && !opts.bypassUserLimit) {
      const [u] = await tx`select count(*)::int as n from tts_requests where user_id = ${opts.userId} and created_at > now() - interval '1 hour'`;
      if (u.n >= LIMITS.perUserPerHour) throw new VoiceError("limite_usuario", "Muitas falas novas em pouco tempo. Tente daqui a pouco.", 429);
    }
  });

  let out: { audio: Buffer; mime: string };
  try {
    out = cfg.provider === "openai" ? await synthOpenAi(cfg, text, opts.emocao) : await synthElevenLabs(cfg, text);
    if (out.audio.length < 500) throw new VoiceError("provedor_falhou", "Áudio vazio.", 503);
  } catch (e) {
    await asSystem((tx) => tx`insert into tts_requests (user_id, hash, ok, chars) values (${opts.userId}, ${hash}, false, ${text.length})`);
    if (e instanceof VoiceError) throw e;
    console.error(`voz: falha na chamada ao provedor ${cfg.provider}:`, String(e).slice(0, 200));
    lastStatus = { ok: false, at: new Date().toISOString(), provider: cfg.provider, detail: String(e).slice(0, 160) };
    throw new VoiceError("provedor_falhou", "Não foi possível gerar a voz agora.", 503);
  }
  lastStatus = { ok: true, at: new Date().toISOString(), provider: cfg.provider };
  const voice = cfg.provider === "openai" ? cfg.openai.voice : cfg.elevenlabs.voiceId!;
  const model = cfg.provider === "openai" ? cfg.openai.model : cfg.elevenlabs.model;
  await asSystem(async (tx) => {
    await tx`insert into tts_cache (hash, provider, voice, model, text, mime, audio, bytes)
             values (${hash}, ${cfg.provider}, ${voice}, ${model}, ${text}, ${out.mime}, ${out.audio}, ${out.audio.length})
             on conflict (hash) do nothing`;
    await tx`insert into tts_requests (user_id, hash, ok, chars) values (${opts.userId}, ${hash}, true, ${text.length})`;
  });
  console.info(`voz: gerada (${cfg.provider}, ${text.length} caracteres, ${Math.round(out.audio.length / 1024)} KB, ${hash.slice(0, 8)})`);
  return { hash, mime: out.mime, audio: out.audio, cached: false };
}

export function audioResponse(s: Speech) {
  return new Response(new Uint8Array(s.audio), {
    headers: {
      "content-type": s.mime,
      "content-length": String(s.audio.length),
      "cache-control": "private, max-age=604800",
      etag: `"${s.hash.slice(0, 32)}"`,
      "x-voz-cache": s.cached ? "hit" : "miss",
      "x-voz-tom": String(voiceConfig().pitch),
    },
  });
}

export function errorResponse(e: unknown) {
  if (e instanceof VoiceError) return Response.json({ erro: e.code, mensagem: e.message }, { status: e.status });
  console.error("voz: erro inesperado", String(e).slice(0, 200));
  return Response.json({ erro: "erro", mensagem: "Falha ao obter a voz." }, { status: 500 });
}
