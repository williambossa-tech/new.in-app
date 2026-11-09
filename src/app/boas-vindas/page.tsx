import { requireUser } from "@/lib/auth";
import { asSystem } from "@/lib/db";
import { APRESENTACAO } from "@/lib/voice/falas";
import { Welcome } from "./Welcome";

export const dynamic = "force-dynamic";
export const metadata = { title: "Boas-vindas" };

export default async function BoasVindas() {
  const me = await requireUser();
  await asSystem((tx) => tx`insert into welcome_views (user_id) values (${me.id})
                            on conflict (user_id) do update set last_seen_at = now(), views = welcome_views.views + 1`);
  return <Welcome firstName={me.fullName.split(" ")[0]} falas={APRESENTACAO.map(({ id, texto, estado, pausaDepois }) => ({ id, texto, estado, pausaDepois: pausaDepois ?? 0.35 }))} />;
}
