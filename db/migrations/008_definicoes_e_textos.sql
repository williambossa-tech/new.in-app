-- =====================================================================
-- 008 — Definições da administração (09/11/2026, 18h30) e textos limpos
--       para os moradores (as fontes ficam visíveis só na administração).
-- =====================================================================

update parameters set status = 'definido',
  value = '{"texto": "Regimento Interno NEW.IN V7_v3.0 (29/05/2025) é a versão vigente."}'::jsonb,
  source = 'Confirmação da administração (William Bossa), 09/11/2026', updated_at = now(), blocks = null
where key = 'geral.regimento_versao';

update parameters set label = 'Adimplência e reservas', status = 'definido',
  value = '{"texto": "Não há restrição de reservas de áreas comuns por inadimplência. O registro de situação por unidade fica disponível apenas como informação."}'::jsonb,
  source = 'Orientação de decisão do STJ, adotada pela administração (William Bossa), 09/11/2026', updated_at = now(),
  description = 'O Regimento, item 27.3, menciona adimplência para o Be My Guest; a administração segue a orientação do STJ e não aplica a restrição.'
where key = 'geral.adimplencia_fonte';

update parameters set
  value = '{"texto": "Inscrição por apartamento, feita por morador residente ou por quem está no uso da unidade; vedada a condômino com unidade locada; maior de idade. Sem restrição por inadimplência."}'::jsonb,
  source = 'Regimento V7, itens 20.3, 20.5 e 20.6; orientação do STJ adotada pela administração, 09/11/2026', updated_at = now()
where key = 'sorteio.elegibilidade';

update parameters set label = 'Datas festivas × item 20.14 (reserva consecutiva)', status = 'definido',
  value = '{"texto": "Natal e Ano Novo são exceção ao item 20.14: pela característica das datas, a reserva abrange 2 dias seguidos."}'::jsonb,
  source = 'Definição da administração (William Bossa), 09/11/2026', updated_at = now()
where key = 'sorteio.divergencia_20_14';

update parameters set label = 'Desistência do sorteado', status = 'definido', blocks = null,
  value = '{"texto": "Na desistência do sorteado, o sistema realiza automaticamente novo sorteio entre os demais inscritos do mesmo salão e período (sem contar apartamentos que já têm salão no período). Sem inscritos disponíveis, o salão fica sem reserva pelo sorteio."}'::jsonb,
  source = 'Definição da administração (William Bossa), 09/11/2026', updated_at = now(),
  description = 'O novo sorteio usa uma chave reserva lacrada na conclusão do sorteio, revelada no encerramento da campanha.'
where key = 'sorteio.desistencia';

update parameters set label = 'Horário do sorteio (23/11/2026)',
  description = 'O sorteio é realizado online, no próprio aplicativo.'
where key = 'sorteio.horario_sorteio';

update parameters set status = 'definido',
  value = '{"texto": "Por unidade: no máximo 7 diárias em qualquer período de 30 dias."}'::jsonb,
  source = 'Definição da administração (William Bossa), 09/11/2026', updated_at = now(), blocks = null
where key = 'bmg.intervalo';

update parameters set label = 'Limites semanais do item 23.14', status = 'definido',
  value = '{"texto": "Contados por unidade, na semana de segunda a domingo."}'::jsonb,
  source = 'Definição da administração (William Bossa), 09/11/2026', updated_at = now()
where key = 'cw.limites_escopo';

update parameters set status = 'definido', value = '{"texto": "Segunda a domingo."}'::jsonb,
  source = 'Definição da administração (William Bossa), 09/11/2026', updated_at = now()
where key = 'cw.semana';

-- Programa do Skybar: fora do aplicativo, inclusive da administração, até liberação.
delete from parameters where key = 'geral.programa_skybar';

-- Textos da campanha para o morador (regras e termo, versão 2), sem notas de fonte.
update lottery_campaigns set
  rules_version = 2,
  terms_version = 2,
  rules_md = $rules$
- A participação é **por apartamento**. Moradores do mesmo apartamento compartilham a mesma inscrição.
- Você pode concorrer aos três salões — SKY Bar, Party In e Gourmet In — no **Natal** e no **Ano Novo**.
- Cada apartamento ganha **no máximo um salão por período**. Quem for sorteado no Natal continua concorrendo no Ano Novo.
- A reserva vale pelos **dois dias** do período, com uma única taxa.
- Se o sorteado desistir, um novo sorteio é feito automaticamente entre os demais inscritos.
$rules$,
  terms_md = $terms$
1. Moro no apartamento informado, ou estou no uso dele com autorização do proprietário, e sou maior de idade.
2. Conheço e aceito as regras do sorteio.
3. Se for sorteado, assumo a responsabilidade pelo uso do salão conforme o Regimento Interno, incluindo capacidade, lista de convidados e silêncio.
4. A taxa da reserva será lançada no boleto do condomínio.
$terms$,
  source_note = 'Comunicado da administração (retificado): inscrições até 22/11/2026 e sorteio online em 23/11/2026. Regimento Interno V7_v3.0, itens 20.3, 20.5, 20.6, 20.14 (exceção para datas festivas), 20.17, 20.25 e 20.26. Desistência: novo sorteio automático (definição da administração, 09/11/2026).'
where code = 'festas-2026' and freeze_hash is null;

-- Mensagens das regras do banco: curtas e diretas.
create or replace function app.lottery_entries_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare c lottery_campaigns; ok_member boolean;
begin
  if tg_op = 'DELETE' then
    raise exception 'Inscrições não podem ser excluídas.';
  end if;
  select * into c from lottery_campaigns where id = new.campaign_id for share;
  if tg_op = 'INSERT' then
    if new.origin = 'app' then
      if c.status <> 'inscricoes_abertas' then
        raise exception 'As inscrições não estão abertas.';
      end if;
      if now() > app.lottery_deadline(c) then
        raise exception 'As inscrições foram encerradas.';
      end if;
      select exists (
        select 1 from unit_memberships m join users u on u.id = m.user_id
        where m.user_id = new.applicant_user_id and m.unit_id = new.unit_id
          and m.status = 'ativo' and u.status = 'ativo' and m.resides
      ) into ok_member;
      if not ok_member then
        raise exception 'A inscrição é feita por moradores do apartamento.';
      end if;
    else
      if c.status not in ('inscricoes_abertas', 'inscricoes_encerradas') then
        raise exception 'A lista de inscrições já foi congelada.';
      end if;
      if new.email_received_at > app.lottery_deadline(c) then
        raise exception 'E-mail recebido após o prazo de inscrição.';
      end if;
    end if;
    if not exists (select 1 from lottery_venues v where v.campaign_id = new.campaign_id and v.space_id = new.space_id) then
      raise exception 'Salão indisponível nesta campanha.';
    end if;
    if not exists (select 1 from lottery_periods p where p.id = new.period_id and p.campaign_id = new.campaign_id) then
      raise exception 'Período indisponível nesta campanha.';
    end if;
  else
    if c.status not in ('inscricoes_abertas', 'inscricoes_encerradas') then
      raise exception 'A lista de inscrições está congelada.';
    end if;
    if (new.campaign_id, new.unit_id, new.period_id, new.space_id, new.applicant_name, new.contact, new.origin, new.created_at)
       is distinct from
       (old.campaign_id, old.unit_id, old.period_id, old.space_id, old.applicant_name, old.contact, old.origin, old.created_at) then
      raise exception 'Somente a situação da inscrição pode ser alterada.';
    end if;
    if old.status <> 'ativa' then
      raise exception 'Esta inscrição já foi cancelada.';
    end if;
  end if;
  return new;
end $$;
