import "server-only";
import type { Tx } from "./db";

export type AuditInput = {
  actorId: string | null;
  actorLabel: string;
  action: string;
  entity: string;
  entityId?: string | null;
  data?: Record<string, unknown>;
};

/** Grava um evento na trilha de auditoria encadeada (o hash é calculado no banco). */
export async function audit(tx: Tx, a: AuditInput) {
  // Sem RETURNING: moradores podem gravar eventos, mas não podem ler a trilha (RLS).
  await tx`
    insert into audit_log (actor_id, actor_label, action, entity, entity_id, data, prev_hash, hash)
    values (${a.actorId}, ${a.actorLabel}, ${a.action}, ${a.entity}, ${a.entityId ?? null},
            ${tx.json((a.data ?? {}) as never)}, '', '')`;
}

export const ACTION_LABELS: Record<string, string> = {
  "auth.cadastro": "Cadastro solicitado",
  "auth.login": "Entrada no sistema",
  "auth.troca_senha": "Senha alterada",
  "admin.aprovar_cadastro": "Cadastro aprovado",
  "admin.recusar_cadastro": "Cadastro recusado",
  "admin.bloquear_usuario": "Usuário bloqueado",
  "admin.reativar_usuario": "Usuário reativado",
  "admin.redefinir_senha": "Senha redefinida pela administração",
  "admin.perfil": "Perfis alterados",
  "admin.vinculo": "Vínculo com unidade alterado",
  "admin.adimplencia": "Adimplência registrada",
  "admin.parametro": "Parâmetro alterado",
  "admin.usuario_criado": "Usuário criado pela administração",
  "sorteio.abrir_inscricoes": "Inscrições abertas",
  "sorteio.encerrar_inscricoes": "Inscrições encerradas",
  "sorteio.reabrir_inscricoes": "Inscrições reabertas",
  "sorteio.horario_prazo": "Horário de encerramento definido",
  "sorteio.inscricao": "Inscrição registrada",
  "sorteio.inscricao_email": "Inscrição recebida por e-mail lançada",
  "sorteio.inscricao_cancelada": "Inscrição cancelada",
  "sorteio.inscricao_invalidada": "Inscrição invalidada",
  "sorteio.ordem": "Método de ordem dos salões definido",
  "sorteio.congelar": "Lista congelada e chave lacrada",
  "sorteio.iniciar": "Sorteio iniciado",
  "sorteio.etapa": "Etapa sorteada",
  "sorteio.concluir": "Sorteio concluído e chave revelada",
  "sorteio.anular": "Rodada anulada",
  "sorteio.simulacao": "Simulação executada",
};
