-- =====================================================================
-- 015 — Pergunte à Corujinha: base do Regimento e da Convenção,
--        busca em português e limite de perguntas por unidade.
-- =====================================================================
create extension if not exists unaccent;

create or replace function app.unaccent_i(text) returns text
language sql immutable parallel safe as $$ select public.unaccent('public.unaccent', $1) $$;

create table kb_meta (singleton boolean primary key default true check (singleton), version text not null, loaded_at timestamptz not null default now());

create table kb_chunks (
  id serial primary key,
  source text not null check (source in ('regimento', 'convencao')),
  ref text not null,
  title text,
  body text not null,
  tsv tsvector generated always as (
    setweight(to_tsvector('portuguese', app.unaccent_i(coalesce(title, ''))), 'B') ||
    setweight(to_tsvector('portuguese', app.unaccent_i(body)), 'A')
  ) stored
);
create index kb_chunks_tsv on kb_chunks using gin (tsv);

create table kb_questions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id),
  unit_id uuid references units(id),
  question text not null,
  answer text,
  refs jsonb not null default '[]'::jsonb,
  mode text not null check (mode in ('ia', 'busca')),
  created_at timestamptz not null default now()
);
create index kb_questions_unit_idx on kb_questions (unit_id, created_at desc);
create index kb_questions_user_idx on kb_questions (user_id, created_at desc);

alter table kb_chunks enable row level security;
alter table kb_questions enable row level security;
grant select on kb_chunks to newin_app;
create policy kb_read on kb_chunks for select to newin_app using (app.current_user_id() is not null);
grant select on kb_questions to newin_app;
create policy kbq_read on kb_questions for select to newin_app
  using (user_id = app.current_user_id() or app.is_staff());

-- Busca: combina a frase completa (peso maior) com qualquer termo relevante
create or replace function app.kb_search(q text, lim int default 12)
returns table (id int, source text, ref text, title text, body text, rank real)
language sql stable as $$
  with q1 as (select websearch_to_tsquery('portuguese', app.unaccent_i(q)) as tq),
  q2 as (
    select coalesce(to_tsquery('portuguese', string_agg(lexeme, ' | ')), q1.tq) as tq
    from q1, unnest(to_tsvector('portuguese', app.unaccent_i(q))) as t(lexeme, positions, weights)
    group by q1.tq
  )
  select c.id, c.source, c.ref, c.title, c.body,
         ((case when c.tsv @@ q1.tq then 1.0 else 0 end) + ts_rank_cd(c.tsv, q2.tq, 32))::real as rank
  from kb_chunks c, q1, q2
  where c.tsv @@ q1.tq or c.tsv @@ q2.tq
  order by rank desc
  limit lim
$$;
grant execute on function app.kb_search(text, int) to newin_app;
