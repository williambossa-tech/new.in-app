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
  "sorteio.desistencia": "Desistência e novo sorteio",
  "bmg.solicitacao": "Be My Guest: solicitação",
  "bmg.confirmacao": "Be My Guest: confirmação",
  "bmg.recusa": "Be My Guest: recusa",
  "bmg.cancelamento": "Be My Guest: cancelamento",
  "bmg.entrada": "Be My Guest: entrada e vistoria",
  "bmg.saida": "Be My Guest: saída",
  "bmg.ocorrencia": "Be My Guest: ocorrência validada/descartada",
  "bmg.ausencia": "Be My Guest: ausência",
  "bmg.excecao_horario": "Be My Guest: exceção de horário",
  "bmg.configuracao": "Be My Guest: configuração",
  "taxa.cadastro": "Taxa cadastrada",
  "taxa.alteracao": "Taxa alterada",
  "taxa.exclusao": "Taxa excluída",
  "corujinha.pergunta": "Pergunta à Corujinha",
  "cw.reserva": "Coworking: reserva",
  "cw.excecao_pedido": "Coworking: pedido de exceção",
  "cw.excecao_decisao": "Coworking: decisão de exceção",
  "cw.cancelamento": "Coworking: cancelamento",
  "cw.prorrogacao": "Coworking: prorrogação",
  "cw.configuracao": "Coworking: configuração",
  "quadra.agendamento": "Quadra: agendamento",
  "quadra.confirmacao": "Quadra: agendamento confirmado",
  "quadra.aprovacao": "Quadra: jogo autorizado (mais de 4 visitantes)",
  "quadra.rejeicao": "Quadra: pedido rejeitado",
  "quadra.cancelamento": "Quadra: cancelamento",
  "quadra.alteracao": "Quadra: horário alterado",
  "quadra.programacao": "Quadra: programação criada",
  "quadra.bloqueio": "Quadra: bloqueio criado",
  "quadra.programacao_encerrada": "Quadra: programação/bloqueio encerrado",
  "quadra.configuracao": "Quadra: configuração",
  "mural.publicacao": "Mural: aviso publicado",
  "mural.edicao": "Mural: aviso editado",
  "mural.arquivamento": "Mural: aviso arquivado",
  "piscina.cadastro": "Piscina: convidado cadastrado",
  "piscina.edicao": "Piscina: convidado editado",
  "piscina.correcao": "Piscina: correção pela administração",
  "piscina.cancelamento": "Piscina: cadastro cancelado",
  "piscina.configuracao": "Piscina: configuração",
  "sorteio.revelar_reserva": "Período de desistências encerrado (chave reserva revelada)",
};
