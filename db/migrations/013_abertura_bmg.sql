-- Abertura do Be My Guest aos moradores (definição da administração em 09/11/2026)
update parameters set status = 'definido',
  value = '{"horas": 48, "texto": "48 horas antes da entrada (18h)"}'::jsonb,
  source = 'Definição da administração (William Bossa), 09/11/2026', updated_at = now(), blocks = null
where key = 'bmg.antecedencia';

update parameters set status = 'definido',
  value = '{"ativo": true, "texto": "Abertas"}'::jsonb,
  source = 'Definição da administração (William Bossa), 09/11/2026', updated_at = now()
where key = 'bmg.abertura';
