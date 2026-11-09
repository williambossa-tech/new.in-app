-- Permite corrigir ou excluir valores da tabela de taxas (com trilha de auditoria).
-- As reservas já feitas não mudam: cada uma guarda os valores do momento da contratação.
drop trigger if exists fee_schedules_immutable on fee_schedules;
