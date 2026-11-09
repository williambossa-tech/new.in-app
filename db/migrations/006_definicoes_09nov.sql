-- =====================================================================
-- 006 — Definições informadas pela administração em 09/11/2026.
-- =====================================================================

update parameters set status = 'definido', value = '{"texto": "CPF"}'::jsonb,
  source = 'Definição da administração (William Bossa), 09/11/2026', updated_at = now()
where key = 'cw.identificador_convidado';

update parameters set status = 'definido',
  value = '{"texto": "Por unidade: até 7 dias de reserva a cada 30 dias."}'::jsonb,
  source = 'Definição da administração (William Bossa), 09/11/2026', updated_at = now()
where key = 'bmg.intervalo';

update parameters set
  label = 'Limites semanais (23.14): por usuário ou por unidade; início e fim da semana',
  description = '23.14 define uso indevido: atendimento em mais de 3 dias por semana; mais de 10 convidados distintos na semana. A ação ao atingir o limite já foi definida (bloqueio com pedido de exceção).'
where key = 'cw.limites_escopo';

insert into parameters (key, module, label, description, value, status, source, updated_at) values
('cw.confirmacao', 'coworking', 'Confirmação das reservas de coworking',
 null, '{"texto": "Confirmação automática quando todas as regras são atendidas."}'::jsonb, 'definido',
 'Definição da administração (William Bossa), 09/11/2026', now()),
('cw.limites_acao', 'coworking', 'Ação ao atingir os limites do item 23.14',
 null, '{"texto": "Bloqueia a reserva e abre pedido de excepcionalidade à administração; se aprovado, libera o cadastro da reserva."}'::jsonb, 'definido',
 'Definição da administração (William Bossa), 09/11/2026', now()),
('sorteio.reservas_canal_atual', 'sorteio', 'Reservas prévias dos salões nas datas festivas',
 null, '{"texto": "Não há. As datas 24–25/12 e 31/12–01/01 estão bloqueadas no aplicativo da administradora."}'::jsonb, 'definido',
 'Definição da administração (William Bossa), 09/11/2026', now()),
('geral.programa_skybar', 'geral', 'Programa Experimental de Reserva Administrativa do Skybar',
 'Fica oculto no aplicativo; só funciona depois de liberado pelo desenvolvedor.', '{"texto": "Oculto até liberação pelo desenvolvedor."}'::jsonb, 'definido',
 'Definição da administração (William Bossa), 09/11/2026', now())
on conflict (key) do nothing;
