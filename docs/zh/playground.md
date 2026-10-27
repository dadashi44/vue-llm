---
description: '与完全在浏览器中通过 WebGPU 运行的 LLM 聊天，基于 vue-llm 的 useChat 构建。无需 API key，无需服务器。'
title: 在线体验
---

# 在线体验

这是一个真实的 `useChat`，模型通过 WebGPU **在你的浏览器中** 运行。无需 API key，无需服务器，你输入的内容不会离开当前标签页。模型只需下载一次，之后浏览器会将其缓存以供再次访问。

<ClientOnly>
  <WebLLMPlayground />
</ClientOnly>

## 工作原理 {#how-it-works}

这个在线体验是一个基于库公开 API 构建的简短组件：

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

将 `createWebLLM` 换成 `createOpenAI`、`createAnthropic` 或你自己的后端，组件代码保持不变。完整指南请参阅 [浏览器内模型](./guide/in-browser)。
