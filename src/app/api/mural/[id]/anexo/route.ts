import { getSessionUser } from "@/lib/auth";
import { getAttachment } from "@/lib/mural/service";

export async function GET(_: Request, ctx: { params: Promise<{ id: string }> }) {
  const me = await getSessionUser();
  if (!me || me.status !== "ativo") return new Response("Acesso negado", { status: 401 });
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return new Response("Não encontrado", { status: 404 });
  const a = await getAttachment(me.id, id);
  if (!a) return new Response("Não encontrado", { status: 404 });
  return new Response(new Uint8Array(a.data), { headers: {
    "content-type": a.mime, "content-length": String(a.data.length), "cache-control": "private, max-age=3600",
    "content-disposition": `inline; filename*=UTF-8''${encodeURIComponent(a.name)}`, "x-content-type-options": "nosniff",
  } });
}
