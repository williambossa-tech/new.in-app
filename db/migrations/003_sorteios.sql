-- =====================================================================
-- 003 — Reservas (base comum) e sorteios dos salões.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Reservas (base comum a salões, Be My Guest e coworking)
-- Estados que ocupam a agenda e contam como reserva ativa:
--   solicitada, confirmada, em_uso
-- Não ocupam: concluida, cancelada, recusada, ausencia
-- ---------------------------------------------------------------------
create table bookings (
  id uuid primary key default gen_random_uuid(),
  code text not null unique default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)),
  space_id uuid not null references spaces(id),
  unit_id uuid not null references units(id),
  responsible_user_id uuid references users(id),
  responsible_name text,
  kind text not null check (kind in ('salao_festivo', 'salao', 'bmg', 'coworking')),
  status text not null check (status in ('solicitada', 'confirmada', 'em_uso', 'concluida', 'cancelada', 'recusada', 'ausencia')),
  period tstzrange not null,          -- uso efetivo
  blocked tstzrange not null,         -- uso + intervalo operacional (ex.: limpeza)
  origin text not null check (origin in ('sorteio', 'app', 'admin')),
  lottery_stage_id uuid,
  fee_status text not null default 'pendente_definicao',
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid references users(id),
  cancelled_at timestamptz,
  cancel_reason text,
  check (blocked @> period),
  constraint bookings_no_overlap exclude using gist (space_id with =, blocked with &&)
    where (status in ('solicitada', 'confirmada', 'em_uso'))
);

alter table bookings enable row level security;
grant select on bookings to newin_app;
create policy bookings_read on bookings for select to newin_app
  using (app.is_staff() or app.has_role('portaria') or unit_id in (select app.my_unit_ids()));

-- Agenda pública: só disponibilidade/ocupação, sem dados pessoais.
create view booking_availability with (security_barrier) as
  select b.space_id, b.blocked, b.period, b.status in ('solicitada', 'confirmada', 'em_uso') as occupies
  from bookings b where b.status in ('solicitada', 'confirmada', 'em_uso');
grant select on booking_availability to newin_app;

-- ---------------------------------------------------------------------
-- Campanhas de sorteio
-- ---------------------------------------------------------------------
create table lottery_campaigns (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  title text not null,
  status text not null default 'rascunho' check (status in
    ('rascunho', 'inscricoes_abertas', 'inscricoes_encerradas', 'congelada', 'em_sorteio', 'concluida', 'cancelada')),
  registration_deadline_date date not null,
  registration_deadline timestamptz,            -- horário exato (null = pendente)
  draw_date date not null,
  draw_at timestamptz,
  source_note text not null,
  rules_md text not null,
  rules_version int not null default 1,
  terms_md text not null,
  terms_version int not null default 1,
  order_method text not null default 'pendente' check (order_method in ('pendente', 'fixa', 'sorteada')),
  order_note text,
  current_round int not null default 1,
  opened_at timestamptz, opened_by uuid references users(id),
  closed_at timestamptz, closed_by uuid references users(id),
  frozen_at timestamptz, frozen_by uuid references users(id),
  freeze_doc jsonb,
  freeze_hash text,
  concluded_at timestamptz,
  created_at timestamptz not null default now()
);

create table lottery_periods (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references lottery_campaigns(id),
  code text not null,
  label text not null,
  start_date date not null,
  end_date date not null,
  sort int not null,
  unique (campaign_id, code)
);

create table lottery_venues (
  campaign_id uuid not null references lottery_campaigns(id),
  space_id uuid not null references spaces(id),
  fixed_position int,                       -- usado quando order_method = 'fixa'
  primary key (campaign_id, space_id)
);

-- Rodadas: a 1ª é a oficial; outra só existe se a anterior for anulada com justificativa.
create table lottery_rounds (
  campaign_id uuid not null references lottery_campaigns(id),
  round int not null,
  status text not null check (status in ('lacrada', 'em_andamento', 'concluida', 'anulada')),
  seed_commitment text not null,           -- SHA-256 da chave secreta, publicado antes do sorteio
  sealed_at timestamptz not null default now(),
  sealed_by uuid references users(id),
  public_entropy text,                     -- número público informado no início do sorteio
  started_at timestamptz, started_by uuid references users(id),
  order_doc jsonb,                         -- ordem efetiva por período
  concluded_at timestamptz, concluded_by uuid references users(id),
  seed_revealed text,                      -- chave revelada após a conclusão (ou anulação)
  annulled_at timestamptz, annulled_by uuid references users(id), annul_reason text,
  primary key (campaign_id, round)
);

-- Chave secreta: sem nenhuma permissão para a aplicação comum.
create table lottery_secrets (
  campaign_id uuid not null,
  round int not null,
  seed text not null,
  primary key (campaign_id, round),
  foreign key (campaign_id, round) references lottery_rounds(campaign_id, round)
);

create table lottery_entries (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references lottery_campaigns(id),
  submission_id uuid not null,
  unit_id uuid not null references units(id),
  period_id uuid not null references lottery_periods(id),
  space_id uuid not null references spaces(id),
  applicant_name text not null check (length(trim(applicant_name)) >= 5),
  applicant_user_id uuid references users(id),
  contact text not null check (length(trim(contact)) >= 5),
  terms_version int not null,
  terms_accepted_at timestamptz not null,
  origin text not null check (origin in ('app', 'email')),
  email_received_at timestamptz,
  email_subject text,
  launched_by uuid references users(id),
  status text not null default 'ativa' check (status in ('ativa', 'cancelada', 'invalidada')),
  status_reason text,
  status_changed_at timestamptz,
  status_changed_by uuid references users(id),
  created_at timestamptz not null default now(),
  check (origin = 'app' or (email_received_at is not null and launched_by is not null))
);
-- Uma inscrição ativa por unidade + salão + período (várias contas da mesma unidade não somam chances).
create unique index lottery_entries_unit_uq
  on lottery_entries (campaign_id, unit_id, period_id, space_id) where status = 'ativa';

create table lottery_stages (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references lottery_campaigns(id),
  round int not null,
  period_id uuid not null references lottery_periods(id),
  space_id uuid not null references spaces(id),
  seq int not null,
  status text not null default 'pendente' check (status in ('pendente', 'sorteada', 'sem_elegiveis', 'anulada')),
  eligible jsonb,              -- lista ordenada de apartamentos elegíveis na etapa
  eligible_hash text,
  excluded jsonb,              -- apartamentos retirados por já terem vencido no período
  draw_index int,
  rng_counter int,
  winner_unit_id uuid references units(id),
  winner_entry_id uuid references lottery_entries(id),
  executed_by uuid references users(id),
  executed_at timestamptz,
  foreign key (campaign_id, round) references lottery_rounds(campaign_id, round),
  unique (campaign_id, round, period_id, seq),
  unique (campaign_id, round, period_id, space_id)
);
-- Uma unidade ganha no máximo um salão por período em cada rodada.
create unique index lottery_stages_one_win_per_period
  on lottery_stages (campaign_id, round, period_id, winner_unit_id)
  where winner_unit_id is not null and status = 'sorteada';

alter table bookings add constraint bookings_stage_fk foreign key (lottery_stage_id) references lottery_stages(id);

create table lottery_simulations (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references lottery_campaigns(id),
  created_by uuid not null references users(id),
  created_at timestamptz not null default now(),
  basis text not null,           -- 'inscricoes_atuais' | 'lista_congelada'
  result jsonb not null
);

-- ---------------------------------------------------------------------
-- Regras de integridade no banco
-- ---------------------------------------------------------------------
create or replace function app.lottery_deadline(c lottery_campaigns) returns timestamptz
language sql stable as $$
  select coalesce(c.registration_deadline,
    ((c.registration_deadline_date + 1)::timestamp at time zone 'America/Sao_Paulo'))
$$;

create or replace function app.lottery_entries_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare c lottery_campaigns; ok_member boolean;
begin
  if tg_op = 'DELETE' then
    raise exception 'Inscrições não são excluídas; use o cancelamento com motivo.';
  end if;
  select * into c from lottery_campaigns where id = new.campaign_id for share;
  if tg_op = 'INSERT' then
    if new.origin = 'app' then
      if c.status <> 'inscricoes_abertas' then
        raise exception 'As inscrições desta campanha não estão abertas.';
      end if;
      if now() > app.lottery_deadline(c) then
        raise exception 'O prazo de inscrição terminou em %.',
          to_char(app.lottery_deadline(c) at time zone 'America/Sao_Paulo', 'DD/MM/YYYY "às" HH24:MI');
      end if;
      select exists (
        select 1 from unit_memberships m join users u on u.id = m.user_id
        where m.user_id = new.applicant_user_id and m.unit_id = new.unit_id
          and m.status = 'ativo' and u.status = 'ativo' and m.resides
      ) into ok_member;
      if not ok_member then
        raise exception 'Somente moradores vinculados e residentes na unidade podem inscrevê-la (Regimento 20.3 e 20.5).';
      end if;
    else
      if c.status not in ('inscricoes_abertas', 'inscricoes_encerradas') then
        raise exception 'Não é possível lançar inscrições: a lista já foi congelada ou a campanha não está aberta.';
      end if;
      if new.email_received_at > app.lottery_deadline(c) then
        raise exception 'E-mail recebido após o prazo de inscrição.';
      end if;
    end if;
    if not exists (select 1 from lottery_venues v where v.campaign_id = new.campaign_id and v.space_id = new.space_id) then
      raise exception 'Salão não participa desta campanha.';
    end if;
    if not exists (select 1 from lottery_periods p where p.id = new.period_id and p.campaign_id = new.campaign_id) then
      raise exception 'Período inválido para esta campanha.';
    end if;
  else -- UPDATE
    if c.status not in ('inscricoes_abertas', 'inscricoes_encerradas') then
      raise exception 'A lista de inscrições está congelada e não pode ser alterada.';
    end if;
    if (new.campaign_id, new.unit_id, new.period_id, new.space_id, new.applicant_name, new.contact, new.origin, new.created_at)
       is distinct from
       (old.campaign_id, old.unit_id, old.period_id, old.space_id, old.applicant_name, old.contact, old.origin, old.created_at) then
      raise exception 'Somente a situação da inscrição pode ser alterada.';
    end if;
    if old.status <> 'ativa' then
      raise exception 'Inscrição já cancelada ou invalidada.';
    end if;
  end if;
  return new;
end $$;

create trigger lottery_entries_guard before insert or update or delete on lottery_entries
  for each row execute function app.lottery_entries_guard();

create or replace function app.lottery_stages_guard() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Etapas de sorteio não podem ser excluídas.';
  end if;
  if old.status in ('sorteada', 'sem_elegiveis') then
    if new.status <> 'anulada' or
       (new.eligible, new.eligible_hash, new.draw_index, new.winner_unit_id, new.winner_entry_id, new.executed_at, new.executed_by)
       is distinct from
       (old.eligible, old.eligible_hash, old.draw_index, old.winner_unit_id, old.winner_entry_id, old.executed_at, old.executed_by) then
      raise exception 'Resultado oficial não pode ser alterado; somente anulado com justificativa.';
    end if;
  elsif old.status = 'anulada' then
    raise exception 'Etapa anulada não pode ser alterada.';
  end if;
  return new;
end $$;
create trigger lottery_stages_guard before update or delete on lottery_stages
  for each row execute function app.lottery_stages_guard();

create or replace function app.lottery_rounds_guard() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' then raise exception 'Rodadas não podem ser excluídas.'; end if;
  if new.seed_commitment is distinct from old.seed_commitment
     or (old.public_entropy is not null and new.public_entropy is distinct from old.public_entropy)
     or (old.seed_revealed is not null and new.seed_revealed is distinct from old.seed_revealed)
     or (old.order_doc is not null and new.order_doc is distinct from old.order_doc) then
    raise exception 'Dados lacrados da rodada não podem ser alterados.';
  end if;
  if old.status in ('concluida', 'anulada') and new.status <> old.status
     and not (old.status = 'concluida' and new.status = 'anulada') then
    raise exception 'Rodada encerrada não pode voltar a andamento.';
  end if;
  return new;
end $$;
create trigger lottery_rounds_guard before update or delete on lottery_rounds
  for each row execute function app.lottery_rounds_guard();

create or replace function app.lottery_campaign_guard() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' then raise exception 'Campanhas não podem ser excluídas.'; end if;
  if old.freeze_hash is not null and (new.freeze_hash is distinct from old.freeze_hash
      or new.freeze_doc is distinct from old.freeze_doc
      or new.order_method is distinct from old.order_method
      or new.rules_md is distinct from old.rules_md) then
    raise exception 'Lista, regras e método de ordem estão congelados.';
  end if;
  return new;
end $$;
create trigger lottery_campaign_guard before update or delete on lottery_campaigns
  for each row execute function app.lottery_campaign_guard();

create or replace function app.lottery_venues_guard() returns trigger
language plpgsql as $$
declare st text;
begin
  select status into st from lottery_campaigns where id = coalesce(new.campaign_id, old.campaign_id);
  if st in ('congelada', 'em_sorteio', 'concluida') then
    raise exception 'Ordem dos salões congelada.';
  end if;
  return coalesce(new, old);
end $$;
create trigger lottery_venues_guard before insert or update or delete on lottery_venues
  for each row execute function app.lottery_venues_guard();

-- ---------------------------------------------------------------------
-- Permissões
-- ---------------------------------------------------------------------
alter table lottery_campaigns enable row level security;
alter table lottery_periods enable row level security;
alter table lottery_venues enable row level security;
alter table lottery_rounds enable row level security;
alter table lottery_secrets enable row level security;
alter table lottery_entries enable row level security;
alter table lottery_stages enable row level security;
alter table lottery_simulations enable row level security;

grant select on lottery_campaigns, lottery_periods, lottery_venues, lottery_stages to newin_app;
grant select (campaign_id, round, status, seed_commitment, sealed_at, public_entropy, started_at, order_doc,
              concluded_at, seed_revealed, annulled_at, annul_reason) on lottery_rounds to newin_app;
create policy lc_read on lottery_campaigns for select to newin_app using (app.current_user_id() is not null);
create policy lp_read on lottery_periods for select to newin_app using (app.current_user_id() is not null);
create policy lv_read on lottery_venues for select to newin_app using (app.current_user_id() is not null);
create policy lr_read on lottery_rounds for select to newin_app using (app.current_user_id() is not null);
create policy ls_read on lottery_stages for select to newin_app using (app.current_user_id() is not null);

grant update (status, registration_deadline, draw_at, rules_md, rules_version, terms_md, terms_version,
              order_method, order_note, opened_at, opened_by, closed_at, closed_by) on lottery_campaigns to newin_app;
create policy lc_admin on lottery_campaigns for update to newin_app using (app.is_staff());
grant update (fixed_position) on lottery_venues to newin_app;
create policy lv_admin on lottery_venues for update to newin_app using (app.is_staff());

grant select, insert on lottery_entries to newin_app;
grant update (status, status_reason, status_changed_at, status_changed_by) on lottery_entries to newin_app;
create policy le_read on lottery_entries for select to newin_app
  using (app.is_staff() or unit_id in (select app.my_unit_ids()));
create policy le_insert on lottery_entries for insert to newin_app
  with check (
    (app.is_staff() and (origin = 'email' and launched_by = app.current_user_id() or origin = 'app' and applicant_user_id = app.current_user_id()))
    or (origin = 'app' and applicant_user_id = app.current_user_id() and unit_id in (select app.my_unit_ids()))
  );
create policy le_update on lottery_entries for update to newin_app
  using (app.is_staff() or unit_id in (select app.my_unit_ids()))
  with check (status_changed_by = app.current_user_id());

grant select, insert on lottery_simulations to newin_app;
create policy lsim_admin on lottery_simulations for all to newin_app using (app.is_staff()) with check (app.is_staff());
-- lottery_secrets: nenhuma permissão para newin_app.

-- ---------------------------------------------------------------------
-- Campanha inicial (dados do comunicado retificado pela administração)
-- ---------------------------------------------------------------------
with c as (
  insert into lottery_campaigns (code, title, registration_deadline_date, draw_date, source_note, rules_md, terms_md)
  values ('festas-2026', 'Sorteio dos salões — Natal e Ano Novo 2026/2027', date '2026-11-22', date '2026-11-23',
    'Comunicado da administração sobre os sorteios dos salões (retificado): inscrições até 22/11/2026 e sorteio em 23/11/2026. Regimento Interno V7, itens 20.14, 20.17, 20.25 e 20.26.',
$rules$
**Como funciona**

- O sorteio é feito **por apartamento (unidade)**, e não por pessoa. Várias pessoas do mesmo apartamento podem se inscrever, mas a unidade participa **uma única vez** em cada combinação de salão e período. *Fonte: Regimento, item 20.25 ("sorteio entre as unidades autônomas interessadas").*
- O apartamento pode se inscrever nos **três salões** (SKY Bar, Party In e Gourmet In) e nos **dois períodos** (Natal e Ano Novo). *Fonte: comunicado da administração.*
- Cada apartamento pode ganhar **apenas um salão em cada período**. Quem ganha um salão no Natal sai dos demais sorteios do Natal, mas continua concorrendo no Ano Novo, e vice-versa. *Fonte: comunicado; Regimento, item 20.14 (proíbe reserva simultânea de dois ou mais salões pela mesma unidade).*
- Cada reserva vale para **os dois dias** do período (24 e 25/12 ou 31/12 e 01/01), sem limpeza entre eles e com **uma única taxa** por período. *Fonte: comunicado.*
- Capacidades máximas: SKY Bar 30 pessoas, Party In 40 pessoas, Gourmet In 20 pessoas. *Fonte: Regimento, item 20.17.*
- Uso exclusivo de condôminos residentes ou de quem esteja no uso da unidade; vedado a condôminos com a unidade locada; reserva somente por maiores de idade. *Fonte: Regimento, itens 20.3, 20.5 e 20.6.*

**Transparência**

- Ao encerrar as inscrições, a lista é **congelada** e recebe uma "impressão digital" (código SHA-256) publicada antes do sorteio.
- Antes do sorteio é publicado o lacre de uma chave secreta. No início do sorteio é informado um número público. O resultado depende dos dois, de modo que ninguém consegue prevê-lo nem escolhê-lo.
- Depois do sorteio, a chave é revelada e qualquer morador pode refazer a conta no próprio celular, na página "Verificar".
$rules$,
$terms$
Declaro que:

1. Sou maior de idade e resido na unidade informada, ou estou no uso e fruição da unidade com autorização do proprietário (Regimento 20.3 e 20.6).
2. A unidade não está locada a terceiros enquanto eu, proprietário, não resido nela (Regimento 20.5).
3. Li e aceito as regras do sorteio, inclusive que a participação é por unidade e que cada unidade pode ganhar apenas um salão por período.
4. Se for sorteado, assumirei a responsabilidade pelo uso do espaço conforme o capítulo 20 do Regimento Interno (termo de responsabilidade, checklist, lista de convidados, capacidade máxima e regras de silêncio).
5. A taxa de reserva do período, quando definida, será lançada no boleto condominial da unidade.
$terms$)
  returning id
), p as (
  insert into lottery_periods (campaign_id, code, label, start_date, end_date, sort)
  select c.id, x.code, x.label, x.s, x.e, x.o from c,
    (values ('natal', 'Natal — 24 e 25/12/2026', date '2026-12-24', date '2026-12-25', 1),
            ('ano_novo', 'Ano Novo — 31/12/2026 e 01/01/2027', date '2026-12-31', date '2027-01-01', 2)) x(code, label, s, e, o)
  returning id
)
insert into lottery_venues (campaign_id, space_id)
select c.id, s.id from c, spaces s where s.code in ('skybar', 'partyin', 'gourmetin');
