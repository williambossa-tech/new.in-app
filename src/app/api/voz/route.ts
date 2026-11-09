import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { asSystem } from "@/lib/db";
import { audioResponse, errorResponse, getSpeech, VoiceError } from "@/lib/voice/service";

const Body = z.union([
  z.object({ perguntaId: z.string().uuid() }),
  z.object({ texto: z.string().min(1).max(800), emocao: z.string().max(200).optional() }),
]);

/**
 * Gera (ou reaproveita) a fala da Corujinha.
 * - perguntaId: lê em voz alta a resposta que a Corujinha deu ao próprio morador;
 * - texto livre: somente administração (avisos, testes).
 */
export async function POST(req: Request) {
  const me = await getSessionUser();
  if (!me || me.status !== "ativo") return Response.json({ erro: "acesso" }, { status: 401 });
  let body: z.infer<typeof Body>;
  try { body = Body.parse(await req.json()); } catch { return Response.json({ erro: "texto_invalido" }, { status: 400 }); }
  try {
    if ("perguntaId" in body) {
      const [q] = await asSystem((tx) => tx`select answer from kb_questions where id = ${body.perguntaId} and user_id = ${me.id}`);
      if (!q?.answer) return Response.json({ erro: "nao_encontrada" }, { status: 404 });
      const text = String(q.answer).replace(/\((Regimento Interno|Convenção)[^)]*\)/g, "").replace(/\s+([,.!?])/g, "$1");
      return audioResponse(await getSpeech({ text, emocao: "explicando com clareza e simpatia", userId: me.id }));
    }
    if (!me.roles.includes("admin")) throw new VoiceError("texto_invalido", "Somente a administração pode gerar falas livres.", 403);
    return audioResponse(await getSpeech({ text: body.texto, emocao: body.emocao, userId: me.id }));
  } catch (e) {
    return errorResponse(e);
  }
}
