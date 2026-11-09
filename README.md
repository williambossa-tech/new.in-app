# NEW.IN Comunidade

Aplicativo web da comunidade do Condomínio NEW.IN (Curitiba/PR): eventos coletivos, sorteio dos salões nas festas de fim de ano, reservas de espaços e cobrança do Be My Guest.

## Situação por etapa

| Etapa | Situação |
|---|---|
| 1. Autenticação, unidades (192, conforme a Convenção), usuários, perfis, espaços, parâmetros e trilha de auditoria | Pronta |
| 4. Campanha de inscrições e sorteio dos salões (Natal/Ano Novo 2026/2027) | Pronta |
| 2. Be My Guest e coworking | Próxima (telas informativas com as regras e pendências) |
| 3. Cobranças e relatórios | Próxima |

## Arquitetura

- **Next.js 15 + TypeScript + Tailwind**, PostgreSQL (Railway).
- **Políticas de acesso no banco (RLS):** cada requisição abre uma transação, informa ao banco o usuário (`app.user_id`) e troca para o papel `newin_app`, sujeito às políticas. Moradores só leem dados da própria unidade; a senha e a chave secreta do sorteio nunca são legíveis por esse papel.
- **Regras no banco, não só na tela:** inscrição única por unidade × salão × período (índice único), prazo e congelamento por gatilho, resultados imutáveis (só anuláveis com justificativa), reservas sem sobreposição (restrição de exclusão), trilha de auditoria encadeada por SHA-256 e sem alteração/exclusão.
- **Ambientes separados:** cada banco é marcado como `producao` ou `demonstracao` na primeira migração. O servidor se recusa a subir se `APP_ENV` não bater com a marca. Dados fictícios só são criados no banco de demonstração.

## Sorteio: como garantir e conferir

1. Encerradas as inscrições, a lista é **congelada** e recebe uma impressão digital (SHA-256 do documento canônico).
2. Ao congelar, o servidor gera uma **chave secreta** de 256 bits e publica só o **lacre** (SHA-256 da chave).
3. No início do sorteio, a administração informa um **número público**, dito pelos presentes.
4. Cada etapa sorteia uma posição com `HMAC-SHA256(chave, número público | campanha | rodada | período | salão | contador)`, usando amostragem por rejeição para que a escolha seja uniforme.
5. O vencedor sai das etapas seguintes do mesmo período. Isso acontece na mesma transação, com a campanha travada: não há execução dupla, e clicar duas vezes ou atualizar a página devolve o resultado já gravado.
6. Ao concluir, a chave é revelada. A página **Sorteios → Verificar** refaz tudo no navegador do morador com o mesmo código (`src/lib/lottery/core.ts`).
7. **Desistência:** quando o sorteado desiste (pelo próprio aplicativo ou registrada pela administração), um novo sorteio entre os demais inscritos é feito na hora. Ficam de fora os apartamentos que já têm salão no período e quem já desistiu daquele salão. Esse novo sorteio usa uma chave reserva, lacrada na conclusão e revelada quando a administração encerra o período de desistências.
8. Uma anulação não apaga nada: exige justificativa, fica no histórico e lacra uma nova chave.
9. A **ata em PDF** traz fontes, lista congelada, lacre, número público, elegíveis de cada etapa, posição sorteada, operador, horários, chave revelada e o último hash da trilha de auditoria, com espaço para assinaturas.

## Rodar localmente

```bash
npm install
export DATABASE_URL=postgres://postgres@localhost/newin APP_ENV=demonstracao
npm run build && npm start      # aplica migrações, cria admin inicial (se configurado) e popula a demonstração
npm test                        # usa TEST_DATABASE_URL (padrão: postgres://postgres@localhost/newin_test)
```

## Variáveis de ambiente

| Variável | Uso |
|---|---|
| `DATABASE_URL` | Conexão PostgreSQL (no Railway: `${{Postgres.DATABASE_URL}}`) |
| `APP_ENV` | `producao` ou `demonstracao` |
| `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_NAME`, `BOOTSTRAP_ADMIN_PASSWORD` | Primeiro administrador, criado só se não houver nenhum. A senha é provisória e precisa ser trocada no primeiro acesso. Depois de entrar, remova `BOOTSTRAP_ADMIN_PASSWORD`. |
| `OPENAI_API_KEY` (ou `ANTHROPIC_API_KEY`) | Respostas da Corujinha com IA e voz pela OpenAI |
| `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID` | Voz da Corujinha pela ElevenLabs (opcional; tem prioridade quando preenchida) |
| `TTS_*`, `OPENAI_TTS_*`, `ELEVENLABS_*` | Ajustes da identidade vocal — veja `.env.example` e `docs/corujinha.md` |

## Implantação no Railway

Projeto `newin-reservas` com dois ambientes, **production** e **demonstracao**. Cada ambiente tem o próprio serviço PostgreSQL e o serviço web ligado a este repositório (branch `main`). Comandos em `railway.json`; verificação de saúde em `/api/saude`.

## Checklist para a operação oficial do sorteio

- [ ] Confirmar que o Regimento V7_v3.0 é a versão vigente
- [ ] Definir o horário de encerramento das inscrições (22/11) e o horário/local do sorteio (23/11)
- [ ] Definir e divulgar o método de ordem dos salões (fixa ou sorteada), com a fonte
- [ ] Registrar a regra da campanha para o item 20.14 × período de dois dias
- [ ] Confirmar quem pode se inscrever (adimplência exigida ou não)
- [ ] Definir a taxa por período, horários de entrega/devolução, prazo de aceite do vencedor e tratamento de desistências
- [ ] Aprovar os cadastros dos moradores e lançar as inscrições recebidas por e-mail
- [ ] Encerrar as inscrições, congelar a lista e **divulgar a impressão digital e o lacre antes do sorteio**
- [ ] No sorteio: projetar o telão, colher o número público, sortear etapa por etapa, concluir e imprimir a ata para assinatura
