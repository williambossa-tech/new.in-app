-- =====================================================================
-- 012 — Be My Guest com confirmação automática; tabela de taxas com
--       vigência e fonte; valores congelados em cada reserva.
-- =====================================================================

update parameters set status = 'definido',
  value = '{"texto": "Confirmação automática quando todas as regras são atendidas."}'::jsonb,
  source = 'Definição da administração (William Bossa), 09/11/2026', updated_at = now(),
  description = null
where key = 'bmg.confirmacao';

create table fee_schedules (
  id uuid primary key default gen_random_uuid(),
  module text not null check (module in ('bmg', 'salao_festivo', 'coworking')),
  component text not null check (component in ('taxa_uso', 'taxa_limpeza', 'fundo_manutencao', 'taxa_reserva')),
  amount numeric(10, 2) not null check (amount >= 0),
  basis text not null check (basis in ('por_diaria', 'por_reserva')),
  valid_from date not null,
  source text not null check (length(trim(source)) >= 5),
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  unique (module, component, valid_from)
);
alter table fee_schedules enable row level security;
grant select on fee_schedules to newin_app;
create policy fees_read on fee_schedules for select to newin_app using (app.current_user_id() is not null);

-- Valores aplicáveis no momento da reserva (não mudam se a tabela mudar depois)
alter table bookings add column fee_snapshot jsonb;
alter table bookings add column fee_total numeric(10, 2);

create or replace function app.fees_immutable() returns trigger
language plpgsql as $$
begin
  raise exception 'Valores vigentes não são alterados: cadastre um novo valor com nova data de vigência.';
end $$;
create trigger fee_schedules_immutable before update or delete on fee_schedules
  for each row execute function app.fees_immutable();

-- O valor congelado na reserva não muda depois de gravado
create or replace function app.bookings_fee_guard() returns trigger
language plpgsql as $$
begin
  if old.fee_snapshot is not null and (new.fee_snapshot is distinct from old.fee_snapshot or new.fee_total is distinct from old.fee_total) then
    raise exception 'Os valores da reserva foram fixados na contratação e não podem ser alterados; registre um ajuste.';
  end if;
  return new;
end $$;
create trigger bookings_fee_guard before update on bookings
  for each row execute function app.bookings_fee_guard();

update parameters set description = 'Regimento 27.17 a 27.20 e 33: valores definidos em assembleia. Cadastre cada componente (valor, base, vigência e fonte) na tela do Be My Guest → Configuração.'
where key = 'bmg.taxas';
