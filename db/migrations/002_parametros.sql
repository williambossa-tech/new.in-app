-- =====================================================================
-- 002 — Parâmetros e pendências conhecidas (nenhum valor inventado).
-- =====================================================================

insert into parameters (key, module, label, description, value, status, source, blocks) values
-- Geral
('geral.regimento_versao', 'geral', 'Versão vigente do Regimento Interno',
 'Arquivo recebido: "REGIMENTO INTERNO - NEW.IN - V7_v3.0 20250529". Confirmar que é a versão vigente.',
 null, 'pendente', null, 'Ativação oficial de todos os módulos'),
('geral.adimplencia_fonte', 'geral', 'Fonte e periodicidade da situação de adimplência',
 'Quem informa a adimplência das unidades (administradora/lista/atualização manual) e com que frequência.',
 null, 'pendente', null, 'Reservas Be My Guest (item 27.3)'),

-- Sorteio de salões
('sorteio.horario_encerramento', 'sorteio', 'Horário de encerramento das inscrições (22/11/2026)',
 'O comunicado retificado define a data (22/11/2026), mas não o horário. Enquanto pendente, as inscrições pelo aplicativo encerram ao final do dia 22/11 (23h59) ou antes, se a administração encerrar manualmente.',
 null, 'pendente', null, null),
('sorteio.horario_sorteio', 'sorteio', 'Horário e local do sorteio (23/11/2026)',
 'Data definida pelo comunicado retificado; horário e local não informados.',
 null, 'pendente', null, null),
('sorteio.ordem_saloes', 'sorteio', 'Ordem de sorteio dos salões',
 'A ordem influencia o resultado (o vencedor sai das etapas seguintes do mesmo período). Definir ordem fixa divulgada previamente ou sorteio da própria ordem.',
 null, 'pendente', null, 'Congelamento da lista e sorteio oficial'),
('sorteio.taxa_periodo', 'sorteio', 'Taxa de reserva por período festivo (2 dias)',
 'Comunicado: uma única taxa por período de dois dias. Regimento 20.7: valor fixado provisoriamente em assembleia, cobrado no boleto seguinte.',
 null, 'pendente', null, 'Cobrança das reservas geradas pelo sorteio'),
('sorteio.horarios_entrega', 'sorteio', 'Horários de entrega e devolução dos salões nos períodos festivos',
 'Regimento V7: funcionamento das 10h às 22h, permanência até 02h (20.1); entrega das chaves a partir das 10h (20.12). Definir horário de devolução ao fim de cada período de dois dias.',
 null, 'pendente', null, null),
('sorteio.divergencia_20_14', 'sorteio', 'Item 20.14 × período de dois dias',
 'O item 20.14 proíbe a reserva consecutiva do mesmo espaço; o comunicado estabelece períodos festivos de dois dias consecutivos. Registrar a regra específica da campanha.',
 null, 'pendente', null, null),
('sorteio.elegibilidade', 'sorteio', 'Quem pode se inscrever (por unidade)',
 'Regimento: uso exclusivo por condôminos residentes ou quem esteja no uso da unidade (20.3); vedado a condôminos com unidade locada (20.5); reserva por maiores de idade (20.6). Confirmar se a adimplência também é exigida.',
 null, 'pendente', null, null),
('sorteio.desistencia', 'sorteio', 'Desistência, suplência, troca de salão e ausência de interessados',
 'Não definidos no comunicado nem no Regimento. O sistema não convoca suplentes nem refaz etapas por conta própria.',
 null, 'pendente', null, 'Convocação de suplente'),
('sorteio.prazo_aceite', 'sorteio', 'Prazo para o vencedor confirmar a reserva',
 null, null, 'pendente', null, null),

-- Be My Guest
('bmg.quartos', 'bmg', 'Quantidade e identificação dos quartos',
 'Convenção, art. 4º: 2 suítes com banho no 2º pavimento. Confirmar identificação (número/nome).',
 null, 'pendente', null, null),
('bmg.antecedencia', 'bmg', 'Antecedência mínima de solicitação', 'Regimento 27.7(a) exige, mas não fixa o prazo.', null, 'pendente', null, 'Reservas Be My Guest'),
('bmg.intervalo', 'bmg', 'Intervalo mínimo entre reservas sucessivas', 'Regimento 27.7(d) exige, mas não fixa o prazo.', null, 'pendente', null, 'Reservas Be My Guest'),
('bmg.cancelamento', 'bmg', 'Política de cancelamento', null, null, 'pendente', null, null),
('bmg.ausencia', 'bmg', 'Política de ausência (não comparecimento)', null, null, 'pendente', null, null),
('bmg.taxas', 'bmg', 'Taxa de uso, taxa de limpeza e fundo de manutenção (valores, bases e vigência)',
 'Regimento 27.17 a 27.20 e 33: dependem de deliberação em assembleia.', null, 'pendente', null, 'Cobrança Be My Guest'),
('bmg.criterio_competencia', 'bmg', 'Critério de competência do fechamento', 'Ex.: data de saída, data de entrada ou rateio por diária.', null, 'pendente', null, 'Fechamento de cobrança'),

-- Coworking
('cw.horarios', 'coworking', 'Horários disponíveis (sala e mini sala)', null, null, 'pendente', null, 'Reservas de coworking'),
('cw.duracao', 'coworking', 'Duração mínima e máxima', null, null, 'pendente', null, null),
('cw.intervalo', 'coworking', 'Intervalo entre reservas', null, null, 'pendente', null, null),
('cw.antecedencia', 'coworking', 'Antecedência', null, null, 'pendente', null, null),
('cw.capacidades', 'coworking', 'Capacidade de cada ambiente', null, null, 'pendente', null, null),
('cw.cancelamento', 'coworking', 'Política de cancelamento', null, null, 'pendente', null, null),
('cw.cobranca', 'coworking', 'Eventual cobrança', null, null, 'pendente', null, null),
('cw.mini_convidados', 'coworking', 'Mini sala pode receber convidados?', 'A mini sala não aparece individualizada no Regimento.', null, 'pendente', null, null),
('cw.limites_escopo', 'coworking', 'Limites semanais (23.14): por usuário ou por unidade; bloquear ou alertar',
 '23.14 define uso indevido: atendimento em mais de 3 dias por semana; mais de 10 convidados distintos na semana.', null, 'pendente', null, null),
('cw.semana', 'coworking', 'Início e término da semana para os limites', null, null, 'pendente', null, null),
('cw.identificador_convidado', 'coworking', 'Identificador dos convidados para contagem de distintos', 'Documento ou telefone.', null, 'pendente', null, null);
