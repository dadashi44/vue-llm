---
description: 'Debug LLM calls in Vue DevTools: inspect every useChat, useCompletion and useObject, and see requests, time to first token, tool calls and token usage on a timeline.'
---

# DevTools

`vue-llm/devtools` adds an **LLM** tab to [Vue DevTools](https://devtools.vuejs.org). Use it to see what your app sends to the model, how long the model takes and how many tokens it uses, without `console.log`.

## Setup

```bash
npm i -D @vue/devtools-api
```

```ts
// main.ts
import { createApp } from 'vue'
import { LLMDevtools } from 'vue-llm/devtools'
import App from './App.vue'

const app = createApp(App)
if (import.meta.env.DEV) app.use(LLMDevtools)
app.mount('#app')
```

In **Nuxt** you don't need this: in development the module installs the plugin for you when `@vue/devtools-api` is available. Disable it with `vueLlm: { devtools: false }`.

Works with the Vue DevTools browser extension, the standalone app and `vite-plugin-vue-devtools`.

## Inspector

The **LLM** tab lists every live `useChat`, `useCompletion` and `useObject`, tagged with their status and model. Select one to see:

| Section | Contents |
|---------|----------|
| state | status, provider, model, last error |
| usage | requests, errors, prompt and completion tokens, last time to first token, duration and tokens/s |
| messages | the chat history, with tool calls, arguments and results |
| output | the current completion or partial object |

Hover a session for actions: **stop** generating and **clear** messages.

Pass `id` to a composable to tell sessions apart:

```ts
useChat({ id: 'support-chat', provider, model: 'gpt-4o' })
```

## Timeline

Every request is a group on the timeline:

```
request       openai · gpt-4o
first token   340 ms
tool: get_weather   {"city":"Oslo"}
finish        tool-calls · 910 ms · 512 tokens · 48 tok/s
```

Errors and aborted requests are highlighted. Select an event to see the messages sent, tool arguments and results, and usage.

::: tip Recording
Vue DevTools 7+ records a plugin's timeline only when it's switched on. Open **LLM → Timeline** and click the record toggle in the top-right corner.
:::

## Options

```ts
app.use(LLMDevtools, { logMessages: false })
```

| Option | Default | Description |
|--------|---------|-------------|
| `logMessages` | `true` | Attach the full message history to `request` events. Set `false` to log only the count. |

## Cost

Without the plugin, composables skip all instrumentation: no stream wrapping, no events and no extra objects. `@vue/devtools-api` is an optional peer dependency and only `vue-llm/devtools` imports it, so production bundles that don't use the plugin don't include it.
