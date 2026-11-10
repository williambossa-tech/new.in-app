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

## Mural de avisos
- Publicam: Síndico (como “Síndico”), conselheiros (como “Conselho”) e a Administração. Moradores leem.
- Aviso: título, texto (negrito e listas), categoria, fixar no topo, “mostrar até”, anexo (PDF ou imagem até 5 MB, guardado no banco e entregue só a usuários logados) e opção de avisar todos no sino.
- Marcação “Novo” por pessoa; autor e administração veem quantas pessoas e apartamentos leram.
- Editar: o autor, outro usuário com o mesmo perfil de publicação, ou a Administração. Arquivar com motivo. Tudo na auditoria.

## Apresentação antes do login
`/intro` aparece antes da tela de entrar: “Ouvir a Corujinha”, “Pular” (só desta vez) ou “Não mostrar mais” (cookie de 1 ano). Quem já viu neste aparelho não vê de novo a apresentação após o login.

## Corujinhas temáticas
Quadra Poliesportiva: uniforme da seleção (amarelo, gola e punhos verdes, calção azul, “BRASIL 10”; sem escudos) fazendo embaixadinha de cabeça. Quadra de Areia: viseira e raquete de beach tennis. Piscina: touca, óculos e boia. Ao tocar, ela fala as regras.
