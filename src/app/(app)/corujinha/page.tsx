import { requireUser } from "@/lib/auth";
import { aiConfig, aiState } from "@/lib/ai";
import { corujinhaStatus, LIMIT } from "@/lib/corujinha";
import { voiceConfig } from "@/lib/voice/config";
import { voiceStatus } from "@/lib/voice/service";
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
      <Chat firstName={me.fullName.split(" ")[0]} remaining={s.remaining} limit={LIMIT} aiOn={!!aiConfig()} vozOn={!!voiceConfig().provider} />
      {me.roles.includes("admin") && <AiStatus s={aiState()} voz={voiceStatus()} />}
    </div>
  );
}
