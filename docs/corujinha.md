# Corujinha 3D e identidade vocal

A Corujinha é a personagem oficial do NEW.IN Comunidade: modelada em 3D (three.js) a partir da mascote roxa do condomínio, com voz feminina única, gerada por um serviço de voz neural e sincronizada com o bico.

## O que existe

| Parte | Onde |
|---|---|
| Personagem 3D (corpo, olhos, bico articulado, asas, cachecol, penas) e estados `idle`, `greeting`, `talking`, `happy`, `thinking`, `listening`, `goodbye` | `src/components/owl3d/OwlRig.ts` |
| Sincronização do bico com o áudio real (visemas: fechado, A, E/I/S, O/U) | `src/components/owl3d/lipsync.ts` |
| Reprodutor de falas (cache no navegador, desbloqueio de áudio no celular) | `src/components/owl3d/speech.ts` |
| Componente reutilizável `CondominioOwl` | `src/components/CondominioOwl.tsx` |
| Apresentação de boas-vindas (primeiro acesso; “Rever a apresentação” em Meu cadastro) | `src/app/boas-vindas/` |
| Corujinha 3D em “Pergunte à Corujinha” (escuta, pensa e lê as respostas com 🔊 Ouvir) | `src/app/(app)/corujinha/` |
| Configuração central da voz | `src/lib/voice/config.ts` |
| Falas registradas (texto + emoção + estado) | `src/lib/voice/falas.ts` |
| Camada de voz (OpenAI ou ElevenLabs), cache, limites, logs | `src/lib/voice/service.ts` |
| Endpoints | `GET /api/voz/fala/:id` (fala registrada) · `POST /api/voz` (`{perguntaId}` do próprio morador; `{texto}` só administração) |
| Banco | `db/migrations/017_voz.sql` (`tts_cache`, `tts_requests`, `welcome_views`) |

## Configurar a voz

Cadastre as variáveis no Railway (Variables). As chaves ficam só no servidor; o navegador nunca as recebe. Modelo completo em `.env.example`.

**OpenAI (já funciona com a chave usada nas respostas da Corujinha)**

| Variável | Valor |
|---|---|
| `OPENAI_API_KEY` | chave da OpenAI |
| `OPENAI_TTS_VOICE` | voz fixa da personagem (padrão `coral`) |
| `OPENAI_TTS_MODEL` | padrão `gpt-4o-mini-tts` |

> A OpenAI desliga os modelos de voz atuais em **06/01/2027**. Antes disso, clique em **Preparar apresentação** (Pergunte à Corujinha › painel da administração): as falas ficam guardadas no banco e continuam tocando. Para falas novas depois dessa data, use a ElevenLabs.

**ElevenLabs (recomendada para a voz definitiva)**

1. Crie a conta em elevenlabs.io e escolha (Voice Library) ou crie (Voice Design) uma voz feminina, doce e levemente aguda, em português do Brasil.
2. Copie o *Voice ID* e gere uma API Key.
3. Preencha `ELEVENLABS_API_KEY` e `ELEVENLABS_VOICE_ID`. Com as duas, o app passa a usar a ElevenLabs automaticamente (`TTS_PROVIDER=auto`).

**Ajustes comuns a qualquer provedor:** `TTS_TOM` (tom da personagem na reprodução: 1 = original, padrão 1,12 = mais aguda e infantil, sem efeito metálico), `TTS_SPEED` (0,7–1,3; padrão 0,9 para compensar o tom), `TTS_EXPRESSIVIDADE` (0–1), `TTS_VOLUME` (0–1), `TTS_ESTILO` (descrição da personagem). Qualquer mudança na configuração gera áudios novos — nunca mistura vozes.

## Como funciona

- Cada fala é identificada pelo texto + configuração vocal (hash). Se já existe, vem do banco; se não, é gerada uma única vez e guardada.
- Limites: 20 gerações novas por usuário por hora e 400 por dia no total (áudios já guardados não contam). Texto de até 800 caracteres.
- Sem voz configurada ou se o provedor falhar, a apresentação continua com legenda e a Corujinha não mexe o bico (sem animação de fala falsa).
- Se o navegador bloquear o som automático, aparece **“Ouvir a Corujinha”**; o acesso ao app nunca fica bloqueado.
- Sem WebGL, aparece a ilustração da Corujinha. O 3D só é carregado nas telas que o usam e pausa fora da tela.
- Logs registram provedor, tamanho e o início do hash — nunca o texto completo das respostas nem as chaves.

## Usar em outras telas

```tsx
import { CondominioOwl, type CondominioOwlHandle } from "@/components/CondominioOwl";

// Declarativo: fala registrada ao abrir
<CondominioOwl falaId="teste-voz" autoPlay estado="greeting" className="h-64 w-64" />

// Imperativo: sequência de falas
const owl = useRef<CondominioOwlHandle>(null);
await owl.current?.speak({ falaId: "boas-vindas-1", estado: "greeting" });
```

Propriedades: `texto`, `estado`, `expressao` (`neutral`, `happy`, `surprised`, `sad`, `curious`), `falaId`, `audio`, `velocidade`, `volume`, `vozAtiva`, `autoPlay`, `repetir`, `entrada`, `qualidade` (`alta`/`leve`).
Novas falas: acrescente em `src/lib/voice/falas.ts` (texto, emoção, estado).

## Testar

1. Admin › **Pergunte à Corujinha** › painel: **Testar voz** (toca a voz) e **Preparar apresentação**.
2. **Meu cadastro › Rever a apresentação da Corujinha** (ou `/boas-vindas`): confira entrada, aceno, legenda acompanhando a fala, bico, indicador de áudio, Repetir, Narração ligada/desligada e Continuar.
3. No celular (Android e iPhone): toque em “Ouvir a Corujinha” se o aparelho pedir.
4. Automatizados: `npm test` (voz, cache, limites, sincronização do bico, Corujinha com IA).

## Trocar por um modelo 3D profissional

O `OwlRig` expõe `setState`, `setExpression`, `setMouth`, `setLook`, `setEntrance`, `resize`, `start`, `dispose`. Um modelo `.glb` feito por artista (com *morph targets* do bico e animações) pode substituir a modelagem em código implementando a mesma interface, sem mudar o restante do app.
