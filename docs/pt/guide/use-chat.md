---
description: 'useChat: um composable Vue reativo para chat com LLMs via streaming, com abort, regenerate, anexos, chamadas de ferramentas, persistência e refs de status.'
---

# useChat

Chat multi-turn reativo e com streaming.

```ts
import { useChat } from 'vue-llm'

const {
  messages, input, status, error, isLoading,
  sendMessage, handleSubmit, regenerate, stop, setMessages, addToolResult, clearError, isRestored,
} = useChat({ provider: ai, model: 'gpt-4o' })
```

## Enviando mensagens {#sending-messages}

```ts
await sendMessage('Hello!')                       // explicit text
await sendMessage()                               // uses input.value and clears it
await sendMessage({ text: 'What is this?', files }) // with attachments
handleSubmit(event)                               // form submit helper
```

## Status

`status` é `'ready' | 'submitted' | 'streaming' | 'error'`. `isLoading` fica `true` enquanto o status é `submitted` ou `streaming`. Em caso de falha, `error` guarda o `Error` e `status` vira `'error'`; chame `clearError()` para resetar.

```vue
<p v-if="status === 'submitted'">Thinking…</p>
<p v-if="error">{{ error.message }} <button @click="regenerate">Retry</button></p>
```

## Renderizando as partes {#rendering-parts}

```vue
<template v-for="(part, i) in msg.parts" :key="i">
  <p v-if="part.type === 'text'">{{ part.text }}</p>
  <details v-else-if="part.type === 'reasoning'"><summary>Reasoning</summary>{{ part.text }}</details>
  <img v-else-if="part.type === 'file' && part.mediaType.startsWith('image/')" :src="part.url">
  <code v-else-if="part.type === 'tool-call'">{{ part.toolName }} → {{ part.state }}</code>
</template>
```

## Opções {#options}

| Opção | Tipo | Descrição |
|--------|------|-------------|
| `provider` | `LLMProvider` | Instância do provedor (obrigatório) |
| `model` | `string` | ID do modelo (obrigatório) |
| `id` | `string` | ID do chat — também é a chave no storage |
| `system` | `MaybeRefOrGetter<string>` | System prompt, relido a cada requisição |
| `initialMessages` | `UIMessage[]` | Histórico inicial |
| `body` | `MaybeRef<Record<string, unknown>>` | Opções extras do provedor mescladas em cada requisição |
| `providerOptions` | `Record<string, unknown>` | Opções estáticas do provedor (por exemplo, `maxTokens`) |
| `tools` | `ToolDefinition[]` | Ferramentas disponíveis |
| `onToolCall` | `(call) => unknown` | Executa as chamadas de ferramentas |
| `maxToolRoundtrips` | `number` | Máximo de rodadas de ferramentas por mensagem (padrão `5`) |
| `storage` | `ChatStorage` | Salva e restaura as mensagens |
| `onFinish` | `(message, { finishReason, usage }) => void` | Chamado após cada resposta |
| `onError` | `(error) => void` | Erros de stream e de storage |

## Retorno {#returns}

| Propriedade | Tipo | Descrição |
|----------|------|-------------|
| `messages` | `Ref<UIMessage[]>` | Histórico do chat |
| `input` | `Ref<string>` | Use com `v-model` |
| `status` | `Ref<ChatStatus>` | Status da requisição |
| `error` | `Ref<Error \| undefined>` | Último erro |
| `isLoading` | `Ref<boolean>` | Requisição em andamento |
| `isRestored` | `Ref<boolean>` | `false` enquanto o storage assíncrono carrega |
| `sendMessage` | `(input?) => Promise<void>` | Envia texto e/ou arquivos |
| `handleSubmit` | `(event?) => void` | Envia `input.value` |
| `regenerate` | `() => Promise<void>` | Descarta a última mensagem do assistente e roda de novo |
| `stop` | `() => void` | Aborta o stream atual |
| `setMessages` | `(msgs \| fn) => void` | Substitui o histórico (`[]` limpa o storage) |
| `addToolResult` | `({ toolCallId, result }) => void` | Fornece o resultado de uma ferramenta manualmente |
| `clearError` | `() => void` | Reseta o estado de erro |
