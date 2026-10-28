# vue-llm

[English](./README.md) · [Русский](./README.ru.md) · [简体中文](./README.zh-CN.md) · **Português** · [Español](./README.es.md) · [日本語](./README.ja.md)

[![npm version](https://img.shields.io/npm/v/vue-llm.svg)](https://www.npmjs.com/package/vue-llm)
[![npm downloads](https://img.shields.io/npm/dm/vue-llm.svg)](https://www.npmjs.com/package/vue-llm)
[![CI](https://github.com/dadashi44/vue-llm/actions/workflows/ci.yml/badge.svg)](https://github.com/dadashi44/vue-llm/actions/workflows/ci.yml)
[![license](https://img.shields.io/npm/l/vue-llm.svg)](./LICENSE)

**vue-llm** é o AI SDK para Vue e Nuxt: `useChat` com streaming, chamada de ferramentas, Generative UI e modelos no navegador para OpenAI, Anthropic, Gemini, Ollama e WebGPU.

`useChat()` com streaming, chamada de ferramentas e suporte a vários provedores — em 10 linhas de código.

**Documentação:** https://vue-llm.js.org/pt/ · **[Experimente no navegador](https://vue-llm.js.org/pt/playground)** — sem precisar de API key

## Recursos

- **`useChat()`** — composable reativo com streaming, abort e regenerate
- **Vários provedores** — OpenAI, Anthropic, Gemini e Ollama prontos para usar
- **Modelos no navegador** — rode Llama, Qwen ou SmolLM em WebGPU com `createWebLLM`, sem servidor nem API key
- **Generative UI** — renderize chamadas de ferramentas como seus componentes Vue com `<MessageParts>`, argumentos via streaming e human-in-the-loop
- **Chamada de ferramentas** — `defineTool` com `execute`, `onToolCall`, `addToolResult`
- **Anexos** — imagens, PDFs, áudio e arquivos de texto, convertidos para cada provedor
- **Persistência** — restaure o histórico do chat do localStorage ou de qualquer backend customizado
- **Resiliência** — retentativas com backoff exponencial, rate limiting no cliente e no servidor
- **Templates de prompt** — `{{variables}}` com inferência de tipos, templates de chat, `usePrompt` reativo
- **Qualquer backend** — ferramentas no servidor com `createLLMHandler`, `createSSEProvider` para a sua própria API SSE
- **Streaming** — parser de SSE, deltas de texto/raciocínio/chamadas de ferramentas
- **Segurança** — a proteção `dangerouslyAllowBrowser` protege as API keys
- **Chat UI** — um chat completo que é seu: `npx shadcn-vue add https://vue-llm.js.org/r/chat.json`, além dos headless `usePromptInput` e `useAutoScroll`
- **Vue DevTools** — uma aba LLM com todos os chats, linha do tempo das requisições, tempo até o primeiro token, chamadas de ferramentas e uso de tokens (`vue-llm/devtools`)
- **Módulo Nuxt** — auto-imports, componentes, DevTools em desenvolvimento, runtime config no servidor
- **Zero dependências de runtime** — só `vue` como peer dependency (Vue 3.3+, composables também no Vue 2.7)
- **TypeScript** — type safety completo, tipos exportados

## Início rápido

```bash
npm install vue-llm
```

```vue
<script setup>
import { useChat } from 'vue-llm'
import { createOpenAI } from 'vue-llm/providers'

const ai = createOpenAI({
  apiKey: 'sk-...',
  dangerouslyAllowBrowser: true, // only for prototyping
})

const { messages, input, handleSubmit, isLoading } = useChat({
  provider: ai,
  model: 'gpt-4o',
})
</script>

<template>
  <div v-for="msg in messages" :key="msg.id">
    <strong>{{ msg.role }}:</strong>
    <span v-for="(part, i) in msg.parts" :key="i">
      <template v-if="part.type === 'text'">{{ part.text }}</template>
    </span>
  </div>

  <form @submit.prevent="handleSubmit">
    <input v-model="input" placeholder="Ask something..." />
    <button :disabled="isLoading">Send</button>
  </form>
</template>
```

## Provedores

### OpenAI

```ts
import { createOpenAI } from 'vue-llm/providers'

const ai = createOpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})
```

### Anthropic

```ts
import { createAnthropic } from 'vue-llm/providers'

const ai = createAnthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

const { messages, sendMessage } = useChat({
  provider: ai,
  model: 'claude-sonnet-4-5',
})
```

### Ollama (local)

```ts
import { createOllama } from 'vue-llm/providers'

const ai = createOllama() // localhost:11434 by default

const { messages, sendMessage } = useChat({
  provider: ai,
  model: 'llama3',
})
```

### No navegador (WebGPU)

```ts
import { CreateMLCEngine } from '@mlc-ai/web-llm' // npm i @mlc-ai/web-llm
import { createWebLLM } from 'vue-llm/providers'

const ai = createWebLLM({
  createEngine: CreateMLCEngine,
  onProgress: ({ progress }) => console.log(`${Math.round(progress * 100)}%`),
})

const { messages, sendMessage } = useChat({
  provider: ai,
  model: 'Llama-3.2-1B-Instruct-q4f16_1-MLC',
})
```

O modelo roda na GPU do usuário, e nada sai do dispositivo. Veja [Modelos no navegador](https://vue-llm.js.org/pt/guide/in-browser).

## Chamada de ferramentas

```ts
const { messages, sendMessage } = useChat({
  provider: ai,
  model: 'gpt-4o',
  tools: [
    {
      name: 'get_weather',
      description: 'Get weather for a city',
      parameters: {
        type: 'object',
        properties: {
          city: { type: 'string', description: 'City name' },
        },
        required: ['city'],
      },
    },
  ],
  onToolCall: async ({ toolName, args }) => {
    if (toolName === 'get_weather') {
      return { temperature: 22, condition: 'sunny' }
    }
  },
  maxToolRoundtrips: 3,
})
```

## Anexos

Passe objetos `File`, `FileList` ou `FilePart` para `sendMessage`. Os arquivos são lidos como data URLs e guardados como partes `file` na mensagem do usuário.

```vue
<script setup lang="ts">
const { messages, input, sendMessage } = useChat({ provider: ai, model: 'gpt-4o' })
const files = ref<FileList>()

async function submit() {
  await sendMessage({ text: input.value, files: files.value })
  input.value = ''
  files.value = undefined
}
</script>

<template>
  <input type="file" multiple @change="files = ($event.target as HTMLInputElement).files ?? undefined">
  <input v-model="input" @keydown.enter="submit">
</template>
```

URLs remotas também funcionam: `sendMessage({ files: { type: 'file', mediaType: 'image/png', url: 'https://…' } })`.

| Provedor | Imagens | PDF | Áudio | Texto | URLs remotas |
|----------|--------|-----|-------|------|-------------|
| OpenAI | ✓ | ✓ | wav, mp3 | inline como texto | só imagens |
| Anthropic | ✓ | ✓ | — | ✓ (document) | imagens, PDF |
| Google | ✓ | ✓ | ✓ | ✓ | URIs `fileData` |
| Ollama | ✓ | — | — | inline como texto | — |

Combinações não suportadas lançam um erro descritivo antes de a requisição ser enviada.

## Persistência

Passe um adapter de `storage` e um `id` estável — o histórico é restaurado na inicialização e salvo sempre que uma resposta termina.

```ts
import { useChat, createWebStorage } from 'vue-llm'

const { messages, setMessages, isRestored } = useChat({
  id: 'support-chat',
  provider: ai,
  model: 'gpt-4o',
  storage: createWebStorage(), // localStorage, key `vue-llm:chat:support-chat`
})

setMessages([]) // clears history and removes the stored entry
```

`createWebStorage({ prefix, storage: sessionStorage })` personaliza a chave e o backend; `createMemoryStorage()` é útil para testes. Qualquer objeto que implemente `ChatStorage` funciona, síncrono ou assíncrono:

```ts
const storage: ChatStorage = {
  load: id => fetch(`/api/chats/${id}`).then(r => r.json()),
  save: (id, messages) => fetch(`/api/chats/${id}`, { method: 'PUT', body: JSON.stringify(messages) }).then(() => {}),
  remove: id => fetch(`/api/chats/${id}`, { method: 'DELETE' }).then(() => {}),
}
```

Com storage assíncrono, `isRestored` fica `false` até o `load` resolver. Mensagens enviadas antes disso são mantidas — o histórico salvo não as sobrescreve. Erros de storage vão para o `onError`. Os anexos são salvos como data URLs, então arquivos grandes podem estourar a cota de ~5 MB do localStorage.

## Retentativas e rate limiting

```ts
import { wrapProvider, retryMiddleware, rateLimitMiddleware } from 'vue-llm'

const ai = wrapProvider(createOpenAI({ apiKey }), [
  retryMiddleware({ maxRetries: 3, initialDelay: 1000, maxDelay: 30_000 }),
  rateLimitMiddleware({ maxRequests: 20, interval: 60_000, maxConcurrent: 2 }),
])
```

O `retryMiddleware` reenvia a requisição em caso de 408, 409, 429, 5xx e erros de rede, com backoff exponencial (`initialDelay * factor^n`, com jitter), respeitando `Retry-After` / `retry-after-ms`. Passe `shouldRetry(error, attempt)` para personalizar e `onRetry` para observar. Só a requisição inicial é repetida — erros depois que o stream começou não são.

O `rateLimitMiddleware` enfileira as requisições no cliente: no máximo `maxRequests` por `interval` e `maxConcurrent` streams abertos (um slot é liberado quando o stream termina ou é cancelado). Abortar uma requisição na fila a rejeita imediatamente.

Os provedores lançam `LLMAPIError` com `status`, `provider`, `body`, `retryAfter` e `isRetryable`:

```ts
import { LLMAPIError } from 'vue-llm'

onError(error) {
  if (error instanceof LLMAPIError && error.status === 429) showToast('Slow down')
}
```

No servidor, o `createLLMHandler` pode limitar as requisições por cliente (identificado por `x-forwarded-for` / `x-real-ip` por padrão) e responde com `429` + `Retry-After`:

```ts
createLLMHandler({
  provider,
  rateLimit: { maxRequests: 10, interval: 60_000, key: req => req.headers.get('x-user-id') ?? 'anon' },
})
```

O limitador do servidor fica em memória, por instância — em deploys com várias instâncias, coloque um limitador compartilhado (por exemplo, baseado em Redis) na frente do handler.

## System prompt

```ts
const { messages, sendMessage } = useChat({
  provider: ai,
  model: 'gpt-4o',
  system: 'You are a helpful assistant that speaks like a pirate.',
})
```

O `system` também aceita um ref ou getter (no `useChat`, `useCompletion` e `useObject`) e é relido a cada requisição.

## Templates de prompt

Os nomes das variáveis são inferidos a partir da string do template, então variáveis ausentes ou com erro de digitação viram erros de tipo:

```ts
import { createPrompt, createChatPrompt, usePrompt } from 'vue-llm'

const translate = createPrompt('Translate {{ text }} to {{lang}}.', { defaults: { lang: 'English' } })

translate.render({ text: 'Hola' })          // 'Translate Hola to English.'
translate.render({ txt: 'Hola' })           // ✗ type error
translate.variables                         // ['text', 'lang']
```

Valores ausentes também lançam erro em runtime. Escape um placeholder com barra invertida: `\{{literal}}`.

Prompts reativos com `usePrompt`:

```ts
const lang = ref('French')
const system = usePrompt('Always reply in {{lang}}.', () => ({ lang: lang.value }))

const chat = useChat({ provider: ai, model: 'gpt-4o', system })
```

Templates com várias mensagens:

```ts
const tutor = createChatPrompt([
  { role: 'system', content: 'You are a {{level}} tutor.' },
  { role: 'user', content: 'Explain {{topic}}.' },
])

tutor.render({ level: 'patient', topic: 'recursion' })      // ChatMessage[] for provider.chat()
useChat({ provider: ai, model: 'gpt-4o', initialMessages: tutor.toUIMessages({ level: 'patient', topic: 'recursion' }) })
```

## Referência da API

### `useChat(options)`

Retorna uma interface de chat reativa.

**Opções:**

| Opção | Tipo | Descrição |
|--------|------|-------------|
| `provider` | `LLMProvider` | Instância do provedor (obrigatório) |
| `model` | `string` | ID do modelo (obrigatório) |
| `system` | `MaybeRefOrGetter<string>` | System prompt |
| `tools` | `ToolDefinition[]` | Ferramentas disponíveis |
| `onToolCall` | `(call) => unknown` | Handler das chamadas de ferramentas |
| `onFinish` | `(msg, ctx) => void` | Chamado quando a resposta termina |
| `onError` | `(error) => void` | Handler de erros |
| `maxToolRoundtrips` | `number` | Máximo de rodadas de chamadas de ferramentas (padrão: 5) |
| `storage` | `ChatStorage` | Salva e restaura as mensagens pelo `id` |

**Retorno:**

| Propriedade | Tipo | Descrição |
|----------|------|-------------|
| `messages` | `Ref<UIMessage[]>` | Mensagens do chat |
| `status` | `Ref<ChatStatus>` | `'ready' \| 'submitted' \| 'streaming' \| 'error'` |
| `error` | `Ref<Error \| undefined>` | Último erro |
| `input` | `Ref<string>` | Texto do input (v-model) |
| `isLoading` | `Ref<boolean>` | Se há uma requisição em andamento |
| `sendMessage` | `(text? \| { text?, files? }) => Promise` | Envia uma mensagem, opcionalmente com anexos |
| `stop` | `() => void` | Aborta o stream atual |
| `regenerate` | `() => Promise` | Remove a última mensagem do assistente e gera de novo |
| `setMessages` | `(msgs) => void` | Substitui o histórico de mensagens |
| `handleSubmit` | `(event?: Event) => void` | Handler de submit do formulário (envia `input.value`) |
| `clearError` | `() => void` | Limpa o estado de erro |
| `isRestored` | `Ref<boolean>` | `false` enquanto o storage assíncrono carrega |

## Módulo Nuxt

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['vue-llm/nuxt'],
  runtimeConfig: {
    vueLlm: {
      openaiApiKey: '',
      anthropicApiKey: '',
    },
  },
})
```

Os composables e as factories de provedores são importados automaticamente.

## Segurança

Os provedores lançam um erro se forem usados no navegador sem permissão explícita:

```ts
// This will throw in browser:
const ai = createOpenAI({ apiKey: 'sk-...' })

// Opt-in for prototyping only:
const ai = createOpenAI({
  apiKey: 'sk-...',
  dangerouslyAllowBrowser: true,
})
```

Em produção, faça proxy das chamadas à API pelo seu servidor ou use o módulo Nuxt com `runtimeConfig`.

## Formato das mensagens

As mensagens usam um formato baseado em partes para conteúdo rico:

```ts
interface UIMessage {
  id: string
  role: 'system' | 'user' | 'assistant'
  parts: UIMessagePart[]
  metadata?: Record<string, unknown>
  createdAt?: Date
}

type UIMessagePart =
  | { type: 'text'; text: string; state?: 'streaming' | 'done' }
  | { type: 'reasoning'; text: string; state?: 'streaming' | 'done' }
  | { type: 'tool-call'; toolCallId: string; toolName: string; args: unknown; state: 'streaming' | 'pending' | 'running' | 'result' | 'error'; result?: unknown; error?: string }
  | { type: 'file'; mediaType: string; url: string; filename?: string }
  | { type: 'source'; url: string; title?: string }
```

## Licença

MIT
