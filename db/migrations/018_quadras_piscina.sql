-- =====================================================================
-- 018 — Quadras (poliesportiva e de areia), convidados da piscina,
--        aceites de termos e avisos no app.
--
-- Regimento Interno V7:
--   25.2  quadras: uso dos moradores; visitantes só com o morador presente
--   25.3  jogos amistosos/organizados com mais de 4 visitantes: autorização prévia
--   25.4  a Administração pode fazer programação semanal/mensal das quadras
--   25.7  horário das quadras: 08h00 às 22h00
--   21.1  piscina: 05h00 às 24h00; até 2 convidados por vez por unidade,
--         com o morador responsável presente
-- A piscina NÃO tem reserva, controle de acesso, entrada/saída ou presença.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Ambientes
-- ---------------------------------------------------------------------
alter table spaces drop constraint spaces_kind_check;
alter table spaces add constraint spaces_kind_check
  check (kind in ('salao', 'bmg_quarto', 'cowork_reunioes', 'cowork_mini', 'quadra', 'piscina'));

insert into spaces (code, name, kind, capacity, capacity_source, sort_order, notes) values
  ('quadra-poli',  'Quadra Poliesportiva', 'quadra', null, null, 30, 'Regimento V7, capítulo 25. Uso compartilhado com programação de horários.'),
  ('quadra-areia', 'Quadra de Areia',      'quadra', null, null, 31, 'Regimento V7, capítulo 25. Uso compartilhado com programação de horários.'),
  ('piscina',      'Piscina',              'piscina', null, null, 40, 'Regimento V7, capítulo 21. Sem reserva: apenas cadastro de convidados.');

alter table bookings drop constraint bookings_kind_check;
alter table bookings add constraint bookings_kind_check
  check (kind in ('salao_festivo', 'salao', 'bmg', 'coworking', 'quadra'));

-- ---------------------------------------------------------------------
-- Agendamentos das quadras (o horário e o status ficam em bookings)
-- status em bookings: solicitada (aguardando confirmação ou aprovação),
-- confirmada, recusada (rejeitada), cancelada
-- ---------------------------------------------------------------------
create table court_details (
  booking_id uuid primary key references bookings(id) on delete cascade,
  modality text not null,
  participants int not null check (participants between 1 and 60),
  visitors int not null default 0 check (visitors between 0 and 60),
  activity text not null check (activity in ('recreativo', 'jogo')),
  activity_note text,
  approval text not null default 'nao_requer' check (approval in ('nao_requer', 'pendente', 'aprovada', 'rejeitada')),
  decided_by uuid references users(id),
  decided_at timestamptz,
  decision_note text,
  terms_version int,
  terms_accepted_at timestamptz,
  requested_by uuid references users(id),
  updated_at timestamptz not null default now(),
  check (visitors = 0 or terms_accepted_at is not null)
);
alter table court_details enable row level security;
grant select on court_details to newin_app;
create policy court_details_read on court_details for select to newin_app using (
  app.is_staff() or exists (select 1 from bookings b where b.id = booking_id and b.unit_id in (select app.my_unit_ids())));

-- Mais de 4 visitantes em jogo amistoso/organizado exige autorização (25.3)
create or replace function app.court_rules() returns trigger language plpgsql as $$
begin
  if new.activity = 'jogo' and new.visitors > 4 and new.approval = 'nao_requer' then
    raise exception 'Jogos com mais de 4 visitantes precisam de autorização da administração (Regimento, item 25.3).'
      using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger court_details_rules before insert or update on court_details for each row execute function app.court_rules();

-- ---------------------------------------------------------------------
-- Programações (25.4) e bloqueios administrativos, com recorrência
-- weekdays: dias da semana ISO (1 = segunda … 7 = domingo); vazio = só start_date
-- ---------------------------------------------------------------------
create table court_schedules (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references spaces(id),
  kind text not null check (kind in ('programacao', 'bloqueio')),
  title text not null,
  audience text,
  start_date date not null,
  end_date date,
  weekdays int[] check (weekdays is null or weekdays <@ array[1,2,3,4,5,6,7]),
  start_time time not null,
  end_time time not null,
  created_by uuid not null references users(id),
  created_at timestamptz not null default now(),
  cancelled_at timestamptz,
  cancelled_by uuid references users(id),
  cancel_reason text,
  check (end_time > start_time),
  check (end_date is null or end_date >= start_date),
  check (weekdays is not null or end_date is null or end_date = start_date)
);
alter table court_schedules enable row level security;
grant select on court_schedules to newin_app;
create policy court_schedules_read on court_schedules for select to newin_app using (app.current_user_id() is not null);

-- Ocorrência de programação/bloqueio que conflita com um período (horário local)
create or replace function app.court_schedule_conflict(p_space uuid, p_period tstzrange)
returns table (id uuid, kind text, title text) language sql stable as $$
  with d as (
    select (lower(p_period) at time zone 'America/Sao_Paulo') as ini,
           (upper(p_period) at time zone 'America/Sao_Paulo') as fim
  )
  select s.id, s.kind, s.title from court_schedules s, d
  where s.space_id = p_space and s.cancelled_at is null
    and d.ini::date >= s.start_date and (s.end_date is null or d.ini::date <= s.end_date)
    and (case when s.weekdays is null then d.ini::date = s.start_date
              else extract(isodow from d.ini)::int = any (s.weekdays) end)
    and (d.ini::date + s.start_time) < d.fim and (d.ini::date + s.end_time) > d.ini
$$;

create or replace function app.booking_court_check() returns trigger language plpgsql as $$
declare c record; ini timestamp; fim timestamp;
begin
  if new.kind <> 'quadra' or new.status not in ('solicitada', 'confirmada', 'em_uso') then return null; end if;
  ini := lower(new.period) at time zone 'America/Sao_Paulo';
  fim := upper(new.period) at time zone 'America/Sao_Paulo';
  -- Horário regimental das quadras (25.7): 08h00 às 22h00, no mesmo dia
  if ini < ini::date + time '08:00' or fim > ini::date + time '22:00' or fim <= ini then
    raise exception 'As quadras funcionam das 08h00 às 22h00 (Regimento, item 25.7).' using errcode = 'P0001';
  end if;
  select * into c from app.court_schedule_conflict(new.space_id, new.period) limit 1;
  if found then
    raise exception 'Horário reservado para %: %.', case when c.kind = 'bloqueio' then 'bloqueio da administração' else 'programação da administração' end, c.title
      using errcode = 'P0001';
  end if;
  return null;
end $$;
create constraint trigger bookings_court_check after insert or update of period, status on bookings
  deferrable initially immediate for each row execute function app.booking_court_check();

-- ---------------------------------------------------------------------
-- Termos e aceites (registro de quem, unidade, versão e quando)
-- ---------------------------------------------------------------------
insert into terms_documents (kind, version, body_md) values
('piscina', 1, 'Declaro estar ciente de que o Regimento Interno do Condomínio New.In permite a utilização da piscina por até dois convidados simultâneos por unidade, mediante acompanhamento do morador responsável, comprometendo-me a observar as regras de utilização, segurança e convivência aplicáveis ao ambiente.'),
('quadras', 1, 'Declaro estar ciente de que meus visitantes só podem usar a quadra na minha presença e sob minha responsabilidade (Regimento Interno, itens 25.2 e 25.6), e de que jogos amistosos ou organizados com mais de 4 visitantes dependem de autorização prévia da administração (item 25.3).');

create table term_acceptances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id),
  unit_id uuid references units(id),
  kind text not null,
  version int not null,
  accepted_at timestamptz not null default now(),
  context jsonb not null default '{}',
  foreign key (kind, version) references terms_documents(kind, version)
);
alter table term_acceptances enable row level security;
grant select on term_acceptances to newin_app;
create policy term_acceptances_read on term_acceptances for select to newin_app
  using (app.is_staff() or user_id = app.current_user_id());

-- ---------------------------------------------------------------------
-- Piscina: cadastro prévio de convidados (sem reserva, sem presença)
-- ---------------------------------------------------------------------
create table pool_guests (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references units(id),
  responsible_user_id uuid not null references users(id),
  visit_date date not null,
  full_name text not null check (length(full_name) between 3 and 120),
  document text check (document is null or length(document) between 3 and 30),
  is_minor boolean not null default false,
  status text not null default 'ativo' check (status in ('ativo', 'cancelado')),
  acceptance_id uuid not null references term_acceptances(id),
  cancel_reason text,
  cancelled_by uuid references users(id),
  cancelled_at timestamptz,
  anonymized_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references users(id),
  check (status = 'ativo' or cancel_reason is not null)
);
create index pool_guests_date_idx on pool_guests (visit_date, unit_id);
alter table pool_guests enable row level security;
grant select on pool_guests to newin_app;
create policy pool_guests_read on pool_guests for select to newin_app
  using (app.is_staff() or unit_id in (select app.my_unit_ids()));

-- Retenção (LGPD): remove nome e documento de cadastros antigos, mantendo só números
create or replace function app.pool_retention(p_days int) returns int language sql as $$
  with x as (
    update pool_guests set full_name = 'Convidado (dados removidos)', document = null, anonymized_at = now()
    where anonymized_at is null and visit_date < current_date - p_days
    returning 1)
  select count(*)::int from x
$$;

-- ---------------------------------------------------------------------
-- Avisos no app (notificações)
-- ---------------------------------------------------------------------
create table notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  title text not null,
  body text,
  link text,
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index notifications_user_idx on notifications (user_id, created_at desc);
alter table notifications enable row level security;
grant select on notifications to newin_app;
grant update (read_at) on notifications to newin_app;
create policy notifications_read on notifications for select to newin_app using (user_id = app.current_user_id());
create policy notifications_mark on notifications for update to newin_app
  using (user_id = app.current_user_id()) with check (user_id = app.current_user_id());

-- ---------------------------------------------------------------------
-- Parâmetros. Regra do Regimento = “definido” com a fonte; o que o
-- Regimento não define fica “pendente” e NÃO é aplicado (sem limites inventados).
-- ---------------------------------------------------------------------
insert into parameters (key, module, label, description, value, status, source) values
  ('quadra.horario', 'quadras', 'Horário das quadras', 'Funcionamento das duas quadras.',
     '{"inicio": "08:00", "fim": "22:00", "texto": "08h00 às 22h00"}', 'definido', 'Regimento Interno V7, item 25.7'),
  ('quadra.visitantes_autorizacao', 'quadras', 'Autorização para visitantes', 'Jogos amistosos ou organizados acima deste número de visitantes precisam de autorização prévia.',
     '{"acima_de": 4, "texto": "Mais de 4 visitantes em jogos"}', 'definido', 'Regimento Interno V7, item 25.3'),
  ('piscina.horario', 'piscina', 'Horário da piscina', 'Funcionamento da piscina.',
     '{"inicio": "05:00", "fim": "24:00", "texto": "05h00 às 24h00"}', 'definido', 'Regimento Interno V7, item 21.1'),
  ('piscina.convidados_simultaneos', 'piscina', 'Convidados por vez', 'Convidados da mesma unidade na piscina ao mesmo tempo, com o morador presente.',
     '{"quantidade": 2, "texto": "2 convidados por vez"}', 'definido', 'Regimento Interno V7, item 21.1, c, i'),
  ('piscina.limite_diario', 'piscina', 'Limite diário de cadastros (opcional)', 'Configuração administrativa opcional. Não é exigência do Regimento, que trata de convidados simultâneos.',
     '{"ativo": false, "quantidade": 2, "texto": "Desativado"}', 'definido', 'Configuração inicial (desativada)'),
  ('piscina.documento', 'piscina', 'Documento do convidado', 'Pedir documento no cadastro: nao_solicitar, opcional ou obrigatorio.',
     '{"modo": "nao_solicitar", "texto": "Não solicitado"}', 'definido', 'Configuração inicial (LGPD: coletar só o necessário)'),
  ('piscina.retencao', 'piscina', 'Retenção dos dados dos convidados', 'Após quantos dias da data prevista os nomes e documentos são removidos.',
     null, 'pendente', null);

-- Parâmetros operacionais de cada quadra (não previstos no Regimento)
insert into parameters (key, module, label, description, value, status, source)
select 'quadra.' || q.k || '.' || p.k, 'quadras', q.n || ': ' || p.label, p.descr, p.val, p.st, p.src
from (values ('poli', 'Quadra Poliesportiva'), ('areia', 'Quadra de Areia')) as q(k, n)
cross join (values
  ('confirmacao', 'Confirmação', 'automatica ou administracao. Pendente: a administração confirma cada agendamento.', null::jsonb, 'pendente', null::text),
  ('duracao', 'Duração dos horários', 'Duração fixa de cada agendamento, em minutos. Pendente: o morador escolhe início e fim.', null, 'pendente', null),
  ('antecedencia_min', 'Antecedência mínima', 'Horas mínimas entre o pedido e o início.', null, 'pendente', null),
  ('antecedencia_max', 'Antecedência máxima', 'Dias máximos de antecedência para agendar.', null, 'pendente', null),
  ('max_unidade', 'Máximo de agendamentos por unidade', 'Quantidade e período (dia, semana ou mês).', null, 'pendente', null),
  ('intervalo', 'Intervalo entre agendamentos', 'Minutos mínimos entre dois agendamentos da mesma unidade.', null, 'pendente', null),
  ('consecutivos', 'Limite de tempo consecutivo', 'Minutos máximos de uso contínuo por agendamento.', null, 'pendente', null),
  ('prioridade', 'Regras de prioridade', 'Texto com as prioridades da programação (item 25.4). Informativo.', null, 'pendente', null),
  ('cancelamento', 'Prazo de cancelamento', 'Horas mínimas antes do início para o morador cancelar.', null, 'pendente', null)
) as p(k, label, descr, val, st, src);

insert into parameters (key, module, label, description, value, status, source) values
  ('quadra.poli.modalidades', 'quadras', 'Quadra Poliesportiva: modalidades', 'Lista exibida no agendamento.',
     '{"lista": ["Futsal", "Basquete", "Vôlei", "Handebol", "Outras modalidades"], "texto": "Futsal, Basquete, Vôlei, Handebol, Outras"}', 'definido', 'Lista inicial editável pela administração'),
  ('quadra.areia.modalidades', 'quadras', 'Quadra de Areia: modalidades', 'Lista exibida no agendamento.',
     '{"lista": ["Beach Tennis", "Vôlei de Areia", "Futevôlei", "Outras modalidades"], "texto": "Beach Tennis, Vôlei de Areia, Futevôlei, Outras"}', 'definido', 'Definição do condomínio (lista editável)');
