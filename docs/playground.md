---
title: Playground
---

# Playground

A real `useChat` running a model **in your browser** on WebGPU. No API key, no server, and nothing you type leaves this tab. The model downloads once and the browser caches it for later visits.

<ClientOnly>
  <WebLLMPlayground />
</ClientOnly>

## How it works

The playground is a short component built from the library's public API:

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

Swap `createWebLLM` for `createOpenAI`, `createAnthropic` or your own backend and the component stays the same. See [In-Browser Models](./guide/in-browser) for the full guide.
