---
layout: home

hero:
  name: vue-llm
  text: AI SDK для Vue, которого не хватало
  tagline: Стриминговый чат, Generative UI и модели в браузере в виде Vue-композаблов — для OpenAI, Anthropic, Gemini, Ollama и WebGPU.
  actions:
    - theme: brand
      text: Начать
      link: /ru/guide/getting-started
    - theme: alt
      text: Попробовать в браузере
      link: /ru/playground
    - theme: alt
      text: Справочник API
      link: /ru/api/

features:
  - title: Реактивные композаблы
    details: useChat, useCompletion и useObject со стримингом, отменой, повторной генерацией и ref-ами статуса.
  - title: Несколько провайдеров
    details: OpenAI, Anthropic, Google Gemini и Ollama за единым интерфейсом LLMProvider.
  - title: Модели в браузере
    details: Запускайте Llama, Qwen или SmolLM на WebGPU через createWebLLM — без API-ключа и сервера, данные не покидают вкладку.
  - title: Generative UI
    details: Рендерите вызовы инструментов своими Vue-компонентами, стримьте их аргументы и запрашивайте у пользователя подтверждение действий.
  - title: Вызов инструментов
    details: Инструменты с execute выполняются автоматически; вызовы с участием человека ждут addToolResult.
  - title: Вложения
    details: Изображения, PDF, аудио и текстовые файлы в формате каждого провайдера.
  - title: Сохранение истории
    details: Восстановление истории чата из localStorage или любого синхронного/асинхронного хранилища.
  - title: Устойчивость
    details: Повторы с экспоненциальной задержкой, ограничение частоты запросов на клиенте и на сервере.
  - title: Шаблоны промптов
    details: "{{variables}}, выводимые на уровне типов, шаблоны чата и реактивный usePrompt."
  - title: Любой бэкенд
    details: Серверные инструменты в createLLMHandler или подключение useChat к вашему SSE-бэкенду через createSSEProvider.
  - title: Chat UI
    details: "Готовый чат, код которого принадлежит вам: добавьте его через shadcn-vue CLI или соберите свой на headless usePromptInput и useAutoScroll."
  - title: DevTools
    details: Вкладка LLM во Vue DevTools со всеми чатами, таймлайном запросов, временем до первого токена, вызовами инструментов и расходом токенов.
  - title: Сервер и Nuxt
    details: Обработчик запросов на веб-стандартах, прокси-провайдер и Nuxt-модуль с автоимпортами.
---

## Что такое vue-llm? {#what-is-vue-llm}

**vue-llm** — open-source библиотека на TypeScript, которая добавляет AI- и LLM-возможности в приложения на **Vue 3** и **Nuxt**. В ней есть композаблы вроде `useChat`, которые стримят ответ модели в реактивное состояние, провайдеры для **OpenAI, Anthropic Claude, Google Gemini, Ollama** и **моделей в браузере на WebGPU**, а также компоненты для **Generative UI**.

```vue
<script setup lang="ts">
import { useChat } from 'vue-llm'
import { createSSEProvider } from 'vue-llm/providers'

const { messages, input, handleSubmit, status } = useChat({
  provider: createSSEProvider({ url: '/api/chat' }), // API-ключ хранится на вашем сервере
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

## FAQ {#faq}

### Что такое vue-llm? {#what-is-vue-llm-1}

vue-llm — open-source библиотека на TypeScript, которая добавляет AI- и LLM-возможности в приложения на Vue и Nuxt. В ней есть композаблы useChat, useCompletion и useObject, которые стримят ответ модели в реактивное состояние, а также провайдеры для OpenAI, Anthropic, Google Gemini, Ollama и моделей в браузере на WebGPU.

### Как сделать чат в духе ChatGPT на Vue? {#how-do-i-build-a-chatgpt-like-chat-in-vue}

Установите vue-llm, создайте провайдер (например, серверный прокси через createLLMHandler или createOpenAI на сервере) и вызовите useChat в компоненте. Он возвращает реактивные messages, input, status и sendMessage и стримит ответ токен за токеном.

### Можно ли запустить LLM в браузере без API-ключа? {#can-i-run-an-llm-in-the-browser-without-an-api-key}

Да. createWebLLM запускает открытые модели — Llama 3.2, Qwen, SmolLM и другие — на GPU пользователя через WebGPU. Запросы не покидают устройство, сервер и API-ключ не нужны.

### Работает ли vue-llm с Nuxt? {#does-vue-llm-work-with-nuxt}

Да. Добавьте 'vue-llm/nuxt' в modules в nuxt.config — композаблы и провайдеры импортируются автоматически, а компоненты чата регистрируются. createLLMHandler превращает серверный маршрут Nuxt в безопасный прокси к модели.

### Поддерживает ли vue-llm Vue 2? {#does-vue-llm-support-vue-2}

Композаблы (useChat, useCompletion, useObject, usePrompt) работают на Vue 2.7 и Vue 3.3+. Компонентам нужен Vue 3.

### Чем vue-llm отличается от Vercel AI SDK? {#how-is-vue-llm-different-from-the-vercel-ai-sdk}

vue-llm создан в первую очередь для Vue. В него входят Nuxt-модуль, Vue-компоненты для Generative UI, WebGPU-провайдер для моделей в браузере, поддержка Vue 2.7 в композаблах и провайдер для существующих бэкендов на Server-Sent Events — и никаких runtime-зависимостей, кроме Vue.

### vue-llm бесплатный? {#is-vue-llm-free}

Да. vue-llm распространяется по лицензии MIT и бесплатен для коммерческого использования.
