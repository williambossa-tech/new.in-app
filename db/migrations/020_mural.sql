-- =====================================================================
-- 020 — Mural de avisos do Síndico e do Conselho
-- Publicam: síndico (como "Síndico"), conselheiros (como "Conselho") e a
-- administração (como "Administração"). Todos os moradores ativos leem.
-- =====================================================================

create table board_posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references users(id),
  author_name text not null,
  author_role text not null check (author_role in ('sindico', 'conselho', 'administracao')),
  category text not null check (category in ('comunicado', 'importante', 'assembleia', 'manutencao', 'evento', 'prestacao_contas')),
  title text not null check (length(title) between 3 and 140),
  body text not null check (length(body) between 3 and 8000),
  pinned boolean not null default false,
  published_at timestamptz not null default now(),
  expires_on date,
  attachment_name text,
  attachment_mime text check (attachment_mime is null or attachment_mime in ('application/pdf', 'image/jpeg', 'image/png', 'image/webp')),
  attachment_size int,
  attachment bytea,
  status text not null default 'publicado' check (status in ('publicado', 'arquivado')),
  archived_reason text,
  archived_by uuid references users(id),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references users(id),
  check (attachment is null or (attachment_size <= 5 * 1024 * 1024 and attachment_name is not null and attachment_mime is not null)),
  check (status = 'publicado' or archived_reason is not null)
);
create index board_posts_list_idx on board_posts (status, pinned desc, published_at desc);

create table board_reads (
  post_id uuid not null references board_posts(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

alter table board_posts enable row level security;
alter table board_reads enable row level security;
-- o arquivo anexo só é entregue pela rota do servidor (com verificação)
grant select (id, author_id, author_name, author_role, category, title, body, pinned, published_at, expires_on,
              attachment_name, attachment_mime, attachment_size, status, archived_reason, archived_at, created_at, updated_at)
  on board_posts to newin_app;
create policy board_posts_read on board_posts for select to newin_app using (
  app.current_user_id() is not null
  and (status = 'publicado' or app.is_staff() or author_id = app.current_user_id()));
grant select, insert on board_reads to newin_app;
create policy board_reads_own on board_reads for select to newin_app using (user_id = app.current_user_id() or app.is_staff());
create policy board_reads_mark on board_reads for insert to newin_app with check (user_id = app.current_user_id());
