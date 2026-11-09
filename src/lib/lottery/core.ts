/**
 * Núcleo do sorteio — o MESMO código roda no servidor (sorteio oficial e
 * simulação) e no navegador dos moradores (página "Verificar").
 *
 * Mecânica:
 *  1. Ao congelar a lista, o servidor gera uma chave secreta aleatória de
 *     256 bits (CSPRNG) e publica apenas o lacre: SHA-256(chave).
 *  2. No início do sorteio, a administração informa um "número público"
 *     (ex.: dígitos ditos pelos presentes). Ninguém conhece os dois ao mesmo tempo
 *     antes do sorteio: o servidor não conhece o número público quando lacra a chave,
 *     e quem informa o número não conhece a chave.
 *  3. Cada sorteio de etapa usa HMAC-SHA256(chave, número público | etapa | contador)
 *     com amostragem por rejeição, o que garante escolha uniforme entre os elegíveis.
 *  4. Ao concluir, a chave é revelada: qualquer pessoa confere o lacre e refaz a conta.
 */

const enc = new TextEncoder();
const subtle = () => globalThis.crypto.subtle;

export function toHex(buf: ArrayBuffer | Uint8Array): string {
  const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

export function fromHex(hex: string): Uint8Array<ArrayBuffer> {
  if (!/^[0-9a-f]*$/i.test(hex) || hex.length % 2) throw new Error("hex inválido");
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export async function sha256Hex(text: string): Promise<string> {
  return toHex(await subtle().digest("SHA-256", enc.encode(text)));
}

async function hmac(keyHex: string, msg: string): Promise<Uint8Array> {
  const key = await subtle().importKey("raw", fromHex(keyHex), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await subtle().sign("HMAC", key, enc.encode(msg)));
}

/** JSON canônico: chaves em ordem alfabética, sem espaços. */
export function canonicalJson(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(",")}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o)
    .filter((k) => o[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonicalJson(o[k])}`)
    .join(",")}}`;
}

const TWO_48 = 2 ** 48;

/** Índice uniforme em [0, n) — amostragem por rejeição sobre 48 bits do HMAC. */
export async function uniformIndex(seedHex: string, entropy: string, label: string, n: number) {
  if (!Number.isInteger(n) || n < 1) throw new Error("n inválido");
  const limit = Math.floor(TWO_48 / n) * n;
  for (let counter = 0; counter < 1000; counter++) {
    const h = await hmac(seedHex, `${entropy}|${label}|${counter}`);
    let v = 0;
    for (let i = 0; i < 6; i++) v = v * 256 + h[i];
    if (v < limit) return { index: v % n, counter, value: v };
  }
  throw new Error("falha improvável na amostragem");
}

/** Embaralhamento Fisher–Yates determinístico (usado para sortear a ordem dos salões). */
export async function shuffle<T>(seedHex: string, entropy: string, label: string, items: T[]): Promise<T[]> {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const { index } = await uniformIndex(seedHex, entropy, `${label}|pos${i}`, i + 1);
    [a[i], a[index]] = [a[index], a[i]];
  }
  return a;
}

export const byUnitCode = (a: string, b: string) => Number(a) - Number(b) || a.localeCompare(b);

// ---------------------------------------------------------------------------
// Documento congelado
// ---------------------------------------------------------------------------
export type FreezeDoc = {
  campanha: string;
  regras_versao: number;
  termos_versao: number;
  metodo_ordem: "fixa" | "sorteada";
  ordem_fixa: Record<string, string[]> | null; // período → salões em ordem
  periodos: { codigo: string; saloes: { codigo: string; apartamentos: string[] }[] }[];
};

export async function freezeHash(doc: FreezeDoc): Promise<string> {
  return sha256Hex(canonicalJson(doc));
}

export const stageLabel = (campaign: string, round: number, period: string, space: string) =>
  `${campaign}|rodada${round}|${period}|${space}`;

export const orderLabel = (campaign: string, round: number, period: string) =>
  `${campaign}|rodada${round}|ordem|${period}`;

export async function eligibleHash(label: string, eligible: string[]): Promise<string> {
  return sha256Hex(canonicalJson({ etapa: label, elegiveis: eligible }));
}

/** Ordem efetiva dos salões em cada período. */
export async function resolveOrder(doc: FreezeDoc, round: number, seedHex: string, entropy: string) {
  const out: Record<string, string[]> = {};
  for (const p of doc.periodos) {
    const spaces = p.saloes.map((s) => s.codigo).sort();
    if (doc.metodo_ordem === "fixa") {
      const fixed = doc.ordem_fixa?.[p.codigo];
      if (!fixed || fixed.length !== spaces.length) throw new Error("ordem fixa incompleta");
      out[p.codigo] = fixed;
    } else {
      out[p.codigo] = await shuffle(seedHex, entropy, orderLabel(doc.campanha, round, p.codigo), spaces);
    }
  }
  return out;
}

export type StageResult = {
  period: string;
  space: string;
  seq: number;
  label: string;
  eligible: string[];
  excluded: string[];
  eligibleHash: string;
  index: number | null;
  counter: number | null;
  winner: string | null;
};

/** Sorteia UMA etapa, dados os vencedores anteriores do mesmo período. */
export async function drawOneStage(args: {
  doc: FreezeDoc; round: number; seedHex: string; entropy: string;
  period: string; space: string; seq: number; previousWinners: string[];
}): Promise<StageResult> {
  const { doc, round, seedHex, entropy, period, space, seq, previousWinners } = args;
  const p = doc.periodos.find((x) => x.codigo === period);
  const s = p?.saloes.find((x) => x.codigo === space);
  if (!p || !s) throw new Error("etapa inexistente no documento congelado");
  const all = [...s.apartamentos].sort(byUnitCode);
  const excluded = all.filter((u) => previousWinners.includes(u));
  const eligible = all.filter((u) => !previousWinners.includes(u));
  const label = stageLabel(doc.campanha, round, period, space);
  const eHash = await eligibleHash(label, eligible);
  if (eligible.length === 0) {
    return { period, space, seq, label, eligible, excluded, eligibleHash: eHash, index: null, counter: null, winner: null };
  }
  const { index, counter } = await uniformIndex(seedHex, entropy, label, eligible.length);
  return { period, space, seq, label, eligible, excluded, eligibleHash: eHash, index, counter, winner: eligible[index] };
}

/** Rodada completa (simulação e verificação independente). */
export async function computeRound(doc: FreezeDoc, round: number, seedHex: string, entropy: string) {
  const order = await resolveOrder(doc, round, seedHex, entropy);
  const stages: StageResult[] = [];
  for (const p of doc.periodos) {
    const winners: string[] = [];
    let seq = 1;
    for (const space of order[p.codigo]) {
      const r = await drawOneStage({ doc, round, seedHex, entropy, period: p.codigo, space, seq: seq++, previousWinners: winners });
      if (r.winner) winners.push(r.winner);
      stages.push(r);
    }
  }
  return { order, stages };
}

export function randomSeedHex(): string {
  const b = new Uint8Array(32);
  globalThis.crypto.getRandomValues(b);
  return toHex(b);
}
