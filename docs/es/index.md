---
layout: home

hero:
  name: vue-llm
  text: El AI SDK que le faltaba a Vue
  tagline: Chat con streaming, Generative UI y modelos en el navegador como composables de Vue — para OpenAI, Anthropic, Gemini, Ollama y WebGPU.
  actions:
    - theme: brand
      text: Empezar
      link: /es/guide/getting-started
    - theme: alt
      text: Pruébalo en el navegador
      link: /es/playground
    - theme: alt
      text: Referencia de la API
      link: /es/api/

features:
  - title: Composables reactivos
    details: useChat, useCompletion y useObject con streaming, cancelación, regeneración y refs de estado.
  - title: Varios proveedores
    details: OpenAI, Anthropic, Google Gemini y Ollama tras una única interfaz LLMProvider.
  - title: Modelos en el navegador
    details: Ejecuta Llama, Qwen o SmolLM sobre WebGPU con createWebLLM — sin API key, sin servidor y sin que nada salga de la pestaña.
  - title: Generative UI
    details: Renderiza las llamadas a herramientas como tus propios componentes Vue, haz streaming de sus argumentos y deja que el usuario confirme las acciones.
  - title: Llamadas a herramientas
    details: Las herramientas con execute se ejecutan solas; las llamadas con intervención humana se pausan hasta addToolResult.
  - title: Adjuntos
    details: Imágenes, PDF, audio y archivos de texto, adaptados al formato de cada proveedor.
  - title: Persistencia
    details: Restaura el historial del chat desde localStorage o cualquier backend síncrono o asíncrono.
  - title: Resiliente
    details: Reintentos con backoff exponencial y límites de peticiones en cliente y servidor.
  - title: Plantillas de prompts
    details: "{{variables}} inferidas a nivel de tipos, plantillas de chat y usePrompt reactivo."
  - title: Cualquier backend
    details: Herramientas de servidor en createLLMHandler, o conecta useChat a tu backend SSE existente con createSSEProvider.
  - title: Chat UI
    details: "Un chat completo que es tuyo: añádelo con la CLI de shadcn-vue o construye el tuyo sobre los headless usePromptInput y useAutoScroll."
  - title: DevTools
    details: Una pestaña LLM en Vue DevTools con cada chat, una línea de tiempo de peticiones, el tiempo hasta el primer token, las llamadas a herramientas y el consumo de tokens.
  - title: Servidor y Nuxt
    details: Manejador de peticiones basado en estándares web, proveedor proxy y un módulo de Nuxt con auto-imports.
---

## ¿Qué es vue-llm? {#what-is-vue-llm}

**vue-llm** es una librería open source en TypeScript que añade funciones de IA y LLM a apps de **Vue 3** y **Nuxt**. Ofrece composables como `useChat`, que hacen streaming de la salida del modelo a un estado reactivo, proveedores para **OpenAI, Anthropic Claude, Google Gemini, Ollama** y **modelos WebGPU en el navegador**, y componentes para **Generative UI**.

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

## Preguntas frecuentes {#faq}

### ¿Qué es vue-llm? {#what-is-vue-llm-1}

vue-llm es una librería open source en TypeScript que añade funciones de IA y LLM a apps de Vue y Nuxt. Ofrece composables como useChat, useCompletion y useObject, que hacen streaming de la salida del modelo a un estado reactivo, además de proveedores para OpenAI, Anthropic, Google Gemini, Ollama y modelos WebGPU en el navegador.

### ¿Cómo creo un chat tipo ChatGPT en Vue? {#how-do-i-build-a-chatgpt-like-chat-in-vue}

Instala vue-llm, crea un proveedor (por ejemplo, un proxy de servidor con createLLMHandler, o createOpenAI en el servidor) y llama a useChat en un componente. Devuelve messages, input, status y sendMessage reactivos, y hace streaming de la respuesta token a token.

### ¿Puedo ejecutar un LLM en el navegador sin API key? {#can-i-run-an-llm-in-the-browser-without-an-api-key}

Sí. createWebLLM ejecuta modelos abiertos como Llama 3.2, Qwen y SmolLM en la GPU del usuario mediante WebGPU. Las peticiones nunca salen del dispositivo y no hace falta servidor ni API key.

### ¿vue-llm funciona con Nuxt? {#does-vue-llm-work-with-nuxt}

Sí. Añade 'vue-llm/nuxt' a modules en nuxt.config para importar automáticamente los composables y proveedores y registrar los componentes de chat. createLLMHandler convierte una ruta de servidor de Nuxt en un proxy seguro hacia el modelo.

### ¿vue-llm es compatible con Vue 2? {#does-vue-llm-support-vue-2}

Los composables (useChat, useCompletion, useObject, usePrompt) funcionan en Vue 2.7 y Vue 3.3+. Los componentes requieren Vue 3.

### ¿En qué se diferencia vue-llm del Vercel AI SDK? {#how-is-vue-llm-different-from-the-vercel-ai-sdk}

vue-llm está pensado para Vue desde el principio. Incluye un módulo de Nuxt, componentes Vue para Generative UI, un proveedor WebGPU para modelos en el navegador, compatibilidad con Vue 2.7 en sus composables y un proveedor para backends Server-Sent Events existentes, sin dependencias en tiempo de ejecución aparte de Vue.

### ¿vue-llm es gratis? {#is-vue-llm-free}

Sí. vue-llm tiene licencia MIT y es gratis para uso comercial.
