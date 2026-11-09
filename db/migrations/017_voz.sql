-- =====================================================================
-- 017 — Voz da Corujinha: cache de áudios gerados, controle de uso
--        e registro da apresentação de boas-vindas.
-- =====================================================================

-- Áudios gerados ficam guardados: a mesma fala com a mesma configuração de voz
-- nunca é gerada duas vezes.
create table tts_cache (
  hash text primary key,
  provider text not null,
  voice text not null,
  model text not null,
  text text not null,
  mime text not null,
  audio bytea not null,
  bytes int not null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz not null default now(),
  hits int not null default 0
);

-- Cada geração nova (fora do cache) é registrada para os limites de uso.
create table tts_requests (
  id bigserial primary key,
  user_id uuid references users(id),
  hash text not null,
  ok boolean not null,
  chars int not null,
  created_at timestamptz not null default now()
);
create index tts_requests_user_idx on tts_requests (user_id, created_at desc);
create index tts_requests_time_idx on tts_requests (created_at desc);

-- Apresentação inicial: quem já viu
create table welcome_views (
  user_id uuid primary key references users(id) on delete cascade,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  views int not null default 1
);

-- Acesso somente pelo papel de serviço (rotas do servidor com autorização explícita)
alter table tts_cache enable row level security;
alter table tts_requests enable row level security;
alter table welcome_views enable row level security;
revoke all on tts_cache, tts_requests, welcome_views from newin_app;
