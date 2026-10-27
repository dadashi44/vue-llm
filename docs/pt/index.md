---
layout: home

hero:
  name: vue-llm
  text: O AI SDK que faltava para Vue
  tagline: Chat com streaming, Generative UI e modelos no navegador como composables Vue — para OpenAI, Anthropic, Gemini, Ollama e WebGPU.
  actions:
    - theme: brand
      text: Começar
      link: /pt/guide/getting-started
    - theme: alt
      text: Experimente no navegador
      link: /pt/playground
    - theme: alt
      text: Referência da API
      link: /pt/api/

features:
  - title: Composables reativos
    details: useChat, useCompletion e useObject com streaming, abort, regenerate e refs de status.
  - title: Vários provedores
    details: OpenAI, Anthropic, Google Gemini e Ollama atrás de uma única interface LLMProvider.
  - title: Modelos no navegador
    details: Rode Llama, Qwen ou SmolLM em WebGPU com createWebLLM — sem API key, sem servidor, nada sai da aba.
  - title: Generative UI
    details: Renderize chamadas de ferramentas como seus próprios componentes Vue, faça streaming dos argumentos e deixe o usuário confirmar ações.
  - title: Chamada de ferramentas
    details: Ferramentas com execute rodam automaticamente; chamadas human-in-the-loop ficam pausadas até o addToolResult.
  - title: Anexos
    details: Imagens, PDFs, áudio e arquivos de texto, convertidos para o formato de cada provedor.
  - title: Persistência
    details: Restaure o histórico do chat do localStorage ou de qualquer backend síncrono ou assíncrono.
  - title: Resiliente
    details: Retentativas com backoff exponencial e rate limiting no cliente e no servidor.
  - title: Templates de prompt
    details: "{{variables}} inferidas no nível de tipos, templates de chat e usePrompt reativo."
  - title: Qualquer backend
    details: Ferramentas no servidor com createLLMHandler, ou conecte o useChat ao seu backend SSE existente com createSSEProvider.
  - title: Chat UI
    details: "Um chat completo que é seu: adicione com a CLI do shadcn-vue ou monte o seu sobre os headless usePromptInput e useAutoScroll."
  - title: DevTools
    details: Uma aba LLM no Vue DevTools com todos os chats, linha do tempo das requisições, tempo até o primeiro token, chamadas de ferramentas e uso de tokens.
  - title: Servidor e Nuxt
    details: Handler de requisições baseado em Web standards, provedor proxy e um módulo Nuxt com auto-imports.
---

## O que é o vue-llm? {#what-is-vue-llm}

O **vue-llm** é uma biblioteca TypeScript open source que adiciona recursos de IA e LLM a apps **Vue 3** e **Nuxt**. Ela oferece composables como `useChat`, que fazem streaming da saída do modelo para um estado reativo, provedores para **OpenAI, Anthropic Claude, Google Gemini, Ollama** e **modelos WebGPU no navegador**, além de componentes para **Generative UI**.

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

## Perguntas frequentes {#faq}

### O que é o vue-llm? {#what-is-vue-llm-1}

O vue-llm é uma biblioteca TypeScript open source que adiciona recursos de IA e LLM a apps Vue e Nuxt. Ela oferece composables como useChat, useCompletion e useObject, que fazem streaming da saída do modelo para um estado reativo, além de provedores para OpenAI, Anthropic, Google Gemini, Ollama e modelos WebGPU no navegador.

### Como criar um chat estilo ChatGPT em Vue? {#how-do-i-build-a-chatgpt-like-chat-in-vue}

Instale o vue-llm, crie um provedor (por exemplo, um proxy no servidor com createLLMHandler, ou createOpenAI no servidor) e chame useChat em um componente. Ele retorna messages, input, status e sendMessage reativos e faz streaming da resposta token a token.

### Dá para rodar um LLM no navegador sem API key? {#can-i-run-an-llm-in-the-browser-without-an-api-key}

Sim. O createWebLLM roda modelos abertos como Llama 3.2, Qwen e SmolLM na GPU do usuário via WebGPU. As requisições nunca saem do dispositivo e não é preciso servidor nem API key.

### O vue-llm funciona com Nuxt? {#does-vue-llm-work-with-nuxt}

Sim. Adicione 'vue-llm/nuxt' em modules no nuxt.config para importar automaticamente os composables e provedores e registrar os componentes de chat. O createLLMHandler transforma uma rota de servidor do Nuxt em um proxy seguro para o modelo.

### O vue-llm suporta Vue 2? {#does-vue-llm-support-vue-2}

Os composables (useChat, useCompletion, useObject, usePrompt) funcionam no Vue 2.7 e no Vue 3.3+. Os componentes exigem Vue 3.

### Qual a diferença entre o vue-llm e o Vercel AI SDK? {#how-is-vue-llm-different-from-the-vercel-ai-sdk}

O vue-llm foi feito pensando primeiro no Vue. Ele traz um módulo Nuxt, componentes Vue para Generative UI, um provedor WebGPU para modelos no navegador, suporte a Vue 2.7 nos composables e um provedor para backends Server-Sent Events já existentes, sem dependências de runtime além do Vue.

### O vue-llm é gratuito? {#is-vue-llm-free}

Sim. O vue-llm tem licença MIT e é gratuito para uso comercial.
