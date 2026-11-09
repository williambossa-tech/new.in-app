-- =====================================================================
-- 009 — Desistência do sorteado com novo sorteio automático.
-- A chave reserva é gerada e lacrada na conclusão da rodada; só é revelada
-- quando a administração encerra o período de desistências.
-- =====================================================================

alter table lottery_rounds add column reserve_commitment text;
alter table lottery_rounds add column reserve_revealed text;
alter table lottery_rounds add column reserve_revealed_at timestamptz;

create table lottery_reserve_secrets (
  campaign_id uuid not null,
  round int not null,
  seed text not null,
  primary key (campaign_id, round),
  foreign key (campaign_id, round) references lottery_rounds(campaign_id, round)
);
alter table lottery_reserve_secrets enable row level security;
-- sem permissão para newin_app

create table lottery_substitutions (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references lottery_campaigns(id),
  round int not null,
  stage_id uuid not null references lottery_stages(id),
  n int not null,                                   -- 1ª, 2ª... desistência desta etapa
  withdrawn_unit_id uuid not null references units(id),
  origin text not null check (origin in ('morador', 'administracao')),
  reason text not null,
  requested_by uuid not null references users(id),
  eligible jsonb not null,
  eligible_hash text not null,
  excluded jsonb not null,
  draw_index int,
  rng_counter int,
  new_winner_unit_id uuid references units(id),
  new_winner_entry_id uuid references lottery_entries(id),
  created_at timestamptz not null default clock_timestamp(),
  unique (stage_id, n),
  foreign key (campaign_id, round) references lottery_rounds(campaign_id, round)
);

create or replace function app.substitutions_immutable() returns trigger
language plpgsql as $$
begin
  raise exception 'Registros de desistência não podem ser alterados nem excluídos.';
end $$;
create trigger lottery_substitutions_immutable before update or delete on lottery_substitutions
  for each row execute function app.substitutions_immutable();

alter table lottery_substitutions enable row level security;
grant select on lottery_substitutions to newin_app;
create policy lsub_read on lottery_substitutions for select to newin_app using (app.current_user_id() is not null);
grant select (reserve_commitment, reserve_revealed, reserve_revealed_at) on lottery_rounds to newin_app;

-- Atualiza a proteção das rodadas para os novos campos lacrados.
create or replace function app.lottery_rounds_guard() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' then raise exception 'Rodadas não podem ser excluídas.'; end if;
  if new.seed_commitment is distinct from old.seed_commitment
     or (old.public_entropy is not null and new.public_entropy is distinct from old.public_entropy)
     or (old.seed_revealed is not null and new.seed_revealed is distinct from old.seed_revealed)
     or (old.order_doc is not null and new.order_doc is distinct from old.order_doc)
     or (old.reserve_commitment is not null and new.reserve_commitment is distinct from old.reserve_commitment)
     or (old.reserve_revealed is not null and new.reserve_revealed is distinct from old.reserve_revealed) then
    raise exception 'Dados lacrados da rodada não podem ser alterados.';
  end if;
  if old.status in ('concluida', 'anulada') and new.status <> old.status
     and not (old.status = 'concluida' and new.status = 'anulada') then
    raise exception 'Rodada encerrada não pode voltar a andamento.';
  end if;
  return new;
end $$;
