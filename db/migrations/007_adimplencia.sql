-- Definição da administração em 09/11/2026: adimplência não é considerada, por ora, para reservas.
update parameters set status = 'definido',
  value = '{"texto": "Não considerada neste momento para fins de reservas (o cadastro de situação por unidade segue disponível, sem bloquear reservas)."}'::jsonb,
  source = 'Definição da administração (William Bossa), 09/11/2026', updated_at = now(),
  description = 'Atenção: o Regimento, item 27.3, restringe o Be My Guest a proprietários ou locatários adimplentes. A decisão atual deixa essa exigência suspensa até nova definição.',
  blocks = null
where key = 'geral.adimplencia_fonte';

update parameters set status = 'definido',
  value = '{"texto": "Inscrição por unidade, por morador residente ou que esteja no uso da unidade; vedada a condômino com unidade locada; maior de idade (Regimento 20.3, 20.5 e 20.6). Adimplência não é exigida neste momento."}'::jsonb,
  source = 'Regimento V7, itens 20.3, 20.5 e 20.6; definição da administração (William Bossa), 09/11/2026', updated_at = now()
where key = 'sorteio.elegibilidade';
