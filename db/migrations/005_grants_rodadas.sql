-- Autoria das etapas da rodada é pública (necessária para a ata); a chave secreta continua em tabela sem acesso.
grant select (sealed_by, started_by, concluded_by, annulled_by) on lottery_rounds to newin_app;
