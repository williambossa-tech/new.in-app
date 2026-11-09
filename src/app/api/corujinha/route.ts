import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { askCorujinha } from "@/lib/corujinha";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const me = await getSessionUser();
  if (!me || me.status !== "ativo") return NextResponse.json({ erro: "Entre no aplicativo para perguntar." }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const q = String(body?.pergunta ?? "").trim();
  if (q.length < 4) return NextResponse.json({ erro: "Escreva sua pergunta." }, { status: 400 });
  const r = await askCorujinha(me.id, me.units[0]?.id ?? null, q);
  return NextResponse.json(r, { headers: { "Cache-Control": "no-store" } });
}
