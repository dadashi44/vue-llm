---
description: 'Salve e restaure o histórico de chats de IA em Vue com localStorage, sessionStorage ou qualquer backend assíncrono por meio da opção storage.'
---

# Persistência

Passe um adapter de `storage` e um `id` estável. O histórico é restaurado quando o `useChat` é criado e salvo sempre que uma resposta termina (não a cada token recebido via streaming).

```ts
import { useChat, createWebStorage } from 'vue-llm'

const { messages, setMessages, isRestored } = useChat({
  id: 'support-chat',
  provider: ai,
  model: 'gpt-4o',
  storage: createWebStorage(), // localStorage key: vue-llm:chat:support-chat
})

setMessages([]) // clears history and removes the stored entry
```

## Adapters nativos {#built-in-adapters}

| Adapter | Descrição |
|---------|-------------|
| `createWebStorage({ prefix?, storage? })` | `localStorage` por padrão; passe `sessionStorage` ou qualquer `Storage`. Não faz nada durante o SSR. |
| `createMemoryStorage()` | Map em memória, útil para testes |

## Adapters customizados {#custom-adapters}

Implemente `ChatStorage` — os métodos podem ser síncronos ou assíncronos:

```ts
import type { ChatStorage } from 'vue-llm'

const apiStorage: ChatStorage = {
  load: id => fetch(`/api/chats/${id}`).then(r => (r.ok ? r.json() : null)),
  save: (id, messages) => fetch(`/api/chats/${id}`, { method: 'PUT', body: JSON.stringify(messages) }).then(() => {}),
  remove: id => fetch(`/api/chats/${id}`, { method: 'DELETE' }).then(() => {}),
}
```

Com storage assíncrono, `isRestored` fica `false` até o `load` resolver:

```vue
<Spinner v-if="!isRestored" />
```

Mensagens enviadas antes de o carregamento terminar são mantidas — o histórico salvo nunca as sobrescreve. Erros de storage vão para o `onError`.

::: warning
Os anexos são salvos como data URLs. Arquivos grandes podem estourar a cota de ~5 MB do `localStorage` — use um backend assíncrono para chats com muitos arquivos.
:::
