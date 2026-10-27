---
description: 'Converse com um LLM rodando inteiramente no seu navegador em WebGPU, feito com o useChat do vue-llm. Sem API key e sem servidor.'
title: Playground
---

<TokenStreamHero title="Playground" />

Um `useChat` de verdade rodando um modelo **no seu navegador** em WebGPU. Sem API key, sem servidor, e nada do que você digita sai desta aba. O modelo é baixado uma vez e o navegador o guarda em cache para as próximas visitas.

<ClientOnly>
  <WebLLMPlayground />
</ClientOnly>

## Como funciona {#how-it-works}

O playground é um componente curto feito com a API pública da biblioteca:

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

Troque `createWebLLM` por `createOpenAI`, `createAnthropic` ou pelo seu próprio backend e o componente continua igual. Veja [Modelos no navegador](./guide/in-browser) para o guia completo.
