"use client";
import { prepararFalasAction, testarIaAction, testarVozAction } from "@/app/actions/corujinha";
import { ActionForm, SubmitButton } from "@/components/forms";
import type { AiState } from "@/lib/ai";
import { fmtDateTime } from "@/lib/format";
import type { VoiceStatus } from "@/lib/voice/service";

const TEXT: Record<AiState["state"], [string, string]> = {
  ok: ["badge-verde", "IA conectada"],
  chave_recusada: ["badge-coral", "Chave recusada"],
  sem_credito: ["badge-amarelo", "Conta sem crédito"],
  erro: ["badge-amarelo", "Falha na conexão com a IA"],
  sem_chave: ["badge-cinza", "Sem chave configurada"],
  nao_testada: ["badge-cinza", "Ainda não testada"],
};
const HELP: Partial<Record<AiState["state"], string>> = {
  chave_recusada: "Confira a chave no Railway (variável OPENAI_API_KEY ou ANTHROPIC_API_KEY), sem aspas nem espaços. Se ela foi revogada, gere outra.",
  sem_credito: "Adicione crédito na conta do provedor (OpenAI: platform.openai.com › Billing).",
  sem_chave: "Crie a variável OPENAI_API_KEY no Railway com a chave gerada em platform.openai.com.",
  erro: "Tente de novo em alguns minutos.",
};

type Voz = VoiceStatus & { configured: string | null; voice: string | null };

export function AiStatus({ s, voz }: { s: AiState; voz: Voz }) {
  const [cls, label] = TEXT[s.state];
  const vozBadge: [string, string] = !voz.configured ? ["badge-cinza", "Voz não configurada"] : voz.ok === false ? ["badge-coral", "Falha ao gerar voz"] : voz.ok ? ["badge-verde", "Voz funcionando"] : ["badge-cinza", "Voz ainda não testada"];
  return (
    <section className="card space-y-6 p-6">
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold">Administração · respostas com IA</p>
            <span className={cls}>{label}</span>
          </div>
          <ActionForm action={testarIaAction} className="">
            <SubmitButton className="btn-secondary btn-sm" pendingText="Testando…">Testar conexão</SubmitButton>
          </ActionForm>
        </div>
        {HELP[s.state] && <p className="text-sm text-noite-70">{HELP[s.state]}</p>}
        {s.at && <p className="text-xs text-noite-50">Última verificação: {fmtDateTime(s.at)}{s.provider ? ` · ${s.provider === "openai" ? "OpenAI" : "Anthropic"}` : ""}{s.model ? ` · ${s.model}` : ""}</p>}
      </div>

      <div className="space-y-3 border-t border-linha pt-5">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-semibold">Voz da Corujinha</p>
          <span className={vozBadge[0]}>{vozBadge[1]}</span>
        </div>
        <p className="text-sm text-noite-70">
          {voz.configured ? <>Provedor: <b>{voz.configured === "openai" ? "OpenAI" : "ElevenLabs"}</b>{voz.voice ? ` · ${voz.voice}` : ""}</> : "Preencha OPENAI_API_KEY (ou ELEVENLABS_API_KEY e ELEVENLABS_VOICE_ID) no Railway."}
        </p>
        {voz.configured === "openai" && <p className="text-xs text-noite-50">A OpenAI desliga este modelo de voz em 06/01/2027. Use “Preparar apresentação” antes disso: as falas ficam guardadas e continuam funcionando.</p>}
        {voz.detail && voz.ok === false && <p className="break-all text-xs text-noite-50">{voz.detail}</p>}
        <div className="flex flex-wrap items-start gap-3">
          <ActionForm action={testarVozAction} className="space-y-2">
            {(st) => (<>
              <SubmitButton className="btn-secondary btn-sm" pendingText="Gerando…">Testar voz</SubmitButton>
              {st.ok && st.data?.tocar ? <audio key={String(st.data.tocar)} src="/api/voz/fala/teste-voz" controls autoPlay className="h-10" /> : null}
            </>)}
          </ActionForm>
          <ActionForm action={prepararFalasAction} className="">
            <SubmitButton className="btn-secondary btn-sm" pendingText="Preparando…">Preparar falas (apresentação e regras)</SubmitButton>
          </ActionForm>
        </div>
      </div>
    </section>
  );
}
