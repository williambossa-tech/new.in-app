import { requireUser } from "@/lib/auth";
import { aiState, apiKey, corujinhaStatus, LIMIT } from "@/lib/corujinha";
import { AiStatus } from "./AiStatus";
import { Chat } from "./Chat";

export const metadata = { title: "Pergunte à Corujinha" };

export default async function CorujinhaPage() {
  const me = await requireUser();
  const s = await corujinhaStatus(me.id, me.units[0]?.id ?? null);
  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-medium text-violeta">Regimento Interno e Convenção</p>
        <h1 className="h1">Pergunte à Corujinha</h1>
      </div>
      <Chat firstName={me.fullName.split(" ")[0]} remaining={s.remaining} limit={LIMIT} aiOn={!!apiKey()} />
      {me.roles.includes("admin") && <AiStatus s={aiState()} />}
    </div>
  );
}
