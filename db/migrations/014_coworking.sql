-- =====================================================================
-- 014 — Coworking (Regimento V7, cap. 23 + definições de 09/11/2026)
--   • Sala de reuniões: 8 pessoas (até 7 convidados — 23.1 a)
--   • Mini sala: 2 pessoas (1 convidado)
--   • 24 horas; blocos de 30 min; máximo 2 h consecutivas, prorrogável 1x por 1 h
--   • Antecedência de 15 min; 1 reserva por apartamento por dia
--   • Limites 23.14 por unidade, semana de segunda a domingo:
--     atendimento em no máximo 3 dias; no máximo 10 convidados distintos (por CPF)
--     → acima disso, bloqueia e permite pedir exceção à administração
-- =====================================================================

update spaces set capacity = 8, capacity_source = 'Definição da administração (William Bossa), 09/11/2026',
  name = 'Sala de reuniões', notes = 'Regimento 23.1(a): reserva obrigatória para receber de 1 a 7 convidados.'
where code = 'cw-reunioes';
update spaces set capacity = 2, capacity_source = 'Definição da administração (William Bossa), 09/11/2026',
  name = 'Mini sala', notes = 'Recebe no máximo 1 convidado (definição da administração, 09/11/2026).'
where code = 'cw-mini';

alter table bookings add column local_day date;

create table cw_details (
  booking_id uuid primary key references bookings(id),
  purpose text not null check (purpose in ('uso_pessoal', 'atendimento')),
  requested_by uuid not null references users(id),
  extended boolean not null default false,
  exception_status text check (exception_status in ('pendente', 'aprovada', 'recusada')),
  exception_reason text,
  exception_limit text,
  exception_decided_by uuid references users(id),
  exception_decided_at timestamptz,
  exception_note text
);

create table cw_guests (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references bookings(id),
  full_name text not null check (length(trim(full_name)) >= 5),
  cpf text not null check (cpf ~ '^\d{11}$'),
  created_at timestamptz not null default now(),
  unique (booking_id, cpf)
);

-- 1 reserva de coworking por apartamento por dia
create unique index bookings_cw_one_per_day
  on bookings (unit_id, local_day) where kind = 'coworking' and status in ('solicitada', 'confirmada', 'em_uso', 'concluida');

-- Uso semanal da unidade (segunda a domingo), contando reservas confirmadas/realizadas e exceções aprovadas
create or replace function app.cw_week_usage(p_unit uuid, p_day date, p_include uuid default null)
returns table (atend_days int, distinct_guests int)
language sql stable security definer set search_path = public as $$
  with wk as (select date_trunc('week', p_day)::date as ini),
  b as (
    select b.id, b.local_day, d.purpose from bookings b join cw_details d on d.booking_id = b.id, wk
    where b.kind = 'coworking' and b.unit_id = p_unit and b.local_day >= wk.ini and b.local_day < wk.ini + 7
      and (b.status in ('confirmada', 'em_uso', 'concluida') or b.id = p_include)
  )
  select
    (select count(distinct local_day)::int from b where purpose = 'atendimento'),
    (select count(distinct g.cpf)::int from cw_guests g where g.booking_id in (select id from b))
$$;

-- Regras no banco
create or replace function app.cw_check(p_booking uuid) returns void
language plpgsql security definer set search_path = public as $$
declare bk bookings; sp spaces; d cw_details; n int; mins int; u record;
begin
  select * into bk from bookings where id = p_booking;
  if bk.kind is distinct from 'coworking' then return; end if;
  select * into d from cw_details where booking_id = bk.id;
  if d.booking_id is null then return; end if;
  select * into sp from spaces where id = bk.space_id;
  -- capacidade (o morador + convidados)
  select count(*) into n from cw_guests where booking_id = bk.id;
  if sp.capacity is not null and n + 1 > sp.capacity then
    raise exception '% comporta até % pessoas.', sp.name, sp.capacity;
  end if;
  if d.purpose = 'atendimento' and n = 0 then raise exception 'Informe os convidados do atendimento.'; end if;
  if d.purpose = 'uso_pessoal' and n > 0 then raise exception 'Uso pessoal não inclui convidados.'; end if;
  -- duração: blocos de 30 min, até 2 h (3 h com a prorrogação)
  mins := extract(epoch from (upper(bk.period) - lower(bk.period))) / 60;
  if mins < 30 or mins % 30 <> 0 or mins > (case when d.extended then 180 else 120 end) then
    raise exception 'A reserva deve ter de 30 minutos a 2 horas, em blocos de 30 minutos.';
  end if;
  -- limites semanais (23.14), salvo exceção aprovada
  if bk.status in ('confirmada', 'em_uso') and coalesce(d.exception_status, '') <> 'aprovada' then
    select * into u from app.cw_week_usage(bk.unit_id, bk.local_day, bk.id);
    if u.atend_days > 3 then
      raise exception 'Limite semanal: atendimento em no máximo 3 dias por semana.';
    end if;
    if u.distinct_guests > 10 then
      raise exception 'Limite semanal: no máximo 10 convidados diferentes por semana.';
    end if;
  end if;
end $$;

create or replace function app.cw_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform app.cw_check(coalesce(new.booking_id, old.booking_id));
  return null;
end $$;
create constraint trigger cw_details_guard after insert or update on cw_details
  deferrable initially deferred for each row execute function app.cw_guard();
create constraint trigger cw_guests_guard after insert or update on cw_guests
  deferrable initially deferred for each row execute function app.cw_guard();

create or replace function app.cw_bookings_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform app.cw_check(new.id);
  return null;
end $$;
create constraint trigger cw_bookings_guard after update of period, status on bookings
  deferrable initially deferred for each row when (new.kind = 'coworking') execute function app.cw_bookings_guard();

-- Acesso: convidados só para a unidade, administração e portaria
alter table cw_details enable row level security;
alter table cw_guests enable row level security;
grant select on cw_details, cw_guests to newin_app;
create policy cwd_read on cw_details for select to newin_app using (
  app.is_staff() or app.has_role('portaria')
  or booking_id in (select id from bookings where unit_id in (select app.my_unit_ids())));
create policy cwg_read on cw_guests for select to newin_app using (
  app.is_staff() or app.has_role('portaria')
  or booking_id in (select id from bookings where unit_id in (select app.my_unit_ids())));
grant execute on function app.cw_week_usage(uuid, date, uuid) to newin_app;

-- ---------------------------------------------------------------------
-- Definições informadas pela administração (09/11/2026)
-- ---------------------------------------------------------------------
update parameters set status = 'definido', value = '{"texto": "24 horas"}'::jsonb,
  source = 'Definição da administração (William Bossa), 09/11/2026', updated_at = now(), blocks = null where key = 'cw.horarios';
update parameters set status = 'definido',
  value = '{"texto": "Blocos de 30 minutos; máximo de 2 horas consecutivas (o Regimento não prevê duração); prorrogável 1 vez por 1 hora se não houver reserva seguinte."}'::jsonb,
  source = 'Definição da administração (William Bossa), 09/11/2026', updated_at = now() where key = 'cw.duracao';
update parameters set status = 'definido', value = '{"texto": "1 reserva de coworking por apartamento por dia."}'::jsonb,
  source = 'Definição da administração (William Bossa), 09/11/2026', updated_at = now() where key = 'cw.intervalo';
update parameters set status = 'definido', value = '{"minutos": 15, "texto": "15 minutos"}'::jsonb,
  source = 'Definição da administração (William Bossa), 09/11/2026', updated_at = now() where key = 'cw.antecedencia';
update parameters set status = 'definido', value = '{"texto": "Sala de reuniões: 8 pessoas. Mini sala: 2 pessoas."}'::jsonb,
  source = 'Definição da administração (William Bossa), 09/11/2026', updated_at = now() where key = 'cw.capacidades';
update parameters set status = 'definido', value = '{"texto": "Sim, apenas 1 convidado."}'::jsonb,
  source = 'Definição da administração (William Bossa), 09/11/2026', updated_at = now() where key = 'cw.mini_convidados';

insert into parameters (key, module, label, description, value, status, source) values
('cw.abertura', 'coworking', 'Reservas do coworking abertas no aplicativo', null,
 '{"ativo": true, "texto": "Abertas"}'::jsonb, 'definido', 'Definição da administração (William Bossa), 09/11/2026')
on conflict (key) do nothing;
