---
description: 'Mantén las API keys de los LLM fuera del navegador: proxy de servidor, dangerouslyAllowBrowser, renderizado seguro de Markdown de la salida del modelo y límites de peticiones.'
---

# Seguridad

Los proveedores que necesitan una API key se niegan a ejecutarse en el navegador:

```ts
// Throws: "API keys must not be used in the browser…"
const ai = createOpenAI({ apiKey: 'sk-...' })
```

Actívalo solo para prototipos o entornos de confianza (p. ej., Electron o herramientas internas):

```ts
const ai = createOpenAI({ apiKey: 'sk-...', dangerouslyAllowBrowser: true })
```

## Configuración para producción {#production-setup}

Mantén las claves en el servidor y comunícate con él mediante un proveedor proxy:

```ts
// server: /api/chat
import { createLLMHandler } from 'vue-llm/server'
import { createOpenAI } from 'vue-llm/providers'

export const handler = createLLMHandler({
  provider: createOpenAI({ apiKey: process.env.OPENAI_API_KEY! }),
  model: 'gpt-4o',
  rateLimit: { maxRequests: 20, interval: 60_000 },
})
```

```ts
// client
import { createProxyProvider } from 'vue-llm/server'

const { messages, sendMessage } = useChat({ provider: createProxyProvider('/api/chat'), model: 'gpt-4o' })
```

Consulta [Servidor y proxy](./server) y [Nuxt](./nuxt).

::: tip
El manejador de servidor acepta `model` y `system` desde el cuerpo de la petición. Usa `onRequest` para fijarlos si los clientes no deben elegirlos.
:::
