-- Contagem de unidades inscritas por etapa (sem expor quais unidades antes do congelamento).
create or replace function app.lottery_counts(p_campaign uuid)
returns table (period_id uuid, space_id uuid, units bigint)
language sql stable security definer set search_path = public as $$
  select e.period_id, e.space_id, count(distinct e.unit_id)
  from lottery_entries e where e.campaign_id = p_campaign and e.status = 'ativa'
  group by 1, 2
$$;
revoke all on function app.lottery_counts(uuid) from public;
grant execute on function app.lottery_counts(uuid) to newin_app;
