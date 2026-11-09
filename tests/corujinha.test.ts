import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { aiConfig, aiState, openAiText, testAi } from "@/lib/ai";
import { askCorujinha, searchKb } from "@/lib/corujinha";
import { asSystem, db } from "@/lib/db";
import { mkUser } from "./helpers";

const env = { ...process.env };
afterEach(() => { process.env = { ...env }; vi.unstubAllGlobals(); });

let user: string; let unit: string;
beforeAll(async () => {
  user = await mkUser({ unit: "1501" });
  unit = (await db()`select id from units where code = '1501'`)[0].id;
});

function mockOpenAi(answer: object, opts: { status?: number } = {}) {
  const calls: { url: string; body: Record<string, unknown> | null }[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : null });
    if (url.endsWith("/v1/models")) return new Response(JSON.stringify({ data: [{ id: "gpt-4o" }, { id: "gpt-5.4-mini" }] }), { status: 200 });
    if (opts.status && opts.status !== 200) return new Response('{"error":{"message":"Incorrect API key"}}', { status: opts.status });
    return new Response(JSON.stringify({ output: [{ type: "reasoning" }, { type: "message", content: [{ type: "output_text", text: JSON.stringify(answer) }] }] }), { status: 200 });
  }));
  return calls;
}

describe("Corujinha com IA", () => {
  it("reconhece a chave da OpenAI, inclusive na variável da Anthropic, e limpa aspas/espaços", () => {
    delete process.env.OPENAI_API_KEY; delete process.env.ANTHROPIC_API_KEY;
    expect(aiConfig()).toBeNull();
    process.env.ANTHROPIC_API_KEY = ' "sk-proj-abc123" ';
    expect(aiConfig()).toEqual({ provider: "openai", key: "sk-proj-abc123" });
    process.env.ANTHROPIC_API_KEY = "sk-ant-api03-xyz";
    expect(aiConfig()?.provider).toBe("anthropic");
    delete process.env.ANTHROPIC_API_KEY; process.env.OPENAI_API_KEY = "sk-proj-1\n";
    expect(aiConfig()).toEqual({ provider: "openai", key: "sk-proj-1" });
  });

  it("lê o texto das respostas da OpenAI (Responses e Chat Completions)", () => {
    expect(openAiText({ output_text: "a" })).toBe("a");
    expect(openAiText({ output: [{ type: "message", content: [{ type: "output_text", text: "b" }] }] })).toBe("b");
    expect(openAiText({ choices: [{ message: { content: "c" } }] })).toBe("c");
  });

  it("responde citando o Regimento e conta no limite da unidade", async () => {
    process.env.OPENAI_API_KEY = "sk-proj-teste";
    const [chunk] = await asSystem((tx) => searchKb(tx, "Qual é o horário de silêncio?", 12));
    expect(chunk).toBeTruthy();
    const calls = mockOpenAi({ resposta: "O silêncio vale das 22h às 8h (Regimento Interno, item X).", fontes: [`${chunk.source}|${chunk.ref}`] });
    const r = await askCorujinha(user, unit, "Qual é o horário de silêncio?");
    expect(r.mode).toBe("ia");
    expect(r.refs.map((x) => x.ref)).toContain(chunk.ref);
    expect(r.remaining).toBe(9);
    const req = calls.find((c) => c.url.endsWith("/v1/responses"))!;
    expect(req.body?.model).toBe("gpt-5.4-mini");
    expect(String(req.body?.input)).toContain("<trechos>");
    expect(aiState().state).toBe("ok");
  });

  it("chave recusada: cai para a busca e informa o status à administração", async () => {
    process.env.OPENAI_API_KEY = "sk-proj-ruim";
    mockOpenAi({}, { status: 401 });
    const r = await askCorujinha(user, unit, "Posso ter cachorro?");
    expect(r.mode).toBe("busca");
    expect(r.remaining).toBe(9);
    expect((await testAi()).state).toBe("chave_recusada");
  });
});
