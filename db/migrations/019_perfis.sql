-- =====================================================================
-- 019 — Perfis: Síndico e Conselheiro (visualização) e Desenvolvedor.
--
-- * admin (Administração): opera o sistema (aprova, cadastra, cancela…)
-- * sindico e conselheiro: veem tudo o que a administração vê, sem alterar
-- * desenvolvedor: configurações técnicas (IA, voz); concedido só por
--   variável de ambiente (DESENVOLVEDOR_EMAILS), nunca pelo app
--
-- app.is_staff() passa a significar "pode visualizar como administração";
-- toda regra de escrita usa app.is_admin().
-- =====================================================================

alter table user_roles drop constraint user_roles_role_check;
alter table user_roles add constraint user_roles_role_check
  check (role in ('morador', 'admin', 'portaria', 'administradora', 'sindico', 'conselheiro', 'desenvolvedor'));

create or replace function app.is_admin() returns boolean
  language sql stable security definer set search_path = public as $$
  select app.has_role('admin')
$$;
grant execute on function app.is_admin() to newin_app;

-- Regras de escrita: trocar is_staff() por is_admin() (antes de ampliar is_staff)
do $$
declare r record; q text; c text;
begin
  for r in select schemaname, tablename, policyname, cmd, qual, with_check from pg_policies
           where schemaname = 'public' and cmd <> 'SELECT'
             and (coalesce(qual, '') like '%is_staff()%' or coalesce(with_check, '') like '%is_staff()%')
  loop
    q := replace(r.qual, 'app.is_staff()', 'app.is_admin()');
    c := replace(r.with_check, 'app.is_staff()', 'app.is_admin()');
    if r.cmd = 'INSERT' then
      execute format('alter policy %I on %I.%I with check (%s)', r.policyname, r.schemaname, r.tablename, c);
    elsif r.cmd = 'DELETE' then
      execute format('alter policy %I on %I.%I using (%s)', r.policyname, r.schemaname, r.tablename, q);
    elsif c is null then
      execute format('alter policy %I on %I.%I using (%s)', r.policyname, r.schemaname, r.tablename, q);
    else
      execute format('alter policy %I on %I.%I using (%s) with check (%s)', r.policyname, r.schemaname, r.tablename, q, c);
    end if;
  end loop;
end $$;

-- Proteção do cadastro de usuários: só a administração altera situação/perfis
do $$
declare def text;
begin
  select pg_get_functiondef('app.users_guard'::regproc) into def;
  execute replace(def, 'app.is_staff()', 'app.is_admin()');
end $$;

-- Visualização como administração: admin, síndico e conselheiros
create or replace function app.is_staff() returns boolean
  language sql stable security definer set search_path = public as $$
  select app.has_role('admin') or app.has_role('sindico') or app.has_role('conselheiro')
$$;
