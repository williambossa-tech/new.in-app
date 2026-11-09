import { testarIaAction } from "@/app/actions/corujinha";
import { ActionForm, SubmitButton } from "@/components/forms";
import type { AiState } from "@/lib/ai";
import { fmtDateTime } from "@/lib/format";

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

export function AiStatus({ s }: { s: AiState }) {
  const [cls, label] = TEXT[s.state];
  return (
    <section className="card space-y-3 p-6">
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
    </section>
  );
}
