-- =====================================================================
-- 001 — Fundação: unidades, usuários, perfis, vínculos, espaços,
--       parâmetros, adimplência, sessões e trilha de auditoria encadeada.
-- =====================================================================

create extension if not exists btree_gist;

-- Papel sem login usado pela aplicação a cada transação (SET LOCAL ROLE).
-- As políticas de acesso (RLS) valem para ele; o dono das tabelas não.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'newin_app') then
    create role newin_app nologin;
  end if;
end $$;

create schema if not exists app;
grant usage on schema app to newin_app;
grant usage on schema public to newin_app;

-- Marcador do ambiente (producao | demonstracao). Gravado uma única vez.
create table environment_marker (
  singleton boolean primary key default true check (singleton),
  env text not null check (env in ('producao', 'demonstracao')),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Contexto da requisição
-- ---------------------------------------------------------------------
create or replace function app.current_user_id() returns uuid
language sql stable as $$
  select nullif(current_setting('app.user_id', true), '')::uuid
$$;

-- ---------------------------------------------------------------------
-- Unidades (fonte: Convenção, art. 3º e 4º — 192 unidades residenciais)
-- ---------------------------------------------------------------------
create table units (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  floor int not null,
  final text not null,
  kind text not null default 'tipo' check (kind in ('tipo', 'duplex')),
  active boolean not null default true,
  notes text
);

insert into units (code, floor, final, kind)
select f::text || lpad(n::text, 2, '0'), f, lpad(n::text, 2, '0'),
       case when f = 26 and n in (2, 3, 6, 7) then 'duplex' else 'tipo' end
from generate_series(3, 26) f, generate_series(1, 8) n;

-- ---------------------------------------------------------------------
-- Usuários e perfis
-- ---------------------------------------------------------------------
create table users (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  full_name text not null,
  phone text,
  password_hash text not null,
  status text not null default 'pendente'
    check (status in ('pendente', 'ativo', 'recusado', 'bloqueado')),
  must_change_password boolean not null default false,
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references users(id),
  decision_note text
);
create unique index users_email_uq on users (lower(email));

create table user_roles (
  user_id uuid not null references users(id) on delete cascade,
  role text not null check (role in ('morador', 'admin', 'portaria', 'administradora')),
  granted_by uuid references users(id),
  granted_at timestamptz not null default now(),
  primary key (user_id, role)
);

-- Vínculo usuário ↔ unidade. A unidade nunca é alterada pelo próprio usuário:
-- ele solicita, a administração aprova.
create table unit_memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  unit_id uuid not null references units(id),
  relation text not null check (relation in ('proprietario', 'locatario', 'morador_autorizado')),
  resides boolean not null,
  status text not null default 'solicitado'
    check (status in ('solicitado', 'ativo', 'recusado', 'encerrado')),
  requested_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references users(id),
  notes text
);
create unique index unit_memberships_open_uq
  on unit_memberships (user_id, unit_id) where status in ('solicitado', 'ativo');

-- Situação de adimplência por unidade: só a administração registra (nunca o morador).
create table unit_standing (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references units(id),
  standing text not null check (standing in ('adimplente', 'inadimplente')),
  reference_date date not null,
  source text not null,
  recorded_by uuid not null references users(id),
  recorded_at timestamptz not null default now()
);
create index unit_standing_unit_idx on unit_standing (unit_id, recorded_at desc);

create table sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  user_agent text
);

-- ---------------------------------------------------------------------
-- Funções de autorização (SECURITY DEFINER para não recair nas políticas)
-- ---------------------------------------------------------------------
create or replace function app.has_role(r text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from user_roles ur join users u on u.id = ur.user_id
    where ur.user_id = app.current_user_id() and ur.role = r and u.status = 'ativo'
  )
$$;

create or replace function app.is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select app.has_role('admin')
$$;

create or replace function app.my_unit_ids() returns setof uuid
language sql stable security definer set search_path = public as $$
  select m.unit_id from unit_memberships m join users u on u.id = m.user_id
  where m.user_id = app.current_user_id() and m.status = 'ativo' and u.status = 'ativo'
$$;

grant execute on all functions in schema app to newin_app;

-- ---------------------------------------------------------------------
-- Espaços
-- ---------------------------------------------------------------------
create table spaces (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  kind text not null check (kind in ('salao', 'bmg_quarto', 'cowork_reunioes', 'cowork_mini')),
  capacity int,
  capacity_source text,
  active boolean not null default true,
  sort_order int not null default 0,
  notes text
);

insert into spaces (code, name, kind, capacity, capacity_source, sort_order, notes) values
  ('skybar',   'SKY Bar (Rooftop)',            'salao', 30, 'Regimento V7, item 20.17', 1, null),
  ('partyin',  'Party In (salão de festas)',   'salao', 40, 'Regimento V7, item 20.17', 2, null),
  ('gourmetin','Gourmet In (espaço gourmet)',  'salao', 20, 'Regimento V7, item 20.17', 3, null),
  ('bmg-1',    'Be My Guest — Suíte 1',        'bmg_quarto', 2, 'Regimento V7, item 27.6 (máx. 2 pessoas)', 10,
               'Convenção, art. 4º: "2 suítes com banho (Be my guest)" no 2º pavimento. Identificação dos quartos pendente de confirmação.'),
  ('bmg-2',    'Be My Guest — Suíte 2',        'bmg_quarto', 2, 'Regimento V7, item 27.6 (máx. 2 pessoas)', 11,
               'Convenção, art. 4º. Identificação dos quartos pendente de confirmação.'),
  ('cw-reunioes','Coworking — Sala de reuniões','cowork_reunioes', null, null, 20,
               'Regimento V7, item 23.1(a): reserva obrigatória para receber de 1 a 7 convidados. Capacidade pendente de definição.'),
  ('cw-mini',  'Coworking — Mini sala de reuniões e entrevistas', 'cowork_mini', null, null, 21,
               'Não individualizada no Regimento. Capacidade, horários e recebimento de convidados pendentes de definição.');

create table space_blocks (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references spaces(id),
  period tstzrange not null,
  reason text not null,
  created_by uuid not null references users(id),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Parâmetros (valor + fonte + situação). Ausente = "pendente de definição",
-- nunca zero, gratuito ou ilimitado.
-- ---------------------------------------------------------------------
create table parameters (
  key text primary key,
  module text not null,
  label text not null,
  description text,
  value jsonb,
  status text not null default 'pendente' check (status in ('pendente', 'definido')),
  source text,
  blocks text,               -- operação que fica bloqueada enquanto pendente
  updated_by uuid references users(id),
  updated_at timestamptz,
  check (status = 'pendente' or (value is not null and source is not null))
);

-- ---------------------------------------------------------------------
-- Trilha de auditoria encadeada (cada linha carrega o hash da anterior).
-- Não admite alteração nem exclusão.
-- ---------------------------------------------------------------------
create table audit_log (
  id bigserial primary key,
  at timestamptz not null default clock_timestamp(),
  actor_id uuid references users(id),
  actor_label text not null,
  action text not null,
  entity text not null,
  entity_id text,
  data jsonb not null default '{}'::jsonb,
  prev_hash text not null,
  hash text not null
);

create or replace function app.audit_payload(a audit_log) returns text
language sql immutable as $$
  select concat_ws('|',
    a.prev_hash, a.id::text,
    to_char(a.at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    coalesce(a.actor_id::text, '-'), a.actor_label, a.action, a.entity,
    coalesce(a.entity_id, '-'), a.data::text)
$$;

create or replace function app.audit_before_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare last_hash text;
begin
  perform pg_advisory_xact_lock(778899);
  select hash into last_hash from audit_log order by id desc limit 1;
  new.prev_hash := coalesce(last_hash, repeat('0', 64));
  new.at := clock_timestamp();
  new.hash := encode(sha256(convert_to(app.audit_payload(new), 'UTF8')), 'hex');
  return new;
end $$;

create trigger audit_log_chain before insert on audit_log
  for each row execute function app.audit_before_insert();

create or replace function app.audit_immutable() returns trigger
language plpgsql as $$
begin
  raise exception 'A trilha de auditoria não pode ser alterada nem excluída.';
end $$;

create trigger audit_log_no_update before update or delete on audit_log
  for each row execute function app.audit_immutable();
create trigger audit_log_no_truncate before truncate on audit_log
  for each statement execute function app.audit_immutable();

-- Verifica a cadeia inteira; retorna o primeiro id quebrado (ou null).
create or replace function app.audit_verify()
returns table (ok boolean, total bigint, first_broken bigint, head_hash text)
language plpgsql stable security definer set search_path = public as $$
declare r audit_log; expected_prev text := repeat('0', 64); n bigint := 0; broken bigint := null; head text := null;
begin
  for r in select * from audit_log order by id loop
    n := n + 1;
    if broken is null and (r.prev_hash <> expected_prev or
       r.hash <> encode(sha256(convert_to(app.audit_payload(r), 'UTF8')), 'hex')) then
      broken := r.id;
    end if;
    expected_prev := r.hash; head := r.hash;
  end loop;
  return query select broken is null, n, broken, head;
end $$;

-- ---------------------------------------------------------------------
-- Políticas de acesso (RLS)
-- ---------------------------------------------------------------------
alter table units enable row level security;
alter table users enable row level security;
alter table user_roles enable row level security;
alter table unit_memberships enable row level security;
alter table unit_standing enable row level security;
alter table spaces enable row level security;
alter table space_blocks enable row level security;
alter table parameters enable row level security;
alter table audit_log enable row level security;
alter table sessions enable row level security;
alter table environment_marker enable row level security;

grant select on units, spaces, parameters, environment_marker to newin_app;
create policy units_read on units for select to newin_app using (app.current_user_id() is not null);
create policy units_admin on units for update to newin_app using (app.is_staff());
grant update (notes, active) on units to newin_app;
create policy spaces_read on spaces for select to newin_app using (app.current_user_id() is not null);
create policy spaces_admin_upd on spaces for update to newin_app using (app.is_staff());
grant update (name, capacity, capacity_source, active, notes, sort_order) on spaces to newin_app;
create policy params_read on parameters for select to newin_app using (app.current_user_id() is not null);
create policy params_admin on parameters for update to newin_app using (app.is_staff());
grant update (value, status, source, updated_by, updated_at) on parameters to newin_app;
create policy env_read on environment_marker for select to newin_app using (true);

-- password_hash nunca é legível pela aplicação com o papel newin_app.
grant select (id, email, full_name, phone, status, must_change_password, created_at,
              decided_at, decided_by, decision_note) on users to newin_app;
grant update (full_name, phone) on users to newin_app;
grant update (status, decided_at, decided_by, decision_note) on users to newin_app;
create policy users_self on users for select to newin_app
  using (id = app.current_user_id() or app.is_staff() or app.has_role('portaria'));
create policy users_self_upd on users for update to newin_app
  using (id = app.current_user_id() or app.is_staff())
  with check (id = app.current_user_id() or app.is_staff());

create or replace function app.users_guard() returns trigger
language plpgsql as $$
begin
  if not app.is_staff() and (new.status is distinct from old.status
      or new.decided_at is distinct from old.decided_at
      or new.decided_by is distinct from old.decided_by
      or new.decision_note is distinct from old.decision_note) then
    raise exception 'Somente a administração pode alterar a situação do cadastro.';
  end if;
  return new;
end $$;
create trigger users_guard before update on users
  for each row when (current_user = 'newin_app') execute function app.users_guard();

grant select, insert, delete on user_roles to newin_app;
create policy roles_read on user_roles for select to newin_app
  using (user_id = app.current_user_id() or app.is_staff());
create policy roles_admin_ins on user_roles for insert to newin_app with check (app.is_staff());
create policy roles_admin_del on user_roles for delete to newin_app using (app.is_staff());

grant select, insert on unit_memberships to newin_app;
grant update (status, decided_at, decided_by, notes, relation, resides) on unit_memberships to newin_app;
create policy um_read on unit_memberships for select to newin_app
  using (user_id = app.current_user_id() or app.is_staff() or app.has_role('portaria'));
create policy um_request on unit_memberships for insert to newin_app
  with check ((user_id = app.current_user_id() and status = 'solicitado') or app.is_staff());
create policy um_admin_upd on unit_memberships for update to newin_app using (app.is_staff());

grant select, insert on unit_standing to newin_app;
create policy us_read on unit_standing for select to newin_app
  using (app.is_staff() or unit_id in (select app.my_unit_ids()));
create policy us_admin_ins on unit_standing for insert to newin_app
  with check (app.is_staff() and recorded_by = app.current_user_id());

grant select, insert, delete on space_blocks to newin_app;
create policy sb_read on space_blocks for select to newin_app using (app.current_user_id() is not null);
create policy sb_admin on space_blocks for insert to newin_app with check (app.is_staff());
create policy sb_admin_del on space_blocks for delete to newin_app using (app.is_staff());

grant select, insert on audit_log to newin_app;
grant usage on sequence audit_log_id_seq to newin_app;
create policy audit_read on audit_log for select to newin_app using (app.is_staff());
create policy audit_insert on audit_log for insert to newin_app
  with check (actor_id is not distinct from app.current_user_id());
-- sessions: sem permissão para newin_app (somente código de autenticação no servidor).
