import { redirect } from "next/navigation";
import { Welcome } from "@/app/boas-vindas/Welcome";
import { getSessionUser } from "@/lib/auth";
import { APRESENTACAO } from "@/lib/voice/falas";

export const dynamic = "force-dynamic";
export const metadata = { title: "Boas-vindas" };

/** Apresentação da Corujinha antes do login (o morador escolhe ouvir, pular ou desativar). */
export default async function Intro({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const me = await getSessionUser();
  if (me) redirect("/");
  return <Welcome mode="intro" nextHref={next?.startsWith("/") && !next.startsWith("//") ? `/entrar?next=${encodeURIComponent(next)}` : "/entrar"} falas={APRESENTACAO.map(({ id, texto, estado, pausaDepois }) => ({ id, texto, estado, pausaDepois: pausaDepois ?? 0.35 }))} />;
}
