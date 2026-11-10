# Quadras, Piscina — Convidados e perfis

## Regras do Regimento (aplicadas pelo sistema)
| Regra | Fonte | Onde |
|---|---|---|
| Quadras das 08h00 às 22h00 | item 25.7 | serviço e banco (`app.booking_court_check`) |
| Visitantes só com o morador presente; ciência registrada | itens 25.2 e 25.6 | aceite `quadras` v1 em `term_acceptances` |
| Jogo amistoso/organizado com mais de 4 visitantes → autorização prévia | item 25.3 | `court_details.approval = 'pendente'` + gatilho no banco |
| Programação semanal/mensal pela administração | item 25.4 | `court_schedules` (programação ou bloqueio, com recorrência) |
| Piscina das 05h00 às 24h00; até 2 convidados por vez por unidade | item 21.1 | aviso + aceite `piscina` v1 (sem bloqueio por ocupação) |

## Parâmetros da administração (não previstos no Regimento)
Em branco = **pendente** e **não aplicado** (nenhum limite inventado). Configuração em Administração › Quadras › Configuração, por quadra:
confirmação (pendente = a administração confirma cada agendamento), duração fixa, antecedência mínima e máxima, máximo por unidade (dia/semana/mês), intervalo entre agendamentos, tempo contínuo, prioridades (informativo), prazo de cancelamento e lista de modalidades.

Piscina (Administração › Piscina › Configuração): limite diário de cadastros (opcional, desativado; não é regra do Regimento), documento do convidado (não solicitar / opcional / obrigatório) e retenção dos dados (pendente).

## O que NÃO existe (por decisão)
Reserva de horário da piscina, controle de acesso, entrada/saída, check-in, presença ou ocupação, integração com portaria e cobrança.

## Perfis
| Perfil | Pode |
|---|---|
| Morador | usar o app, agendar, cadastrar convidados, ver só a própria unidade |
| Administração | operar: aprovar, confirmar, cancelar, configurar, programar, corrigir |
| Síndico / Conselheiro | ver tudo o que a administração vê (relatórios, auditoria, exportações), sem alterar |
| Portaria | operação do Be My Guest |
| Desenvolvedor | painel técnico (IA e voz); concedido por `DESENVOLVEDOR_EMAILS` (ou o e-mail do administrador inicial), nunca pelo app |

No banco: `app.is_staff()` = visualização (admin, síndico, conselheiro); toda regra de escrita usa `app.is_admin()` (migração 019).

## Avisos no app
Sino no topo (`notifications`): agendamento solicitado/confirmado, pendente de aprovação, aprovação, rejeição, cancelamento, alteração de horário; cadastro e cancelamento de convidados da piscina. A administração recebe os pedidos pendentes.

## Corujinha das regras
Tocar na coruja de cada módulo (Be My Guest, Coworking, Quadras, Piscina, Sorteio) faz a Corujinha falar as regras do espaço, com o texto em balão (`REGRAS` em `src/lib/voice/falas.ts`).
