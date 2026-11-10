import { getSessionUser } from "@/lib/auth";
import { APRESENTACAO, FALAS } from "@/lib/voice/falas";
import { audioResponse, errorResponse, getSpeech } from "@/lib/voice/service";

/** Áudio de uma fala registrada da Corujinha (gerado uma vez e reaproveitado). */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const me = await getSessionUser();
  const { id } = await ctx.params;
  const publica = APRESENTACAO.some((f) => f.id === id);
  if (!publica && (!me || me.status !== "ativo")) return Response.json({ erro: "acesso" }, { status: 401 });
  const fala = FALAS[id];
  if (!fala) return Response.json({ erro: "fala_inexistente" }, { status: 404 });
  try {
    return audioResponse(await getSpeech({ text: fala.texto, emocao: fala.emocao, userId: me?.status === "ativo" ? me.id : null, bypassUserLimit: true }));
  } catch (e) {
    return errorResponse(e);
  }
}
