---
description: 'Чат с LLM, которая целиком работает в вашем браузере на WebGPU, на основе useChat из vue-llm. Без API-ключа и без сервера.'
title: Песочница
---

<TokenStreamHero title="Песочница" />

Настоящий `useChat`, который запускает модель **прямо в вашем браузере** на WebGPU. Ни API-ключа, ни сервера, и ничего из того, что вы вводите, не покидает эту вкладку. Модель скачивается один раз, а браузер кэширует её для следующих визитов.

<ClientOnly>
  <WebLLMPlayground />
</ClientOnly>

## Как это работает {#how-it-works}

Песочница — небольшой компонент, собранный из публичного API библиотеки:

```ts
import { CreateWebWorkerMLCEngine } from '@mlc-ai/web-llm'
import { useChat } from 'vue-llm'
import { createWebLLM } from 'vue-llm/providers'

const ai = createWebLLM({
  createEngine: (model, engineConfig, chatOptions) => CreateWebWorkerMLCEngine(
    new Worker(new URL('./webllm.worker.ts', import.meta.url), { type: 'module' }),
    model, engineConfig, chatOptions,
  ),
  onProgress: ({ progress, text }) => { /* обновляем индикатор загрузки */ },
})

const model = ref('SmolLM2-360M-Instruct-q4f16_1-MLC')
const { messages, input, handleSubmit, stop } = useChat({ provider: ai, model })
```

Замените `createWebLLM` на `createOpenAI`, `createAnthropic` или свой бэкенд — компонент останется прежним. Подробности — в руководстве [Модели в браузере](./guide/in-browser).
