import "server-only";

/**
 * Conexão com o provedor de IA da Corujinha.
 * Aceita chave da OpenAI (OPENAI_API_KEY) ou da Anthropic (ANTHROPIC_API_KEY).
 * Uma chave da OpenAI colada por engano em ANTHROPIC_API_KEY também é reconhecida.
 */

export type Provider = "openai" | "anthropic";
export type AiState = {
  state: "ok" | "chave_recusada" | "sem_credito" | "erro" | "sem_chave" | "nao_testada";
  at: string | null;
  provider?: Provider;
  model?: string;
  detail?: string;
};

const clean = (v: string | undefined) =>
  (v ?? "").trim().replace(/^[A-Z_]+\s*=\s*/, "").replace(/^["'`]+|["'`]+$/g, "").replace(/\s+/g, "") || null;

export function aiConfig(): { provider: Provider; key: string } | null {
  const oa = clean(process.env.OPENAI_API_KEY);
  const an = clean(process.env.ANTHROPIC_API_KEY);
  if (an?.startsWith("sk-ant-")) return { provider: "anthropic", key: an };
  if (oa) return { provider: "openai", key: oa };
  if (an) return { provider: "openai", key: an }; // chave sk-proj-/sk- colocada na variável da Anthropic
  return null;
}

let last: AiState = { state: "nao_testada", at: null };
export const aiState = (): AiState => (aiConfig() ? last : { state: "sem_chave", at: null });

function record(status: number, body: string, provider: Provider, model?: string) {
  const at = new Date().toISOString();
  if (status >= 200 && status < 300) last = { state: "ok", at, provider, model };
  else if (status === 401 || status === 403) last = { state: "chave_recusada", at, provider, model, detail: body.slice(0, 200) };
  else if (status === 429 && /quota|billing|credit|balance/i.test(body)) last = { state: "sem_credito", at, provider, model, detail: body.slice(0, 200) };
  else if (/credit balance|billing/i.test(body)) last = { state: "sem_credito", at, provider, model, detail: body.slice(0, 200) };
  else last = { state: "erro", at, provider, model, detail: `${status} ${body.slice(0, 200)}` };
}

// ---------- OpenAI ----------
const OPENAI_PREF = ["gpt-5.4-mini", "gpt-6-luna", "gpt-5.6-luna", "gpt-5-mini", "gpt-4.1-mini", "gpt-4o-mini"];
let openaiModel: { id: string; at: number } | null = null;

async function pickOpenAiModel(key: string): Promise<string> {
  if (process.env.CORUJINHA_MODEL && !process.env.CORUJINHA_MODEL.startsWith("claude")) return process.env.CORUJINHA_MODEL;
  if (openaiModel && Date.now() - openaiModel.at < 6 * 3600_000) return openaiModel.id;
  try {
    const r = await fetch("https://api.openai.com/v1/models", { headers: { authorization: `Bearer ${key}` } });
    if (r.ok) {
      const ids: string[] = ((await r.json())?.data ?? []).map((m: { id: string }) => m.id);
      const id = OPENAI_PREF.find((p) => ids.includes(p))
        ?? ids.filter((x) => /^gpt-/.test(x) && /(mini|luna)$/.test(x)).sort().reverse()[0]
        ?? OPENAI_PREF[OPENAI_PREF.length - 1];
      openaiModel = { id, at: Date.now() };
      return id;
    }
    if (r.status === 401 || r.status === 403) record(r.status, await r.text(), "openai");
  } catch { /* usa o padrão */ }
  return OPENAI_PREF[OPENAI_PREF.length - 1];
}

export function openAiText(data: unknown): string {
  const d = data as { output_text?: string; output?: { type: string; content?: { type: string; text?: string }[] }[]; choices?: { message?: { content?: string } }[] };
  if (typeof d?.output_text === "string") return d.output_text;
  if (Array.isArray(d?.output))
    return d.output.filter((o) => o.type === "message").flatMap((o) => o.content ?? []).map((c) => c.text ?? "").join("");
  return d?.choices?.[0]?.message?.content ?? "";
}

async function callOpenAi(key: string, system: string, user: string, maxTokens: number, signal?: AbortSignal) {
  const model = await pickOpenAiModel(key);
  const headers = { authorization: `Bearer ${key}`, "content-type": "application/json" };
  let res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST", signal, headers,
    body: JSON.stringify({ model, instructions: system, input: user, max_output_tokens: maxTokens }),
  });
  if (res.status === 404 || res.status === 400) {
    // alternativa: Chat Completions
    res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST", signal, headers,
      body: JSON.stringify({ model, max_completion_tokens: maxTokens, messages: [{ role: "system", content: system }, { role: "user", content: user }] }),
    });
  }
  return { res, model };
}

// ---------- Anthropic ----------
async function callAnthropic(key: string, system: string, user: string, maxTokens: number, signal?: AbortSignal) {
  const call = (model: string) => fetch("https://api.anthropic.com/v1/messages", {
    method: "POST", signal,
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model, max_tokens: maxTokens, system, messages: [{ role: "user", content: user }] }),
  });
  let model = process.env.CORUJINHA_MODEL?.startsWith("claude") ? process.env.CORUJINHA_MODEL : "claude-haiku-5-5";
  let res = await call(model);
  if (res.status === 404 || res.status === 400) { model = "claude-sonnet-5-5"; res = await call(model); }
  return { res, model };
}

/** Envia o pedido ao provedor configurado e devolve o texto (ou null em caso de falha). */
export async function aiComplete(system: string, user: string, maxTokens = 1200): Promise<string | null> {
  const cfg = aiConfig();
  if (!cfg) return null;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 40_000);
  try {
    const { res, model } = cfg.provider === "openai"
      ? await callOpenAi(cfg.key, system, user, maxTokens, ctrl.signal)
      : await callAnthropic(cfg.key, system, user, maxTokens, ctrl.signal);
    if (!res.ok) {
      const body = await res.text();
      record(res.status, body, cfg.provider, model);
      console.error(`Corujinha: ${cfg.provider} respondeu`, res.status, body.slice(0, 300));
      return null;
    }
    const data = await res.json();
    record(res.status, "", cfg.provider, model);
    return cfg.provider === "openai"
      ? openAiText(data)
      : (data?.content ?? []).map((c: { text?: string }) => c.text ?? "").join("");
  } catch (e) {
    last = { state: "erro", at: new Date().toISOString(), provider: cfg.provider, detail: String(e).slice(0, 200) };
    console.error("Corujinha: falha na chamada", e);
    return null;
  } finally {
    clearTimeout(t);
  }
}

/** Teste rápido da conexão (usado pela administração). */
export async function testAi(): Promise<AiState> {
  if (!aiConfig()) return aiState();
  await aiComplete("Responda apenas com a palavra ok.", "Teste de conexão.", 200);
  return last;
}
