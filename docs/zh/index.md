---
layout: home

hero:
  name: vue-llm
  text: Vue 缺失的那款 AI SDK
  tagline: 以 Vue 组合式函数提供流式聊天、生成式 UI 与浏览器内模型，支持 OpenAI、Anthropic、Gemini、Ollama 和 WebGPU。
  actions:
    - theme: brand
      text: 快速开始
      link: /zh/guide/getting-started
    - theme: alt
      text: 在浏览器中体验
      link: /zh/playground
    - theme: alt
      text: API 参考
      link: /zh/api/

features:
  - title: 响应式组合式函数
    details: useChat、useCompletion 与 useObject，支持流式输出、中止、重新生成以及状态 ref。
  - title: 多提供方
    details: OpenAI、Anthropic、Google Gemini 与 Ollama，统一在一个 LLMProvider 接口之后。
  - title: 浏览器内模型
    details: 使用 createWebLLM 在 WebGPU 上运行 Llama、Qwen 或 SmolLM，无需 API key，无需服务器，数据不会离开当前标签页。
  - title: 生成式 UI
    details: 用你自己的 Vue 组件渲染工具调用，流式展示参数，并让用户确认操作。
  - title: 工具调用
    details: 带 execute 的工具会自动执行；需要人工介入的调用会暂停，直到调用 addToolResult。
  - title: 附件
    details: 支持图片、PDF、音频和文本文件，并自动转换为各提供方所需的格式。
  - title: 持久化
    details: 从 localStorage 或任意同步/异步后端恢复聊天记录。
  - title: 稳定可靠
    details: 指数退避重试，以及客户端与服务端限流。
  - title: 提示词模板
    details: "在类型层面推断 {{variables}}，支持聊天模板和响应式的 usePrompt。"
  - title: 任意后端
    details: 在 createLLMHandler 中使用服务端工具，或通过 createSSEProvider 将 useChat 接入你现有的 SSE 后端。
  - title: 聊天界面
    details: "一套完全属于你的聊天界面：通过 shadcn-vue CLI 添加，或基于无头的 usePromptInput 和 useAutoScroll 自行构建。"
  - title: DevTools
    details: Vue DevTools 中的 LLM 标签页，展示所有聊天、请求时间线、首 token 时间、工具调用和 token 用量。
  - title: 服务端与 Nuxt
    details: 基于 Web 标准的请求处理器、代理提供方，以及支持自动导入的 Nuxt 模块。
---

## vue-llm 是什么？ {#what-is-vue-llm}

**vue-llm** 是一个开源 TypeScript 库，为 **Vue 3** 和 **Nuxt** 应用添加 AI 与 LLM 功能。它提供 `useChat` 等组合式函数，将模型输出以流式方式写入响应式状态；内置 **OpenAI、Anthropic Claude、Google Gemini、Ollama** 以及 **浏览器内 WebGPU 模型** 的提供方，并提供用于 **生成式 UI** 的组件。

```vue
<script setup lang="ts">
import { useChat } from 'vue-llm'
import { createSSEProvider } from 'vue-llm/providers'

const { messages, input, handleSubmit, status } = useChat({
  provider: createSSEProvider({ url: '/api/chat' }), // your server keeps the API key
  model: 'gpt-4o',
})
</script>

<template>
  <div v-for="m in messages" :key="m.id">{{ m.role }}: {{ m.parts.map(p => p.type === 'text' ? p.text : '').join('') }}</div>
  <form @submit="handleSubmit">
    <input v-model="input" :disabled="status === 'streaming'">
  </form>
</template>
```

## 常见问题 {#faq}

### vue-llm 是什么？ {#what-is-vue-llm-1}

vue-llm 是一个开源 TypeScript 库，为 Vue 和 Nuxt 应用添加 AI 与 LLM 功能。它提供 useChat、useCompletion 和 useObject 等组合式函数，将模型输出以流式方式写入响应式状态，并内置 OpenAI、Anthropic、Google Gemini、Ollama 以及浏览器内 WebGPU 模型的提供方。

### 如何在 Vue 中构建类似 ChatGPT 的聊天？ {#how-do-i-build-a-chatgpt-like-chat-in-vue}

安装 vue-llm，创建一个提供方（例如使用 createLLMHandler 搭建服务端代理，或在服务端使用 createOpenAI），然后在组件中调用 useChat。它会返回响应式的 messages、input、status 和 sendMessage，并逐 token 地流式输出回复。

### 能否在没有 API key 的情况下在浏览器中运行 LLM？ {#can-i-run-an-llm-in-the-browser-without-an-api-key}

可以。createWebLLM 通过 WebGPU 在用户的 GPU 上运行 Llama 3.2、Qwen 和 SmolLM 等开源模型。请求不会离开设备，也不需要服务器或 API key。

### vue-llm 能和 Nuxt 一起使用吗？ {#does-vue-llm-work-with-nuxt}

可以。在 nuxt.config 的 modules 中添加 'vue-llm/nuxt'，即可自动导入组合式函数和提供方，并注册聊天组件。createLLMHandler 可以把 Nuxt 服务端路由变成一个安全的模型代理。

### vue-llm 支持 Vue 2 吗？ {#does-vue-llm-support-vue-2}

组合式函数（useChat、useCompletion、useObject、usePrompt）支持 Vue 2.7 和 Vue 3.3+。组件需要 Vue 3。

### vue-llm 与 Vercel AI SDK 有什么不同？ {#how-is-vue-llm-different-from-the-vercel-ai-sdk}

vue-llm 以 Vue 为先。它提供 Nuxt 模块、用于生成式 UI 的 Vue 组件、用于浏览器内模型的 WebGPU 提供方、组合式函数对 Vue 2.7 的支持，以及适配现有 Server-Sent Events 后端的提供方，并且除 Vue 外没有任何运行时依赖。

### vue-llm 免费吗？ {#is-vue-llm-free}

是的。vue-llm 采用 MIT 许可，可免费用于商业用途。
