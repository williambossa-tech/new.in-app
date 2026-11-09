import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { voiceConfig } from "@/lib/voice/config";
import { APRESENTACAO } from "@/lib/voice/falas";
import { getSpeech, LIMITS, speechHash, validateText, VoiceError } from "@/lib/voice/service";
import { mkUser } from "./helpers";

const env = { ...process.env };
afterEach(() => { process.env = { ...env }; vi.unstubAllGlobals(); });
let user: string;
beforeAll(async () => { user = await mkUser({ unit: "1601" }); });

const MP3 = Buffer.alloc(4000, 7);
function mockTts(status = 200) {
  const calls: { url: string; headers: Record<string, string>; body: Record<string, unknown> }[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ url, headers: init.headers as Record<string, string>, body: JSON.parse(String(init.body)) });
    return status === 200 ? new Response(MP3, { status: 200, headers: { "content-type": "audio/mpeg" } }) : new Response('{"error":"bad key sk-proj-abcdefghijk"}', { status });
  }));
  return calls;
}

describe("Voz da Corujinha", () => {
  it("escolhe o provedor pela configuração e mantém a voz fixa", () => {
    delete process.env.OPENAI_API_KEY; delete process.env.ANTHROPIC_API_KEY; delete process.env.ELEVENLABS_API_KEY; delete process.env.ELEVENLABS_VOICE_ID;
    expect(voiceConfig().provider).toBeNull();
    process.env.OPENAI_API_KEY = "sk-proj-x";
    expect(voiceConfig().provider).toBe("openai");
    expect(voiceConfig().openai.voice).toBe("coral");
    process.env.ELEVENLABS_API_KEY = "el"; process.env.ELEVENLABS_VOICE_ID = "voz123";
    expect(voiceConfig().provider).toBe("elevenlabs");
    process.env.TTS_PROVIDER = "openai";
    expect(voiceConfig().provider).toBe("openai");
  });

  it("valida o texto", () => {
    expect(() => validateText("   ")).toThrow(VoiceError);
    expect(() => validateText("1234")).toThrow(VoiceError);
    expect(() => validateText("a".repeat(LIMITS.maxChars + 1))).toThrow(/longo/);
    expect(validateText(" Oi\u0000  tudo bem? ")).toBe("Oi tudo bem?");
  });

  it("gera com a OpenAI uma única vez e depois usa o cache", async () => {
    process.env.OPENAI_API_KEY = "sk-proj-teste"; delete process.env.ELEVENLABS_API_KEY;
    const calls = mockTts();
    const f = APRESENTACAO[0];
    const a = await getSpeech({ text: f.texto, emocao: f.emocao, userId: user });
    expect(a.cached).toBe(false);
    expect(a.audio.length).toBe(MP3.length);
    const b = await getSpeech({ text: f.texto, emocao: f.emocao, userId: user });
    expect(b.cached).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain("/v1/audio/speech");
    expect(calls[0].body.voice).toBe("coral");
    expect(String(calls[0].body.instructions)).toContain("Corujinha");
    expect(String(calls[0].body.instructions)).toContain(f.emocao);
    expect(calls[0].headers.authorization).toBe("Bearer sk-proj-teste");
  });

  it("mudar a configuração da voz gera um novo áudio (sem misturar vozes)", () => {
    process.env.OPENAI_API_KEY = "sk-proj-teste";
    const h1 = speechHash(voiceConfig(), "Olá", "x");
    process.env.OPENAI_TTS_VOICE = "shimmer";
    expect(speechHash(voiceConfig(), "Olá", "x")).not.toBe(h1);
  });

  it("ElevenLabs recebe voz, modelo e ajustes", async () => {
    process.env.ELEVENLABS_API_KEY = "el-key"; process.env.ELEVENLABS_VOICE_ID = "voz-coruja";
    const calls = mockTts();
    await getSpeech({ text: "Teste da ElevenLabs.", userId: user });
    expect(calls[0].url).toContain("/v1/text-to-speech/voz-coruja");
    expect(calls[0].headers["xi-api-key"]).toBe("el-key");
    expect(calls[0].body.model_id).toBe("eleven_multilingual_v2");
  });

  it("falha do provedor não grava cache e não expõe a chave nos logs", async () => {
    process.env.OPENAI_API_KEY = "sk-proj-teste";
    mockTts(401);
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(getSpeech({ text: "Frase que vai falhar.", userId: user })).rejects.toMatchObject({ code: "provedor_falhou" });
    expect(JSON.stringify(err.mock.calls)).not.toContain("sk-proj-abcdefghijk");
    const [c] = await db()`select count(*)::int as n from tts_cache where text = 'Frase que vai falhar.'`;
    expect(c.n).toBe(0);
    err.mockRestore();
  });

  it("limita gerações novas por usuário", async () => {
    process.env.OPENAI_API_KEY = "sk-proj-teste";
    mockTts();
    const u2 = await mkUser({ unit: "1602" });
    for (let i = 0; i < LIMITS.perUserPerHour; i++) await getSpeech({ text: `Frase número ${i} para limite.`, userId: u2 });
    await expect(getSpeech({ text: "Uma a mais.", userId: u2 })).rejects.toMatchObject({ code: "limite_usuario" });
    // fala já existente continua liberada
    expect((await getSpeech({ text: "Frase número 0 para limite.", userId: u2 })).cached).toBe(true);
  });

  it("sem provedor configurado, informa em vez de simular", async () => {
    delete process.env.OPENAI_API_KEY; delete process.env.ANTHROPIC_API_KEY; delete process.env.ELEVENLABS_API_KEY;
    await expect(getSpeech({ text: "Oi", userId: user })).rejects.toMatchObject({ code: "sem_provedor" });
  });
});
