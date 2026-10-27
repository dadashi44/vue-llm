---
layout: home
head:
  - - script
    - type: application/ld+json
    - '{"@context": "https://schema.org", "@type": "FAQPage", "mainEntity": [{"@type": "Question", "name": "What is vue-llm?", "acceptedAnswer": {"@type": "Answer", "text": "vue-llm is an open-source TypeScript library that adds AI and LLM features to Vue and Nuxt apps. It provides composables such as useChat, useCompletion and useObject that stream model output into reactive state, plus providers for OpenAI, Anthropic, Google Gemini, Ollama and in-browser WebGPU models."}}, {"@type": "Question", "name": "How do I build a ChatGPT-like chat in Vue?", "acceptedAnswer": {"@type": "Answer", "text": "Install vue-llm, create a provider (for example a server proxy with createLLMHandler, or createOpenAI on the server) and call useChat in a component. It returns reactive messages, input, status and sendMessage, and streams the reply token by token."}}, {"@type": "Question", "name": "Can I run an LLM in the browser without an API key?", "acceptedAnswer": {"@type": "Answer", "text": "Yes. createWebLLM runs open models such as Llama 3.2, Qwen and SmolLM on the user''s GPU through WebGPU. Requests never leave the device and no server or API key is needed."}}, {"@type": "Question", "name": "Does vue-llm work with Nuxt?", "acceptedAnswer": {"@type": "Answer", "text": "Yes. Add ''vue-llm/nuxt'' to modules in nuxt.config to auto-import the composables and providers and register the chat components. createLLMHandler turns a Nuxt server route into a secure proxy for the model."}}, {"@type": "Question", "name": "Does vue-llm support Vue 2?", "acceptedAnswer": {"@type": "Answer", "text": "The composables (useChat, useCompletion, useObject, usePrompt) work on Vue 2.7 and Vue 3.3+. The components require Vue 3."}}, {"@type": "Question", "name": "How is vue-llm different from the Vercel AI SDK?", "acceptedAnswer": {"@type": "Answer", "text": "vue-llm is built for Vue first. It ships a Nuxt module, Vue components for Generative UI, a WebGPU provider for in-browser models, Vue 2.7 support for its composables and a provider for existing Server-Sent Events backends, with no runtime dependencies besides Vue."}}, {"@type": "Question", "name": "Is vue-llm free?", "acceptedAnswer": {"@type": "Answer", "text": "Yes. vue-llm is MIT licensed and free for commercial use."}}]}'

hero:
  name: vue-llm
  text: The missing AI SDK for Vue
  tagline: Streaming chat, Generative UI and in-browser models as Vue composables — for OpenAI, Anthropic, Gemini, Ollama and WebGPU.
  actions:
    - theme: brand
      text: Get Started
      link: /guide/getting-started
    - theme: alt
      text: Try it in your browser
      link: /playground
    - theme: alt
      text: API Reference
      link: /api/

features:
  - title: Reactive composables
    details: useChat, useCompletion and useObject with streaming, abort, regenerate and status refs.
  - title: Multi-provider
    details: OpenAI, Anthropic, Google Gemini and Ollama behind one LLMProvider interface.
  - title: In-browser models
    details: Run Llama, Qwen or SmolLM on WebGPU with createWebLLM — no API key, no server, nothing leaves the tab.
  - title: Generative UI
    details: Render tool calls as your own Vue components, stream their arguments and let the user confirm actions.
  - title: Tool calling
    details: Tools with execute run automatically; human-in-the-loop calls pause until addToolResult.
  - title: Attachments
    details: Images, PDFs, audio and text files, mapped to each provider's format.
  - title: Persistence
    details: Restore chat history from localStorage or any sync/async backend.
  - title: Resilient
    details: Retries with exponential backoff, client-side and server-side rate limiting.
  - title: Prompt templates
    details: "{{variables}} inferred at the type level, chat templates and reactive usePrompt."
  - title: Any backend
    details: Server-side tools in createLLMHandler, or plug useChat into your existing SSE backend with createSSEProvider.
  - title: Chat UI
    details: "A complete chat you own: add it with the shadcn-vue CLI, or build your own on the headless usePromptInput and useAutoScroll."
  - title: DevTools
    details: An LLM tab in Vue DevTools with every chat, a request timeline, time to first token, tool calls and token usage.
  - title: Server & Nuxt
    details: Web-standard request handler, proxy provider and a Nuxt module with auto-imports.
---

## What is vue-llm?

**vue-llm** is an open-source TypeScript library that adds AI and LLM features to **Vue 3** and **Nuxt** apps. It provides composables like `useChat` that stream model output into reactive state, providers for **OpenAI, Anthropic Claude, Google Gemini, Ollama** and **in-browser WebGPU models**, and components for **Generative UI**.

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

## FAQ

### What is vue-llm?

vue-llm is an open-source TypeScript library that adds AI and LLM features to Vue and Nuxt apps. It provides composables such as useChat, useCompletion and useObject that stream model output into reactive state, plus providers for OpenAI, Anthropic, Google Gemini, Ollama and in-browser WebGPU models.

### How do I build a ChatGPT-like chat in Vue?

Install vue-llm, create a provider (for example a server proxy with createLLMHandler, or createOpenAI on the server) and call useChat in a component. It returns reactive messages, input, status and sendMessage, and streams the reply token by token.

### Can I run an LLM in the browser without an API key?

Yes. createWebLLM runs open models such as Llama 3.2, Qwen and SmolLM on the user's GPU through WebGPU. Requests never leave the device and no server or API key is needed.

### Does vue-llm work with Nuxt?

Yes. Add 'vue-llm/nuxt' to modules in nuxt.config to auto-import the composables and providers and register the chat components. createLLMHandler turns a Nuxt server route into a secure proxy for the model.

### Does vue-llm support Vue 2?

The composables (useChat, useCompletion, useObject, usePrompt) work on Vue 2.7 and Vue 3.3+. The components require Vue 3.

### How is vue-llm different from the Vercel AI SDK?

vue-llm is built for Vue first. It ships a Nuxt module, Vue components for Generative UI, a WebGPU provider for in-browser models, Vue 2.7 support for its composables and a provider for existing Server-Sent Events backends, with no runtime dependencies besides Vue.

### Is vue-llm free?

Yes. vue-llm is MIT licensed and free for commercial use.

