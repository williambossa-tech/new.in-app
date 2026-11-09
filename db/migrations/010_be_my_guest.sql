-- =====================================================================
-- 010 — Be My Guest (Regimento V7, capítulo 27 + definições de 09/11/2026)
--   • Entrada a partir das 18h; saída até as 12h; limpeza de 6h (27.22)
--   • Máximo de 7 diárias contínuas; 1 reserva ativa por unidade (27.7)
--   • Por unidade: no máximo 7 diárias em qualquer período de 30 dias
--   • Até 2 hóspedes identificados (27.6); termo versionado (27.13)
--   • Solicitação por proprietário ou locatário (27.3)
-- =====================================================================

update spaces set name = 'Be My Guest 1' where code = 'bmg-1';
update spaces set name = 'Be My Guest 2' where code = 'bmg-2';

-- Termos versionados (Be My Guest e futuros módulos)
create table terms_documents (
  kind text not null,
  version int not null,
  body_md text not null,
  created_at timestamptz not null default now(),
  primary key (kind, version)
);
alter table terms_documents enable row level security;
grant select on terms_documents to newin_app;
create policy terms_read on terms_documents for select to newin_app using (app.current_user_id() is not null);

insert into terms_documents (kind, version, body_md) values ('bmg', 1, $t$
1. Os hóspedes são meus convidados pessoais e estão identificados nesta reserva.
2. Respeitarei o período reservado: entrada a partir das 18h e saída até as 12h.
3. Sou responsável pelos meus convidados e por eventuais danos ao espaço.
4. Conheço as proibições: uso comercial ou como moradia, animais, fumo, menores desacompanhados do responsável legal e uso da academia pelos hóspedes.
5. Os hóspedes trazem travesseiros, roupa de cama e itens de higiene.
6. A tag de acesso, quando entregue, será devolvida em perfeitas condições, sob pena de cobrança de R$ 100,00.
$t$);

-- Detalhes da reserva Be My Guest (1:1 com bookings)
create table bmg_details (
  booking_id uuid primary key references bookings(id),
  start_date date not null,
  end_date date not null,
  nights int generated always as (end_date - start_date) stored,
  requested_by uuid not null references users(id),
  terms_version int not null,
  terms_accepted_at timestamptz not null,
  decided_by uuid references users(id),
  decided_at timestamptz,
  decision_note text,
  check (end_date > start_date and end_date - start_date <= 7)
);

create table bmg_guests (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references bookings(id),
  full_name text not null check (length(trim(full_name)) >= 5),
  cpf text not null check (cpf ~ '^\d{11}$'),
  is_minor boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index bmg_guests_cpf_per_booking on bmg_guests (booking_id, cpf);

-- Operação: vistoria, tag, entrada e saída
create table bmg_operations (
  booking_id uuid primary key references bookings(id),
  inspection_ok boolean,
  inspection_note text,
  inspected_by uuid references users(id),
  tag_code text,
  checked_in_at timestamptz,
  checked_in_by uuid references users(id),
  checked_out_at timestamptz,
  checked_out_by uuid references users(id),
  tag_returned text check (tag_returned in ('sem_tag', 'devolvida_ok', 'nao_devolvida', 'danificada')),
  checkout_note text,
  occurrence_status text not null default 'sem_ocorrencia'
    check (occurrence_status in ('sem_ocorrencia', 'pendente_validacao', 'validada', 'descartada')),
  occurrence_amount numeric(10,2),
  occurrence_validated_by uuid references users(id),
  occurrence_validated_at timestamptz,
  occurrence_note text
);

-- Exceções de horário autorizadas pela administração (27.22 §2º)
create table bmg_exceptions (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references bookings(id),
  previous_period tstzrange not null,
  new_period tstzrange not null,
  reason text not null,
  charge_note text,
  authorized_by uuid not null references users(id),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Regras no banco
-- ---------------------------------------------------------------------
-- Uma reserva ativa do Be My Guest por unidade (27.7 b)
create unique index bookings_bmg_one_active_per_unit
  on bookings (unit_id) where kind = 'bmg' and status in ('solicitada', 'confirmada', 'em_uso');

-- No máximo 7 diárias por unidade em qualquer período de 30 dias (definição de 09/11/2026)
create or replace function app.bmg_window_check(p_unit uuid) returns void
language plpgsql security definer set search_path = public as $$
declare w date; total int; lo date; hi date;
begin
  select min(d.start_date) - 29, max(d.end_date) into lo, hi
  from bmg_details d join bookings b on b.id = d.booking_id
  where b.unit_id = p_unit and b.status in ('solicitada', 'confirmada', 'em_uso', 'concluida');
  if lo is null then return; end if;
  for w in select generate_series(lo, hi, interval '1 day')::date loop
    select coalesce(sum(greatest(0, least(d.end_date, w + 30) - greatest(d.start_date, w))), 0) into total
    from bmg_details d join bookings b on b.id = d.booking_id
    where b.unit_id = p_unit and b.status in ('solicitada', 'confirmada', 'em_uso', 'concluida');
    if total > 7 then
      raise exception 'Cada apartamento pode usar até 7 diárias a cada 30 dias. Escolha outras datas.';
    end if;
  end loop;
end $$;

create or replace function app.bmg_details_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare b bookings; ok boolean;
begin
  select * into b from bookings where id = new.booking_id;
  if b.kind <> 'bmg' then raise exception 'Reserva inválida.'; end if;
  -- Quem pede: proprietário ou locatário vinculado (27.3), salvo lançamento pela administração
  select exists (
    select 1 from unit_memberships m join users u on u.id = m.user_id
    where m.user_id = new.requested_by and m.unit_id = b.unit_id and m.status = 'ativo' and u.status = 'ativo'
      and m.relation in ('proprietario', 'locatario')
  ) or exists (
    select 1 from user_roles r where r.user_id = new.requested_by and r.role = 'admin'
  ) into ok;
  if not ok then
    raise exception 'A reserva do Be My Guest é feita pelo proprietário ou locatário do apartamento.';
  end if;
  perform app.bmg_window_check(b.unit_id);
  return new;
end $$;
create constraint trigger bmg_details_guard after insert or update on bmg_details
  deferrable initially deferred for each row execute function app.bmg_details_guard();

-- Revalida a janela de 30 dias quando uma reserva volta a contar (ex.: reativação)
create or replace function app.bmg_bookings_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.kind = 'bmg' then
    perform app.bmg_window_check(new.unit_id);
  end if;
  return new;
end $$;
create constraint trigger bmg_bookings_guard after update of status on bookings
  deferrable initially deferred for each row when (new.kind = 'bmg') execute function app.bmg_bookings_guard();

-- Até 2 hóspedes por reserva (27.6); menor só acompanhado de adulto responsável (27.12 e)
create or replace function app.bmg_guests_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare n int; minors int;
begin
  select count(*), count(*) filter (where is_minor) into n, minors from bmg_guests where booking_id = new.booking_id;
  if n > 2 then raise exception 'O quarto recebe no máximo 2 hóspedes.'; end if;
  if n = 0 then raise exception 'Informe os hóspedes.'; end if;
  if minors > 0 and minors = n then
    raise exception 'Menores de idade precisam estar acompanhados do responsável legal.';
  end if;
  return new;
end $$;
create constraint trigger bmg_guests_guard after insert or update on bmg_guests
  deferrable initially deferred for each row execute function app.bmg_guests_guard();

-- ---------------------------------------------------------------------
-- Acesso (RLS): dados dos hóspedes só para a unidade, administração e portaria
-- ---------------------------------------------------------------------
alter table bmg_details enable row level security;
alter table bmg_guests enable row level security;
alter table bmg_operations enable row level security;
alter table bmg_exceptions enable row level security;

grant select on bmg_details, bmg_guests, bmg_operations, bmg_exceptions to newin_app;
create policy bmgd_read on bmg_details for select to newin_app using (
  app.is_staff() or app.has_role('portaria')
  or booking_id in (select id from bookings where unit_id in (select app.my_unit_ids())));
create policy bmgg_read on bmg_guests for select to newin_app using (
  app.is_staff() or app.has_role('portaria')
  or booking_id in (select id from bookings where unit_id in (select app.my_unit_ids())));
create policy bmgo_read on bmg_operations for select to newin_app using (
  app.is_staff() or app.has_role('portaria')
  or booking_id in (select id from bookings where unit_id in (select app.my_unit_ids())));
create policy bmge_read on bmg_exceptions for select to newin_app using (
  app.is_staff() or app.has_role('portaria')
  or booking_id in (select id from bookings where unit_id in (select app.my_unit_ids())));

-- Agenda pública: só ocupação (sem unidade, nomes ou documentos)
create or replace view booking_availability with (security_barrier) as
  select b.space_id, b.blocked, b.period, true as occupies, b.kind
  from bookings b where b.status in ('solicitada', 'confirmada', 'em_uso');
grant select on booking_availability to newin_app;

-- ---------------------------------------------------------------------
-- Parâmetros do módulo
-- ---------------------------------------------------------------------
update parameters set description = 'Regimento 27.7(a) exige, mas não fixa o prazo. Defina em horas na tela do Be My Guest.'
where key = 'bmg.antecedencia';

insert into parameters (key, module, label, description, value, status, source, blocks) values
('bmg.abertura', 'bmg', 'Reservas do Be My Guest abertas no aplicativo',
 'Liberação feita pela administração na tela do Be My Guest. Exige a antecedência mínima definida.', null, 'pendente', null, null),
('bmg.confirmacao', 'bmg', 'Confirmação das solicitações',
 'Regimento 27.30: acesso após confirmação pela portaria e vistoria pela administração.',
 '{"texto": "Confirmação pela administração."}'::jsonb, 'definido', 'Regimento V7, item 27.30', null)
on conflict (key) do nothing;
