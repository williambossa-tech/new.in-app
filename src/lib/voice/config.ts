import "server-only";

/**
 * Identidade vocal da Corujinha — configuração central.
 * Todas as falas usam esta mesma voz. Para trocar provedor, voz, velocidade
 * ou estilo, altere as variáveis de ambiente (veja .env.example).
 */

export type VoiceProvider = "openai" | "elevenlabs";

export const PERSONA = `Você é a voz da Corujinha, mascote do Condomínio NEW.IN: uma corujinha pequena de desenho animado infantil.
Voz feminina bem fofa, doce e meiga, aguda e infantil, como a de uma personagem criança de animação: encantadora, risonha e cheia de carinho.
Fala com alegria e um sorriso na voz, com entonação cantada e brincalhona de personagem de desenho, sem gritar e sem ficar estridente.
Português do Brasil com pronúncia natural e clara, sotaque neutro.
Ritmo tranquilo e gostoso de ouvir, com pausas naturais nas vírgulas e entre as frases; entonação bem variada e expressiva, nunca monótona.
Nada de tom robótico, metálico, de GPS ou de atendimento telefônico.
Leia exatamente o texto, sem acrescentar nem omitir palavras.`;

const num = (v: string | undefined, d: number, min: number, max: number) => {
  const n = Number(v); return Number.isFinite(n) && v !== "" && v != null ? Math.min(max, Math.max(min, n)) : d;
};
const clean = (v: string | undefined) => (v ?? "").trim().replace(/^["'`]+|["'`]+$/g, "").replace(/\s+/g, "") || null;

export function openAiKey() {
  const oa = clean(process.env.OPENAI_API_KEY);
  if (oa) return oa;
  const an = clean(process.env.ANTHROPIC_API_KEY); // chave da OpenAI colocada na variável antiga
  return an && !an.startsWith("sk-ant-") ? an : null;
}

export function voiceConfig() {
  const elKey = clean(process.env.ELEVENLABS_API_KEY);
  const elVoice = clean(process.env.ELEVENLABS_VOICE_ID);
  const wanted = (process.env.TTS_PROVIDER ?? "auto").trim().toLowerCase();
  let provider: VoiceProvider | null = null;
  if (wanted === "elevenlabs") provider = elKey && elVoice ? "elevenlabs" : null;
  else if (wanted === "openai") provider = openAiKey() ? "openai" : null;
  else provider = elKey && elVoice ? "elevenlabs" : openAiKey() ? "openai" : null;

  return {
    provider,
    language: "pt-BR",
    speed: num(process.env.TTS_SPEED, 0.9, 0.7, 1.3),
    /** tom aplicado na reprodução (1 = original; 1.12 ≈ dois semitons acima, voz mais infantil).
     *  Sobe como “fita acelerada”, sem o efeito metálico; a velocidade é compensada em TTS_SPEED. */
    pitch: num(process.env.TTS_TOM, 1.12, 0.85, 1.35),
    /** volume padrão sugerido ao componente (0–1) */
    volume: num(process.env.TTS_VOLUME, 0.9, 0, 1),
    /** intensidade expressiva 0–1 (ElevenLabs: style; OpenAI: reforço nas instruções) */
    expressiveness: num(process.env.TTS_EXPRESSIVIDADE, 0.6, 0, 1),
    persona: (process.env.TTS_ESTILO ?? "").trim() || PERSONA,
    openai: {
      key: openAiKey(),
      model: (process.env.OPENAI_TTS_MODEL ?? "").trim() || "gpt-4o-mini-tts",
      voice: (process.env.OPENAI_TTS_VOICE ?? "").trim() || "coral",
    },
    elevenlabs: {
      key: elKey,
      voiceId: elVoice,
      model: (process.env.ELEVENLABS_MODEL ?? "").trim() || "eleven_multilingual_v2",
      stability: num(process.env.ELEVENLABS_STABILITY, 0.4, 0, 1),
      similarity: num(process.env.ELEVENLABS_SIMILARITY, 0.8, 0, 1),
    },
  };
}
export type VoiceConfig = ReturnType<typeof voiceConfig>;

/** Ajustes de pronúncia aplicados antes de enviar o texto ao provedor. */
export const PRONUNCIA: [RegExp, string][] = [
  [/NEW\.IN/g, "New In"],
];
export const forSpeech = (t: string) => PRONUNCIA.reduce((s, [re, r]) => s.replace(re, r), t);
