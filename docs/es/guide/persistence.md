---
description: 'Guarda y restaura el historial de un chat de IA en Vue con localStorage, sessionStorage o cualquier backend asíncrono mediante la opción storage.'
---

# Persistencia

Pasa un adaptador `storage` y un `id` estable. El historial se restaura al crear `useChat` y se guarda cada vez que termina una respuesta (no con cada token del streaming).

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

## Adaptadores incluidos {#built-in-adapters}

| Adaptador | Descripción |
|---------|-------------|
| `createWebStorage({ prefix?, storage? })` | `localStorage` por defecto; pasa `sessionStorage` o cualquier `Storage`. No hace nada durante SSR. |
| `createMemoryStorage()` | Map en memoria, útil para tests |

## Adaptadores personalizados {#custom-adapters}

Implementa `ChatStorage`; los métodos pueden ser síncronos o asíncronos:

```ts
import type { ChatStorage } from 'vue-llm'

const apiStorage: ChatStorage = {
  load: id => fetch(`/api/chats/${id}`).then(r => (r.ok ? r.json() : null)),
  save: (id, messages) => fetch(`/api/chats/${id}`, { method: 'PUT', body: JSON.stringify(messages) }).then(() => {}),
  remove: id => fetch(`/api/chats/${id}`, { method: 'DELETE' }).then(() => {}),
}
```

Con almacenamiento asíncrono, `isRestored` sigue en `false` hasta que `load` se resuelve:

```vue
<Spinner v-if="!isRestored" />
```

Los mensajes enviados antes de que termine la carga se conservan: el historial guardado nunca los sobrescribe. Los errores de almacenamiento van a `onError`.

::: warning
Los adjuntos se guardan como data URLs. Los archivos grandes pueden superar la cuota de ~5 MB de `localStorage`; usa un backend asíncrono para chats con muchos archivos.
:::
