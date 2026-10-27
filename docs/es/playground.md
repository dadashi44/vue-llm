---
description: 'Chatea con un LLM que se ejecuta por completo en tu navegador sobre WebGPU, hecho con useChat de vue-llm. Sin API key y sin servidor.'
title: Playground
---

# Playground

Un `useChat` real ejecutando un modelo **en tu navegador** sobre WebGPU. Sin API key, sin servidor, y nada de lo que escribes sale de esta pestaña. El modelo se descarga una sola vez y el navegador lo guarda en caché para las próximas visitas.

<ClientOnly>
  <WebLLMPlayground />
</ClientOnly>

## Cómo funciona {#how-it-works}

El playground es un componente corto construido con la API pública de la librería:

```ts
import { CreateWebWorkerMLCEngine } from '@mlc-ai/web-llm'
import { useChat } from 'vue-llm'
import { createWebLLM } from 'vue-llm/providers'

const ai = createWebLLM({
  createEngine: (model, engineConfig, chatOptions) => CreateWebWorkerMLCEngine(
    new Worker(new URL('./webllm.worker.ts', import.meta.url), { type: 'module' }),
    model, engineConfig, chatOptions,
  ),
  onProgress: ({ progress, text }) => { /* drive a progress bar */ },
})

const model = ref('SmolLM2-360M-Instruct-q4f16_1-MLC')
const { messages, input, handleSubmit, stop } = useChat({ provider: ai, model })
```

Cambia `createWebLLM` por `createOpenAI`, `createAnthropic` o tu propio backend y el componente sigue igual. Consulta [Modelos en el navegador](./guide/in-browser) para la guía completa.
