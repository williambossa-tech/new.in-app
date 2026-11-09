import { testarIaAction } from "@/app/actions/corujinha";
import { ActionForm, SubmitButton } from "@/components/forms";
import type { AiState } from "@/lib/corujinha";
import { fmtDateTime } from "@/lib/format";

const TEXT: Record<AiState["state"], [string, string]> = {
  ok: ["badge-verde", "IA conectada"],
  chave_recusada: ["badge-coral", "Chave recusada pela Anthropic"],
  sem_credito: ["badge-amarelo", "Conta da Anthropic sem crédito"],
  erro: ["badge-amarelo", "Falha na conexão com a IA"],
  sem_chave: ["badge-cinza", "Sem chave configurada"],
  nao_testada: ["badge-cinza", "Ainda não testada"],
};
const HELP: Partial<Record<AiState["state"], string>> = {
  chave_recusada: "Gere uma nova chave em console.anthropic.com (API Keys) e cole no Railway, na variável ANTHROPIC_API_KEY, sem aspas nem espaços. A chave começa com sk-ant-api03-.",
  sem_credito: "Adicione crédito em console.anthropic.com (Billing).",
  sem_chave: "Crie a variável ANTHROPIC_API_KEY no Railway com a chave gerada em console.anthropic.com.",
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
      {s.at && <p className="text-xs text-noite-50">Última verificação: {fmtDateTime(s.at)}</p>}
    </section>
  );
}
